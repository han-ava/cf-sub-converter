// src/parsers/index.ts
import yaml from 'js-yaml';
import { NodeEnvelope } from '../types';
import { safeBase64Decode } from '../utils';

import { parseVless } from './vless';
import { parseVmess } from './vmess';
import { parseShadowsocks } from './shadowsocks';
import { parseHysteria2 } from './hysteria2';
import { parseAnyTLS } from './anytls';
import { parseTrojan } from './trojan';
import { parseTuic } from './tuic';
import { parseShadowsocksR } from './ssr';
import { parseClashProxy } from './clash';
import { parseSingboxOutbound } from './singbox';

export {
  parseVless,
  parseVmess,
  parseShadowsocks,
  parseHysteria2,
  parseAnyTLS,
  parseTrojan,
  parseTuic,
  parseShadowsocksR,
  parseClashProxy,
  parseSingboxOutbound
};

/**
 * 协议级关键参数合法性校验（避免生成残缺不可用的节点配置）
 */
export function isValidNode(node: NodeEnvelope | null): boolean {
  if (!node || !node.server || !node.port || isNaN(node.port) || node.port <= 0 || node.port > 65535) {
    return false;
  }

  // 若自带完整的 Clash/Singbox 结构，直接信任通过
  if (node.source.format === 'clash' || node.source.format === 'singbox') {
    return true;
  }

  const proto = (node.protocol || '').toLowerCase();
  const p: any = node.protocolData || {};

  if (proto === 'vless' || proto === 'vmess') {
    return !!(p.uuid || p.id);
  }

  if (proto === 'trojan' || proto === 'anytls') {
    return !!p.password;
  }

  if (proto === 'ss' || proto === 'shadowsocks') {
    return !!p.password || !!p.cipher;
  }

  if (proto === 'ssr' || proto === 'shadowsocksr') {
    return !!p.password;
  }

  if (proto === 'hysteria2' || proto === 'hy2' || proto === 'hysteria') {
    return !!p.password || !!p.uuid;
  }

  if (proto === 'tuic') {
    return !!p.uuid || !!p.password;
  }

  return true;
}

/**
 * 单条节点链接识别并解析
 */
export function parseSingleNode(link: string): NodeEnvelope | null {
  const trimmed = link.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  let node: NodeEnvelope | null = null;

  if (trimmed.startsWith('vless://')) node = parseVless(trimmed);
  else if (trimmed.startsWith('vmess://')) node = parseVmess(trimmed);
  else if (trimmed.startsWith('trojan://')) node = parseTrojan(trimmed);
  else if (trimmed.startsWith('ss://')) node = parseShadowsocks(trimmed);
  else if (trimmed.startsWith('ssr://')) node = parseShadowsocksR(trimmed);
  else if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) node = parseHysteria2(trimmed);
  else if (trimmed.startsWith('anytls://')) node = parseAnyTLS(trimmed);
  else if (trimmed.startsWith('tuic://')) node = parseTuic(trimmed);

  return isValidNode(node) ? node : null;
}

/**
 * 完整订阅内容解析（支持 Clash YAML、Sing-box JSON、Base64 订阅、多行链接）
 */
export async function parseContent(text: string): Promise<NodeEnvelope[]> {
  const nodes: NodeEnvelope[] = [];
  const trimmed = text.trim();
  if (!trimmed) return nodes;

  // 1. 尝试解析为 Clash YAML
  if (trimmed.includes('proxies:') && (trimmed.includes('name:') || trimmed.includes('server:'))) {
    try {
      const doc: any = yaml.load(trimmed);
      if (doc && Array.isArray(doc.proxies)) {
        for (const p of doc.proxies) {
          const node = parseClashProxy(p);
          if (isValidNode(node)) {
            nodes.push(node!);
          }
        }
        if (nodes.length > 0) return nodes;
      }
    } catch {}
  }

  // 2. 尝试解析为 Sing-Box JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const json = JSON.parse(trimmed);
      const outbounds = Array.isArray(json) ? json : json.outbounds;
      if (Array.isArray(outbounds)) {
        for (const ob of outbounds) {
          const node = parseSingboxOutbound(ob);
          if (isValidNode(node)) {
            nodes.push(node!);
          }
        }
        if (nodes.length > 0) return nodes;
      }
    } catch {}
  }

  // 3. 尝试作为多行链接直接解析
  const lines = trimmed.split(/[\r\n]+/);
  for (const line of lines) {
    const node = parseSingleNode(line);
    if (node) {
      nodes.push(node);
    }
  }

  if (nodes.length > 0) {
    return nodes;
  }

  // 4. 尝试 Base64 解码后解析 (递归调用，无缝支持 Base64 内嵌 YAML/JSON/多行)
  try {
    const decoded = safeBase64Decode(trimmed);
    if (decoded && decoded !== trimmed) {
      return await parseContent(decoded);
    }
  } catch {}

  return nodes;
}
