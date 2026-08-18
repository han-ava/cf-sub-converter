// src/adapters/mihomo/ssr.ts
import { AdapterResult, ShadowsocksRNode } from '../../types';

export function adaptShadowsocksRToMihomo(node: ShadowsocksRNode): AdapterResult {
  const p = node.protocolData;

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
    warnings: [],
    unsupportedParams: [],
    lossy: false,
    fatal: false
  };
}
