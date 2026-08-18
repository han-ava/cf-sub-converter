// src/adapters/mihomo/anytls.ts
import { AdapterResult, AnyTLSNode, ConversionWarning } from '../../types';

export function adaptAnyTLSToMihomo(node: AnyTLSNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  if (!p.password) {
    return {
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 AnyTLS 密码` }],
      unsupportedParams: ['password'],
      lossy: true,
      fatal: true
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'anytls',
    server: node.server,
    port: node.port,
    password: p.password,
    sni: p.sni || node.server,
    'skip-cert-verify': !!p.insecure,
    udp: node.udp !== false
  };

  if (p.alpn) config.alpn = p.alpn;
  if (p.fingerprint) config['client-fingerprint'] = p.fingerprint;
  if (p.nameCertVerify) config['name-cert-verify'] = p.nameCertVerify;
  if (p.clientMetadata) config['client-metadata'] = p.clientMetadata;
  if (p.idleSessionCheckInterval) config['idle-session-check-interval'] = p.idleSessionCheckInterval;
  if (p.idleSessionTimeout) config['idle-session-timeout'] = p.idleSessionTimeout;
  if (p.minIdleSession) config['min-idle-session'] = p.minIdleSession;

  if (p.shadowTlsOpts) config['shadow-tls-opts'] = p.shadowTlsOpts;
  if (p.restlsOpts) config['restls-opts'] = p.restlsOpts;
  if (p.jlsOpts) config['jls-opts'] = p.jlsOpts;

  // Mihomo 明确不支持 AnyTLS + Reality
  if (p.extras?.reality || p.extras?.pbk || p.extras?.['public-key']) {
    warnings.push({
      level: 'warn',
      field: 'reality',
      message: `Mihomo 官方明确不支持 AnyTLS 搭配 Reality，已自动忽略 Reality 伪装参数`
    });
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      if (k !== 'reality' && k !== 'pbk' && k !== 'public-key') {
        unsupportedParams.push(k);
        warnings.push({
          level: 'warn',
          field: k,
          message: `AnyTLS 扩展参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射`
        });
      }
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
