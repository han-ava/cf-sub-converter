// src/adapters/mihomo/anytls.ts
import { AdapterResult, AnyTLSNode, ConversionWarning } from '../../types';
import { parseALPN } from '../../utils';

export function adaptAnyTLSToMihomo(node: AnyTLSNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需凭据校验
  if (!p.password || !p.password.trim()) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 AnyTLS 密码`,
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 AnyTLS 密码` }],
      unsupportedParams: ['password']
    };
  }

  // Compatibility Gate: AnyTLS + Reality 互斥检查（Mihomo 官方明确不支持 AnyTLS + Reality）
  if (p.extras?.reality || p.extras?.pbk || p.extras?.['public-key']) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `Mihomo 官方明确不支持 AnyTLS 与 Reality 组合配置`,
      warnings: [{ level: 'fatal', field: 'reality', message: `Mihomo 官方明确不支持 AnyTLS 搭配 Reality` }],
      unsupportedParams: ['reality', 'pbk']
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'anytls',
    server: node.server,
    port: node.port,
    password: p.password.trim(),
    sni: p.sni || node.server,
    'skip-cert-verify': !!p.insecure,
    udp: node.udp !== false
  };

  const alpn = parseALPN(p.alpn);
  if (alpn && alpn.length > 0) {
    config.alpn = alpn;
  }

  if (p.fingerprint) config['client-fingerprint'] = p.fingerprint;
  if (p.nameCertVerify) config['name-cert-verify'] = p.nameCertVerify;
  if (p.clientMetadata) config['client-metadata'] = p.clientMetadata;
  if (p.idleSessionCheckInterval) config['idle-session-check-interval'] = p.idleSessionCheckInterval;
  if (p.idleSessionTimeout) config['idle-session-timeout'] = p.idleSessionTimeout;
  if (p.minIdleSession) config['min-idle-session'] = p.minIdleSession;

  if (p.shadowTlsOpts) config['shadow-tls-opts'] = p.shadowTlsOpts;
  if (p.restlsOpts) config['restls-opts'] = p.restlsOpts;
  if (p.jlsOpts) config['jls-opts'] = p.jlsOpts;

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({
        level: 'warn',
        field: k,
        message: `AnyTLS 扩展参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射`
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
