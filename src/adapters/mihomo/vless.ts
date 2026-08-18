// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';
import { parseALPN } from '../../utils';

const SUPPORTED_VLESS_TRANSPORTS = new Set([
  'tcp', 'ws', 'grpc', 'http', 'h2', 'xhttp', 'splithttp'
]);

/**
 * Mihomo xhttp-opts 白名单字段（来自官方文档 metacubex.one/en/config/proxies/transport）
 * 只列出 Mihomo 明确支持且不影响连接语义的非关键 extra 字段
 */
const XHTTP_ALLOWED_FIELDS = new Set([
  'no-grpc-header',
  'x-padding-bytes',
  'noGRPCHeader',
  'xPaddingBytes'
]);

// extra 中一旦出现这些关键连接语义字段，Mihomo 无法忠实表达 → fatal
const XHTTP_CRITICAL_EXTRA_FIELDS = new Set([
  'downloadSettings', 'download-settings',
  'reuseSettings', 'reuse-settings',
  'sessionPlacement', 'session-placement'
]);

function mapXhttpOpts(
  t: NonNullable<NonNullable<VlessNode['protocolData']>['transport']>,
  nodeName: string
): { opts: Record<string, unknown> } | { fatal: true; skipReason: string } {
  const opts: Record<string, unknown> = {};
  if (t.path) opts.path = t.path;
  if (t.headers?.Host) opts.host = t.headers.Host;
  if (t.mode) opts.mode = t.mode;

  const rawExtra = t.extra;
  if (rawExtra) {
    let extraObj: Record<string, unknown> | null = null;

    if (typeof rawExtra === 'string') {
      if (rawExtra.trim().startsWith('{')) {
        try {
          extraObj = JSON.parse(rawExtra);
        } catch {
          return {
            fatal: true,
            skipReason: `节点 [${nodeName}] XHTTP extra 字段 JSON 解析失败，无法安全映射到 Mihomo`
          };
        }
      } else {
        // 非 JSON 字符串无法分析是否含关键字段，但本身不影响连接 → 作为原始值透传并标记 warning
        opts['extra'] = rawExtra;
        return { opts };
      }
    } else if (typeof rawExtra === 'object' && rawExtra !== null) {
      extraObj = rawExtra as Record<string, unknown>;
    }

    if (extraObj) {
      const unknownCritical: string[] = [];
      const mappedExtra: Record<string, unknown> = {};

      for (const [k, v] of Object.entries(extraObj)) {
        if (XHTTP_ALLOWED_FIELDS.has(k)) {
          mappedExtra[k] = v;
        } else if (XHTTP_CRITICAL_EXTRA_FIELDS.has(k)) {
          unknownCritical.push(k);
        }
        // 非关键未知字段静默丢弃（无损失影响可接受）
      }

      if (unknownCritical.length > 0) {
        return {
          fatal: true,
          skipReason: `节点 [${nodeName}] XHTTP extra 中存在 Mihomo 未映射的关键连接参数: [${unknownCritical.join(', ')}]`
        };
      }

      if (Object.keys(mappedExtra).length > 0) {
        opts.extra = mappedExtra;
      }
    }
  }

  return { opts };
}

export function adaptVlessToMihomo(node: VlessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需凭据
  if (!p.uuid || !p.uuid.trim()) {
    return {
      fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VLESS UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: `缺少必需的 VLESS UUID` }],
      unsupportedParams: ['uuid']
    };
  }

  const isReality = p.security === 'reality' || !!p.realityOpts;
  const isTls = p.security === 'tls' || isReality;

  // Compatibility Gate: Reality 必须携带 pbk
  if (isReality && (!p.realityOpts?.publicKey || !p.realityOpts.publicKey.trim())) {
    return {
      fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 声明了 Reality 伪装但缺少必需的 pbk (Public Key)`,
      warnings: [{ level: 'fatal', field: 'reality-opts.public-key', message: `缺少必需的 Reality pbk` }],
      unsupportedParams: ['reality-opts.public-key']
    };
  }

  // Compatibility Gate: 不支持的传输层
  const transportType = (p.transport?.type || 'tcp').toLowerCase();
  if (!SUPPORTED_VLESS_TRANSPORTS.has(transportType)) {
    return {
      fatal: true, lossy: true, emitted: false,
      skipReason: `Mihomo 客户端不支持的 VLESS 传输层协议: [${transportType}]`,
      warnings: [{ level: 'fatal', field: 'transport.type', message: `不支持的传输协议: [${transportType}]` }],
      unsupportedParams: ['transport.type']
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'vless',
    server: node.server,
    port: node.port,
    uuid: p.uuid.trim(),
    tls: isTls,
    servername: p.sni || node.server,
    network: transportType,
    udp: node.udp !== false
  };

  if (p.flow) config.flow = p.flow;
  if (p.packetEncoding) config['packet-encoding'] = p.packetEncoding;
  if (p.encryption) config.encryption = p.encryption;
  if (p.fingerprint) config['client-fingerprint'] = p.fingerprint;

  const alpn = parseALPN(p.alpn);
  if (alpn && alpn.length > 0) config.alpn = alpn;
  if (p.skipCertVerify) config['skip-cert-verify'] = true;

  if (isReality && p.realityOpts?.publicKey) {
    config['reality-opts'] = {
      'public-key': p.realityOpts.publicKey.trim(),
      'short-id': p.realityOpts.shortId || '',
      'spider-x': p.realityOpts.spiderX || ''
    };
  }

  const t = p.transport;
  if (t) {
    const net = transportType;
    if (net === 'ws') {
      config['ws-opts'] = { path: t.path || '/', headers: t.headers || {} };
    } else if (net === 'grpc') {
      config['grpc-opts'] = { 'grpc-service-name': t.serviceName || '' };
    } else if (net === 'xhttp' || net === 'splithttp') {
      // P0-1: XHTTP extra → 白名单映射；关键字段无法表达则 fatal
      const xhttpResult = mapXhttpOpts(t, node.name);
      if ('fatal' in xhttpResult) {
        return {
          fatal: true, lossy: true, emitted: false,
          skipReason: xhttpResult.skipReason,
          warnings: [{ level: 'fatal', field: 'xhttp-opts.extra', message: xhttpResult.skipReason }],
          unsupportedParams: ['xhttp-opts.extra']
        };
      }
      config['xhttp-opts'] = xhttpResult.opts;
    } else if (net === 'http') {
      // P0-2: HTTP 与 H2 严格分离
      config['http-opts'] = {
        path: [t.path || '/'],
        headers: t.headers?.Host ? { Host: [t.headers.Host] } : undefined
      };
    } else if (net === 'h2') {
      config['h2-opts'] = {
        host: t.headers?.Host ? [t.headers.Host] : [node.server],
        path: t.path || '/'
      };
    }
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({ level: 'warn', field: k, message: `参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射` });
    }
  }

  return { config, fatal: false, lossy: unsupportedParams.length > 0, emitted: true, warnings, unsupportedParams };
}
