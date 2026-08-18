// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';
import { parseALPN } from '../../utils';

const SUPPORTED_VLESS_TRANSPORTS = new Set(['tcp', 'ws', 'grpc', 'http', 'h2', 'xhttp', 'splithttp']);

export function adaptVlessToMihomo(node: VlessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 关键连接凭据校验
  if (!p.uuid || !p.uuid.trim()) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VLESS UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 VLESS UUID` }],
      unsupportedParams: ['uuid']
    };
  }

  const isReality = p.security === 'reality' || !!p.realityOpts;
  const isTls = p.security === 'tls' || isReality;

  // Compatibility Gate: Reality 关键公钥校验
  if (isReality && (!p.realityOpts || !p.realityOpts.publicKey || !p.realityOpts.publicKey.trim())) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 声明了 Reality 伪装但缺少必需的 pbk (Public Key)`,
      warnings: [{ level: 'fatal', field: 'reality-opts.public-key', message: `节点 [${node.name}] 缺少必需的 Reality pbk` }],
      unsupportedParams: ['reality-opts.public-key']
    };
  }

  // Compatibility Gate: 传输协议完整性校验
  const transportType = (p.transport?.type || 'tcp').toLowerCase();
  if (!SUPPORTED_VLESS_TRANSPORTS.has(transportType)) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
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

  if (p.flow) {
    config.flow = p.flow;
  }

  if (p.packetEncoding) {
    config['packet-encoding'] = p.packetEncoding;
  }

  if (p.encryption) {
    config.encryption = p.encryption;
  }

  if (p.fingerprint) {
    config['client-fingerprint'] = p.fingerprint;
  }

  const alpn = parseALPN(p.alpn);
  if (alpn && alpn.length > 0) {
    config.alpn = alpn;
  }

  if (p.skipCertVerify) {
    config['skip-cert-verify'] = true;
  }

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
      config['ws-opts'] = {
        path: t.path || '/',
        headers: t.headers || {}
      };
    } else if (net === 'grpc') {
      config['grpc-opts'] = {
        'grpc-service-name': t.serviceName || ''
      };
    } else if (net === 'xhttp' || net === 'splithttp') {
      config['xhttp-opts'] = {
        path: t.path || '/',
        host: t.headers?.Host || undefined,
        mode: t.mode || undefined,
        extra: t.extra || undefined
      };
    } else if (net === 'http' || net === 'h2') {
      config['http-opts'] = {
        path: [t.path || '/'],
        headers: t.headers ? { Host: [t.headers.Host] } : undefined
      };
    }
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({
        level: 'warn',
        field: k,
        message: `参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射`
      });
    }
  }

  return {
    config,
    fatal: false,
    lossy: unsupportedParams.length > 0,
    emitted: true,
    warnings,
    unsupportedParams
  };
}
