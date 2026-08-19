// src/adapters/mihomo/anytls.ts
import { AdapterResult, AnyTLSNode, ConversionWarning } from '../../types';
import { parseALPN, detectUnmappedFields, processInvalidParams } from '../../utils';

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

  // Compatibility Gate: AnyTLS + Reality 互斥检查（Mihomo 官方明确不支持 AnyTLS + Reality，严格匹配所有 alias）
  const REALITY_ALIASES = [
    'reality', 'reality-opts', 'realityopts', 'reality_opts',
    'pbk', 'public-key', 'publickey', 'public_key',
    'sid', 'short-id', 'shortid', 'short_id',
    'spx', 'spider-x', 'spiderx', 'spider_x'
  ];
  const extrasKeys = Object.keys(p.extras || {}).map(k => k.toLowerCase());
  const hasRealityKey = REALITY_ALIASES.some(alias => extrasKeys.includes(alias));
  const hasSecurityReality = (typeof p.extras?.security === 'string' && p.extras.security.toLowerCase() === 'reality');

  if (hasRealityKey || hasSecurityReality) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `Mihomo 官方明确不支持 AnyTLS 与 Reality 组合配置`,
      warnings: [{ level: 'fatal', field: 'reality', message: `Mihomo 官方明确不支持 AnyTLS 搭配 Reality` }],
      unsupportedParams: ['reality', 'pbk']
    };
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['password', 'server', 'port']));
  if (invRes.fatal) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: invRes.fatalReason,
      warnings: invRes.warnings,
      unsupportedParams: invRes.unsupportedParams
    };
  }
  warnings.push(...invRes.warnings);
  unsupportedParams.push(...invRes.unsupportedParams);

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

  // 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
  const HANDLED_ANYTLS_PROTOCOL_KEYS = new Set([
    'password', 'sni', 'alpn', 'fingerprint', 'insecure', 'nameCertVerify',
    'clientMetadata', 'idleSessionCheckInterval', 'idleSessionTimeout',
    'minIdleSession', 'shadowTlsOpts', 'restlsOpts', 'jlsOpts', 'invalidParams', 'extras'
  ]);
  const unmapped = detectUnmappedFields(p as Record<string, unknown>, HANDLED_ANYTLS_PROTOCOL_KEYS);
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
