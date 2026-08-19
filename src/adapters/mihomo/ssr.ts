// src/adapters/mihomo/ssr.ts
import { AdapterResult, ConversionWarning, ShadowsocksRNode } from '../../types';
import { processInvalidParams } from '../../utils';

export function adaptShadowsocksRToMihomo(node: ShadowsocksRNode): AdapterResult {
  const p = node.protocolData;
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];

  if (!p.cipher || !p.password) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 ShadowsocksR 密码或加密算法`,
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 SSR 密码` }],
      unsupportedParams: ['password']
    };
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['password', 'cipher', 'server', 'port']));
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
    type: 'ssr',
    server: node.server,
    port: node.port,
    cipher: p.cipher || 'aes-128-cfb',
    password: p.password || '',
    protocol: p.protocol || 'origin',
    obfs: p.obfs || 'plain',
    'protocol-param': p.protoParam || '',
    'obfs-param': p.obfsParam || '',
    udp: node.udp !== false
  };

  return {
    config,
    fatal: false,
    lossy: unsupportedParams.length > 0,
    emitted: true,
    warnings,
    unsupportedParams
  };
}
