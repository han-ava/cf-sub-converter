// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';
import { parseALPN } from '../../utils';

const SUPPORTED_VLESS_TRANSPORTS = new Set([
  'tcp', 'ws', 'grpc', 'http', 'h2', 'xhttp', 'splithttp'
]);

/**
 * XHTTP extra 字段：camelCase → 官方 kebab-case 完整映射表
 * 来源：https://wiki.metacubex.one/en/config/proxies/transport/
 * extra JSON 中的 key → 直接展平到 xhttp-opts 的 kebab-case key
 */
const EXTRA_FIELD_MAP: Record<string, string> = {
  // 明确官方支持字段（camelCase 与 kebab-case 均接受）
  'no-grpc-header':          'no-grpc-header',
  'noGRPCHeader':            'no-grpc-header',
  'nogrpcheader':            'no-grpc-header',
  'x-padding-bytes':         'x-padding-bytes',
  'xPaddingBytes':           'x-padding-bytes',
  'x-padding-obfs-mode':     'x-padding-obfs-mode',
  'xPaddingObfsMode':        'x-padding-obfs-mode',
  'x-padding-key':           'x-padding-key',
  'xPaddingKey':             'x-padding-key',
  'x-padding-header':        'x-padding-header',
  'xPaddingHeader':          'x-padding-header',
  'x-padding-placement':     'x-padding-placement',
  'xPaddingPlacement':       'x-padding-placement',
  'x-padding-method':        'x-padding-method',
  'xPaddingMethod':          'x-padding-method',
  'uplink-http-method':      'uplink-http-method',
  'uplinkHttpMethod':        'uplink-http-method',
  'session-placement':       'session-placement',
  'sessionPlacement':        'session-placement',
  'session-key':             'session-key',
  'sessionKey':              'session-key',
  'session-table':           'session-table',
  'sessionTable':            'session-table',
  'session-length':          'session-length',
  'sessionLength':           'session-length',
  'seq-placement':           'seq-placement',
  'seqPlacement':            'seq-placement',
  'seq-key':                 'seq-key',
  'seqKey':                  'seq-key',
  'uplink-data-placement':   'uplink-data-placement',
  'uplinkDataPlacement':     'uplink-data-placement',
  'uplink-data-key':         'uplink-data-key',
  'uplinkDataKey':           'uplink-data-key',
  'uplink-chunk-size':       'uplink-chunk-size',
  'uplinkChunkSize':         'uplink-chunk-size',
  'sc-max-each-post-bytes':  'sc-max-each-post-bytes',
  'scMaxEachPostBytes':      'sc-max-each-post-bytes',
  'sc-min-posts-interval-ms':'sc-min-posts-interval-ms',
  'scMinPostsIntervalMs':    'sc-min-posts-interval-ms',
  'reuse-settings':          'reuse-settings',
  'reuseSettings':           'reuse-settings',
  'download-settings':       'download-settings',
  'downloadSettings':        'download-settings',
};

/**
 * XHTTP extra 解析：把 extra JSON 展平到 xhttp-opts 顶层，无 extra 子层。
 * 不认识的 key → unknown（静默丢弃，仅警告）
 * 解析失败 → fatal
 */
function applyXhttpExtra(
  rawExtra: string | object,
  opts: Record<string, unknown>,
  nodeName: string
): { fatal: true; skipReason: string } | null {

  let extraObj: Record<string, unknown> | null = null;

  if (typeof rawExtra === 'string') {
    const trimmed = rawExtra.trim();
    if (!trimmed.startsWith('{')) {
      // 非 JSON 不可分析，原样保存（不影响连接语义，仅丢 warning）
      // 不 fatal，由调用方添加 warning
      return null;
    }
    try {
      extraObj = JSON.parse(trimmed);
    } catch {
      return {
        fatal: true,
        skipReason: `节点 [${nodeName}] XHTTP extra 字段 JSON 解析失败，无法安全转换`
      };
    }
  } else if (typeof rawExtra === 'object' && rawExtra !== null) {
    extraObj = rawExtra as Record<string, unknown>;
  }

  if (!extraObj) return null;

  // 展平到 opts 顶层
  for (const [k, v] of Object.entries(extraObj)) {
    const mapped = EXTRA_FIELD_MAP[k];
    if (mapped) {
      opts[mapped] = v;
    }
    // 未识别字段静默丢弃（不影响连接语义）
  }
  return null;
}

export function adaptVlessToMihomo(node: VlessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Gate: 必需凭据
  if (!p.uuid || !p.uuid.trim()) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VLESS UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: '缺少必需的 VLESS UUID' }],
      unsupportedParams: ['uuid'] };
  }

  const isReality = p.security === 'reality' || !!p.realityOpts;
  const isTls = p.security === 'tls' || isReality;

  // Gate: Reality 必须携带 pbk
  if (isReality && (!p.realityOpts?.publicKey || !p.realityOpts.publicKey.trim())) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 声明了 Reality 但缺少必需的 pbk (Public Key)`,
      warnings: [{ level: 'fatal', field: 'reality-opts.public-key', message: '缺少必需的 Reality pbk' }],
      unsupportedParams: ['reality-opts.public-key'] };
  }

  const rawTransportType = (p.transport?.type || 'tcp').toLowerCase();

  // Gate: 不支持的传输层
  if (!SUPPORTED_VLESS_TRANSPORTS.has(rawTransportType)) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `Mihomo 不支持的 VLESS 传输协议: [${rawTransportType}]`,
      warnings: [{ level: 'fatal', field: 'transport.type', message: `不支持的传输协议: [${rawTransportType}]` }],
      unsupportedParams: ['transport.type'] };
  }

  // P0-3: splithttp 是 xhttp 的旧名/来源别名，统一 normalize
  const transportType = rawTransportType === 'splithttp' ? 'xhttp' : rawTransportType;

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
    } else if (net === 'xhttp') {
      // P0-1: 直接展平到 xhttp-opts 顶层，禁止生成 .extra 子层
      const xhttpOpts: Record<string, unknown> = {};
      if (t.path) xhttpOpts.path = t.path;
      if (t.headers?.Host) xhttpOpts.host = t.headers.Host;
      if (t.mode) xhttpOpts.mode = t.mode;

      if (t.extra) {
        if (typeof t.extra === 'string' && !t.extra.trim().startsWith('{')) {
          // 非 JSON 字符串（无法解析），降级 warning
          warnings.push({ level: 'warn', field: 'xhttp-opts.extra',
            message: `XHTTP extra 非 JSON 格式（"${t.extra.slice(0, 40)}"），已跳过` });
          unsupportedParams.push('xhttp-opts.extra');
        } else {
          const err = applyXhttpExtra(t.extra, xhttpOpts, node.name);
          if (err) {
            return { fatal: true, lossy: true, emitted: false,
              skipReason: err.skipReason,
              warnings: [{ level: 'fatal', field: 'xhttp-opts.extra', message: err.skipReason }],
              unsupportedParams: ['xhttp-opts.extra'] };
          }
        }
      }

      if (Object.keys(xhttpOpts).length > 0) config['xhttp-opts'] = xhttpOpts;
    } else if (net === 'http') {
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
      warnings.push({ level: 'warn', field: k,
        message: `参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射` });
    }
  }

  return { config, fatal: false, lossy: unsupportedParams.length > 0, emitted: true, warnings, unsupportedParams };
}
