// src/adapters/mihomo/tuic.ts
import { AdapterResult, ConversionWarning, TuicNode } from '../../types';

export function adaptTuicToMihomo(node: TuicNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  if (!p.uuid && !p.password) {
    return {
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 TUIC UUID 或密码` }],
      unsupportedParams: ['uuid'],
      lossy: true,
      fatal: true
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'tuic',
    server: node.server,
    port: node.port,
    uuid: p.uuid || '',
    password: p.password || '',
    sni: p.sni || node.server,
    'congestion-controller': p.congestionControl || 'bbr',
    'udp-relay-mode': p.udpRelayMode || 'native',
    alpn: p.alpn || ['h3'],
    'skip-cert-verify': !!p.skipCertVerify,
    udp: node.udp !== false
  };

  if (p.zeroRttHandshake !== undefined) {
    config['zero-rtt-handshake'] = p.zeroRttHandshake;
  }

  if (p.heartbeat !== undefined) {
    config.heartbeat = p.heartbeat;
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
