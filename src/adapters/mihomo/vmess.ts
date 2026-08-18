// src/adapters/mihomo/vmess.ts
import { AdapterResult, ConversionWarning, VmessNode } from '../../types';

export function adaptVmessToMihomo(node: VmessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  if (!p.uuid) {
    return {
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 VMess UUID` }],
      unsupportedParams: ['uuid'],
      lossy: true,
      fatal: true
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'vmess',
    server: node.server,
    port: node.port,
    uuid: p.uuid,
    alterId: p.alterId !== undefined ? p.alterId : 0,
    cipher: p.cipher || 'auto',
    tls: !!p.tls,
    servername: p.sni || node.server,
    network: p.transport?.type || 'tcp',
    udp: node.udp !== false
  };

  if (p.skipCertVerify) {
    config['skip-cert-verify'] = true;
  }

  if (p.fingerprint) {
    config['client-fingerprint'] = p.fingerprint;
  }

  if (p.alpn) {
    config.alpn = p.alpn;
  }

  if (p.packetEncoding) {
    config['packet-encoding'] = p.packetEncoding;
  }

  if (p.globalPadding !== undefined) {
    config['global-padding'] = p.globalPadding;
  }

  if (p.authenticatedLength !== undefined) {
    config['authenticated-length'] = p.authenticatedLength;
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
    } else if (net === 'http' || net === 'h2') {
      config['http-opts'] = {
        path: t.httpPath || (t.path ? [t.path] : ['/']),
        headers: t.httpHost ? { Host: t.httpHost } : undefined
      };
    }
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({
        level: 'warn',
        field: k,
        message: `参数 [${k}=${v}] 已保留在原始 VMess JSON 中，但 Mihomo 官方无对应字段映射`
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
