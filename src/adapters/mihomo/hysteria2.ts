// src/adapters/mihomo/hysteria2.ts
import { AdapterResult, ConversionWarning, Hysteria2Node } from '../../types';
import { parseALPN } from '../../utils';

const SUPPORTED_HY2_OBFS = new Set(['salamander']);

export function adaptHysteria2ToMihomo(node: Hysteria2Node): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需密码校验
  if (!p.password || !p.password.trim()) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 Hysteria 2 密码`,
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 Hysteria 2 密码` }],
      unsupportedParams: ['password']
    };
  }

  // Compatibility Gate: Obfs 混淆算法兼容性校验
  if (p.obfs && !SUPPORTED_HY2_OBFS.has(p.obfs.toLowerCase())) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `Mihomo 客户端不支持该 Hysteria 2 混淆类型: [${p.obfs}]`,
      warnings: [{ level: 'fatal', field: 'obfs', message: `不支持的 HY2 混淆类型: [${p.obfs}]` }],
      unsupportedParams: ['obfs']
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'hysteria2',
    server: node.server,
    port: node.port,
    password: p.password.trim(),
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

  const alpn = parseALPN(p.alpn);
  if (alpn && alpn.length > 0) {
    config.alpn = alpn;
  }

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
    fatal: false,
    lossy: unsupportedParams.length > 0,
    emitted: true,
    warnings,
    unsupportedParams
  };
}
