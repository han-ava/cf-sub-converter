// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';

export function adaptVlessToMihomo(node: VlessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  if (!p.uuid) {
    return {
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 VLESS UUID` }],
      unsupportedParams: ['uuid'],
      lossy: true,
      fatal: true
    };
  }

  const isReality = p.security === 'reality' || !!p.realityOpts;
  const isTls = p.security === 'tls' || isReality;

  const config: Record<string, any> = {
    name: node.name,
    type: 'vless',
    server: node.server,
    port: node.port,
    uuid: p.uuid,
    tls: isTls,
    servername: p.sni || node.server,
    network: p.transport?.type || 'tcp',
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

  if (p.alpn) {
    config.alpn = p.alpn;
  }

  if (p.skipCertVerify) {
    config['skip-cert-verify'] = true;
  }

  if (isReality && p.realityOpts?.publicKey) {
    config['reality-opts'] = {
      'public-key': p.realityOpts.publicKey,
      'short-id': p.realityOpts.shortId || '',
      'spider-x': p.realityOpts.spiderX || ''
    };
  }

  const t = p.transport;
  if (t) {
    const net = String(t.type || 'tcp').toLowerCase();
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
    warnings,
    unsupportedParams,
    lossy: unsupportedParams.length > 0,
    fatal: false
  };
}
