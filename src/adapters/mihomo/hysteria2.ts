// src/adapters/mihomo/hysteria2.ts
import { AdapterResult, ConversionWarning, Hysteria2Node } from '../../types';
import { parseALPN, detectUnmappedFields, normalizeSha256Fingerprint } from '../../utils';

const SUPPORTED_HY2_OBFS = new Set(['salamander', 'gecko']);

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

  const certFp = p.certificateFingerprint || p.fingerprint;
  if (certFp) {
    const norm = normalizeSha256Fingerprint(certFp);
    if (norm) config.fingerprint = norm;
  }
  if (p.nameCertVerify) config['name-cert-verify'] = p.nameCertVerify;
  if (p.handshakeTimeout) config['handshake-timeout'] = p.handshakeTimeout;

  // 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
  const HANDLED_HY2_PROTOCOL_KEYS = new Set([
    'password', 'ports', 'sni', 'alpn', 'skipCertVerify', 'certificateFingerprint', 'fingerprint',
    'obfs', 'obfsPassword', 'obfsMinPacketSize', 'obfsMaxPacketSize',
    'up', 'down', 'hopInterval', 'nameCertVerify', 'handshakeTimeout', 'extras'
  ]);
  const unmapped = detectUnmappedFields(p as Record<string, unknown>, HANDLED_HY2_PROTOCOL_KEYS);
  for (const item of unmapped) {
    unsupportedParams.push(item);
    warnings.push({
      level: 'warn',
      field: item,
      message: `参数 [${item}] 已被 Parser 解析，但当前适配器未对其建模映射 (known-but-unmapped)`
    });
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
