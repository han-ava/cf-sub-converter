// src/adapters/mihomo/hysteria2.ts
import { AdapterResult, ConversionWarning, Hysteria2Node } from '../../types';

export function adaptHysteria2ToMihomo(node: Hysteria2Node): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  if (!p.password) {
    return {
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 Hysteria 2 密码` }],
      unsupportedParams: ['password'],
      lossy: true,
      fatal: true
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'hysteria2',
    server: node.server,
    port: node.port,
    password: p.password,
    sni: p.sni || node.server,
    'skip-cert-verify': !!p.skipCertVerify,
    udp: node.udp !== false
  };

  if (p.ports) config.ports = p.ports;
  if (p.hopInterval) config['hop-interval'] = p.hopInterval;
  if (p.up) config.up = p.up;
  if (p.down) config.down = p.down;

  if (p.obfs) {
    config.obfs = p.obfs;
    if (p.obfsPassword) config['obfs-password'] = p.obfsPassword;
    if (p.obfsMinPacketSize) config['obfs-min-packet-size'] = p.obfsMinPacketSize;
    if (p.obfsMaxPacketSize) config['obfs-max-packet-size'] = p.obfsMaxPacketSize;
  }

  if (p.alpn) config.alpn = p.alpn;
  if (p.fingerprint) config['client-fingerprint'] = p.fingerprint;
  if (p.nameCertVerify) config['name-cert-verify'] = p.nameCertVerify;
  if (p.handshakeTimeout) config['handshake-timeout'] = p.handshakeTimeout;

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
