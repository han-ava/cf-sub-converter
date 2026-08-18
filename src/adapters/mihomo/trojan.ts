// src/adapters/mihomo/trojan.ts
import { AdapterResult, ConversionWarning, TrojanNode } from '../../types';
import { parseALPN } from '../../utils';

export function adaptTrojanToMihomo(node: TrojanNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需密码校验
  if (!p.password || !p.password.trim()) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 Trojan 密码`,
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 Trojan 密码` }],
      unsupportedParams: ['password']
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'trojan',
    server: node.server,
    port: node.port,
    password: p.password.trim(),
    sni: p.sni || node.server,
    'skip-cert-verify': !!p.skipCertVerify,
    network: p.transport?.type || 'tcp',
    udp: node.udp !== false
  };

  const alpn = parseALPN(p.alpn);
  config.alpn = alpn && alpn.length > 0 ? alpn : ['h2', 'http/1.1'];

  if (p.fingerprint) {
    config['client-fingerprint'] = p.fingerprint;
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
