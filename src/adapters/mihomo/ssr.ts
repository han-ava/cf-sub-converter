// src/adapters/mihomo/ssr.ts
import { AdapterResult, ShadowsocksRNode } from '../../types';

export function adaptShadowsocksRToMihomo(node: ShadowsocksRNode): AdapterResult {
  const p = node.protocolData;

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
    lossy: false,
    emitted: true,
    warnings: [],
    unsupportedParams: []
  };
}
