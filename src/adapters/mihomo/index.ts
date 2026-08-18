// src/adapters/mihomo/index.ts
import {
  AdapterResult,
  AnyTLSNode,
  GenericProxyNode,
  Hysteria2Node,
  NodeEnvelope,
  ShadowsocksNode,
  ShadowsocksRNode,
  TrojanNode,
  TuicNode,
  VlessNode,
  VmessNode
} from '../../types';

import { adaptVlessToMihomo } from './vless';
import { adaptVmessToMihomo } from './vmess';
import { adaptShadowsocksToMihomo } from './shadowsocks';
import { adaptHysteria2ToMihomo } from './hysteria2';
import { adaptAnyTLSToMihomo } from './anytls';
import { adaptTrojanToMihomo } from './trojan';
import { adaptTuicToMihomo } from './tuic';
import { adaptShadowsocksRToMihomo } from './ssr';
import { adaptOthersToMihomo } from './others';

export function nodeToClashProxy(node: NodeEnvelope): Record<string, any> | undefined {
  const res = adaptNodeToMihomo(node);
  return res.fatal ? undefined : res.config;
}

export function adaptNodeToMihomo(node: NodeEnvelope): AdapterResult {
  // Clash YAML 输入原样透传，除 name 和显式指定的 udp 覆盖外，协议配置 100% 不变
  if (node.source.format === 'clash') {
    const config: Record<string, any> = {
      ...node.protocolData,
      name: node.name
    };
    if (node.udp !== undefined) {
      config.udp = node.udp;
    }
    return {
      config,
      warnings: [],
      unsupportedParams: [],
      lossy: false,
      fatal: false
    };
  }

  switch (node.protocol) {
    case 'vless':
      return adaptVlessToMihomo(node as VlessNode);
    case 'vmess':
      return adaptVmessToMihomo(node as VmessNode);
    case 'ss':
    case 'shadowsocks':
      return adaptShadowsocksToMihomo(node as ShadowsocksNode);
    case 'hysteria2':
    case 'hy2':
    case 'hysteria':
      return adaptHysteria2ToMihomo(node as Hysteria2Node);
    case 'anytls':
      return adaptAnyTLSToMihomo(node as AnyTLSNode);
    case 'trojan':
      return adaptTrojanToMihomo(node as TrojanNode);
    case 'tuic':
      return adaptTuicToMihomo(node as TuicNode);
    case 'ssr':
    case 'shadowsocksr':
      return adaptShadowsocksRToMihomo(node as ShadowsocksRNode);
    default:
      return adaptOthersToMihomo(node as GenericProxyNode);
  }
}
