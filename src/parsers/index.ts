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
    return !!p.uuid || !!p.password || !!p.token;
  }

  return true;
}

/**
 * 单条节点链接识别并解析
 */
export function parseSingleNode(link: string): NodeEnvelope | null {
  const trimmed = link.replace(/^﻿/, '').trim().replace(/^["']|["']$/g, '');
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  // 如果包含换行符，说明是多行内容或订阅块，不是单节点链接
  if (trimmed.includes('\n') || trimmed.includes('\r')) return null;

  let node: NodeEnvelope | null = null;
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('vless://')) node = parseVless(trimmed);
  else if (lower.startsWith('vmess://')) node = parseVmess(trimmed);
  else if (lower.startsWith('trojan://')) node = parseTrojan(trimmed);
  else if (lower.startsWith('ss://')) node = parseShadowsocks(trimmed);
  else if (lower.startsWith('ssr://')) node = parseShadowsocksR(trimmed);
  else if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) node = parseHysteria2(trimmed);
  else if (lower.startsWith('anytls://')) node = parseAnyTLS(trimmed);
  else if (lower.startsWith('tuic://')) node = parseTuic(trimmed);
  else {
    // 兼容可能未经 scheme 包装的单行 Base64 节点或 Base64(URI) 格式
    try {
      const decoded = safeBase64Decode(trimmed);
      if (decoded && decoded !== trimmed) {
        const innerTrimmed = decoded.trim();
        // 严格限制为单行节点（不能包含换行）
        if (!innerTrimmed.includes('\n') && !innerTrimmed.includes('\r')) {
          const innerLower = innerTrimmed.toLowerCase();
          if (
            innerLower.startsWith('vless://') ||
            innerLower.startsWith('vmess://') ||
            innerLower.startsWith('trojan://') ||
            innerLower.startsWith('ss://') ||
            innerLower.startsWith('ssr://') ||
            innerLower.startsWith('hysteria2://') ||
            innerLower.startsWith('hy2://') ||
            innerLower.startsWith('anytls://') ||
            innerLower.startsWith('tuic://')
          ) {
            node = parseSingleNode(innerTrimmed);
          } else if (innerTrimmed.startsWith('{') && innerTrimmed.endsWith('}')) {
            node = parseVmess('vmess://' + trimmed);
          }
        }
      }
    } catch {}
  }

  return isValidNode(node) ? node : null;
}

/**
 * 完整订阅内容解析（支持 Clash YAML、Sing-box JSON、Base64 订阅、多行链接、混合内容解析）
 */
export async function parseContent(text: string, depth = 0): Promise<NodeEnvelope[]> {
  if (depth > 5) return [];
  const nodes: NodeEnvelope[] = [];
  const trimmed = text.replace(/^﻿/, '').trim();
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

  // 3. 尝试整段 Base64 解码解析 (针对标准的整段 Base64 订阅，包含 MIME 换行 Base64 等)
  let fullDecodedNodes: NodeEnvelope[] = [];
  try {
    const decoded = safeBase64Decode(trimmed);
    if (decoded && decoded !== trimmed && decoded.trim() !== trimmed) {
      fullDecodedNodes = await parseContent(decoded, depth + 1);
    }
  } catch {}

  // 4. 尝试按行逐行解析（支持多行 URI、混合单行 Base64 块等）
  const lineNodes: NodeEnvelope[] = [];
  const lines = trimmed.split(/[\r\n]+/);
  for (const line of lines) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed || lineTrimmed.startsWith('#') || lineTrimmed.startsWith('//')) continue;

    const node = parseSingleNode(lineTrimmed);
    if (node) {
      lineNodes.push(node);
    } else {
      // 若该单行不是标准 URI，尝试按 Base64 解码并提取可能的多节点
      try {
        const decodedLine = safeBase64Decode(lineTrimmed);
        if (decodedLine && decodedLine !== lineTrimmed) {
          const subNodes = await parseContent(decodedLine, depth + 1);
          if (subNodes.length > 0) {
            lineNodes.push(...subNodes);
          }
        }
      } catch {}
    }
  }

  // 择优采纳：若整段 Base64 解码提取的有效节点数大于等于逐行提取数，优先采用整段解析结果
  if (fullDecodedNodes.length >= lineNodes.length && fullDecodedNodes.length > 0) {
    return fullDecodedNodes;
  }

  if (lineNodes.length > 0) {
    return lineNodes;
  }

  return fullDecodedNodes;
}
