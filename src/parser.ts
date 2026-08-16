// src/parser.ts
import yaml from 'js-yaml';
import { ProxyNode } from './types';
import { safeBase64Decode, tryDecodeURIComponent } from './utils';

function getUrlParam(urlStr: string, key: string): string {
  try {
    const regex = new RegExp(`[?&]${key}=([^&#]*)`, 'i');
    const match = urlStr.match(regex);
    return match && match[1] ? tryDecodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

// ----------------- 解析 VLESS -----------------
export function parseVless(urlStr: string): ProxyNode | null {
  try {
    const raw = urlStr.replace('vless://', '');
    const hashIndex = raw.indexOf('#');
    let name = 'VLESS Node';
    let content = raw;

    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1));
      content = raw.substring(0, hashIndex);
    }

    const atIndex = content.indexOf('@');
    if (atIndex === -1) return null;

    const uuid = content.substring(0, atIndex);
    const rest = content.substring(atIndex + 1);

    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;
    
    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 2);
        port = parseInt(portPart, 10) || 443;
      }
    } else {
      const parts = serverPortStr.split(':');
      server = parts[0] || '';
      port = parseInt(parts[1] || '443', 10) || 443;
    }

    if (!server || !uuid) return null;

    const type = (getUrlParam(urlStr, 'type') || 'tcp').toLowerCase();
    const security = (getUrlParam(urlStr, 'security') || 'none').toLowerCase();
    const flow = getUrlParam(urlStr, 'flow') || undefined;
    const sni = getUrlParam(urlStr, 'sni') || getUrlParam(urlStr, 'host') || server;
    const fp = getUrlParam(urlStr, 'fp') || 'chrome';
    const pbk = getUrlParam(urlStr, 'pbk');
    const sid = getUrlParam(urlStr, 'sid');
    const spx = getUrlParam(urlStr, 'spx');
    const path = getUrlParam(urlStr, 'path') || '/';
    const host = getUrlParam(urlStr, 'host') || '';
    const serviceName = getUrlParam(urlStr, 'serviceName');
    const alpnStr = getUrlParam(urlStr, 'alpn');
    const alpn = alpnStr ? alpnStr.split(',') : undefined;

    const isTls = security === 'tls' || security === 'reality';
    const isReality = security === 'reality' || !!pbk;

    const node: ProxyNode = {
      type: 'vless',
      name,
      server,
      port,
      uuid,
      network: type,
      tls: isTls,
      sni: isTls ? sni : undefined,
      fingerprint: isTls ? fp : undefined,
      alpn,
      flow,
      udp: true,
      raw: urlStr
    };

    if (type === 'ws') {
      node.wsPath = path;
      if (host) {
        node.wsHeaders = { Host: host };
      }
    } else if (type === 'grpc') {
      node.grpcServiceName = serviceName;
    }

    if (isReality && pbk) {
      node.reality = {
        publicKey: pbk,
        shortId: sid,
        spiderX: spx
      };
    }

    return node;
  } catch {
    return null;
  }
}

// ----------------- 解析 VMess -----------------
export function parseVmess(urlStr: string): ProxyNode | null {
  try {
    const raw = urlStr.replace('vmess://', '').trim();
    const decoded = safeBase64Decode(raw);
    if (!decoded) return null;

    const vmess = JSON.parse(decoded);
    const name = vmess.ps ? tryDecodeURIComponent(vmess.ps) : 'VMess Node';
    const server = vmess.add;
    const port = typeof vmess.port === 'number' ? vmess.port : parseInt(vmess.port, 10);
    const uuid = vmess.id;

    if (!server || !port || !uuid) return null;

    const net = (vmess.net || 'tcp').toLowerCase();
    const tls = vmess.tls === 'tls' || vmess.tls === true;
    const sni = vmess.sni || vmess.host || server;
    const fp = vmess.fp || 'chrome';
    const alpnStr = vmess.alpn;
    const alpn = alpnStr ? (Array.isArray(alpnStr) ? alpnStr : alpnStr.split(',')) : undefined;

    const node: ProxyNode = {
      type: 'vmess',
      name,
      server,
      port,
      uuid,
      cipher: vmess.scy || 'auto',
      network: net,
      tls,
      sni: tls ? sni : undefined,
      fingerprint: tls ? fp : undefined,
      alpn,
      udp: true,
      raw: urlStr
    };

    if (net === 'ws') {
      node.wsPath = vmess.path || '/';
      if (vmess.host) {
        node.wsHeaders = { Host: vmess.host };
      }
    } else if (net === 'grpc') {
      node.grpcServiceName = vmess.path || '';
    }

    return node;
  } catch {
    return null;
  }
}

// ----------------- 解析 Trojan -----------------
export function parseTrojan(urlStr: string): ProxyNode | null {
  try {
    const raw = urlStr.replace('trojan://', '');
    const hashIndex = raw.indexOf('#');
    let name = 'Trojan Node';
    let content = raw;

    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1));
      content = raw.substring(0, hashIndex);
    }

    const atIndex = content.indexOf('@');
    if (atIndex === -1) return null;

    const password = tryDecodeURIComponent(content.substring(0, atIndex));
    const rest = content.substring(atIndex + 1);

    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;

    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 2);
        port = parseInt(portPart, 10) || 443;
      }
    } else {
      const parts = serverPortStr.split(':');
      server = parts[0] || '';
      port = parseInt(parts[1] || '443', 10) || 443;
    }

    if (!server || !password) return null;

    const type = (getUrlParam(urlStr, 'type') || 'tcp').toLowerCase();
    const sni = getUrlParam(urlStr, 'sni') || getUrlParam(urlStr, 'peer') || server;
    const alpnStr = getUrlParam(urlStr, 'alpn');
    const alpn = alpnStr ? alpnStr.split(',') : undefined;
    const fp = getUrlParam(urlStr, 'fp') || 'chrome';
    const allowInsecure = getUrlParam(urlStr, 'allowInsecure') === '1' || getUrlParam(urlStr, 'insecure') === '1';

    const node: ProxyNode = {
      type: 'trojan',
      name,
      server,
      port,
      password,
      network: type,
      tls: true,
      sni,
      alpn,
      fingerprint: fp,
      skipCertVerify: allowInsecure,
      udp: true,
      raw: urlStr
    };

    if (type === 'ws') {
      node.wsPath = getUrlParam(urlStr, 'path') || '/';
      const host = getUrlParam(urlStr, 'host');
      if (host) {
        node.wsHeaders = { Host: host };
      }
    } else if (type === 'grpc') {
      node.grpcServiceName = getUrlParam(urlStr, 'serviceName');
    }

    return node;
  } catch {
    return null;
  }
}

// ----------------- 解析 Shadowsocks -----------------
export function parseShadowsocks(urlStr: string): ProxyNode | null {
  try {
    let raw = urlStr.replace('ss://', '');
    const hashIndex = raw.indexOf('#');
    let name = 'Shadowsocks Node';

    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1));
      raw = raw.substring(0, hashIndex);
    }

    if (raw.includes('?')) {
      raw = raw.split('?')[0] || '';
    }

    let method = '';
    let password = '';
    let server = '';
    let portStr = '';

    if (raw.includes('@')) {
      const atIndex = raw.lastIndexOf('@');
      const userPart = raw.substring(0, atIndex);
      const serverPart = raw.substring(atIndex + 1);

      const colonIndex = serverPart.lastIndexOf(':');
      if (colonIndex === -1) return null;
      server = serverPart.substring(0, colonIndex);
      portStr = serverPart.substring(colonIndex + 1);

      const decodedUser = safeBase64Decode(userPart);
      if (decodedUser && decodedUser.includes(':')) {
        const uParts = decodedUser.split(':');
        method = uParts[0] || '';
        password = uParts.slice(1).join(':');
      } else if (userPart.includes(':')) {
        const uParts = userPart.split(':');
        method = uParts[0] || '';
        password = uParts.slice(1).join(':');
      }
    } else {
      const decoded = safeBase64Decode(raw);
      if (!decoded) return null;
      const atIndex = decoded.lastIndexOf('@');
      if (atIndex === -1) return null;

      const userPart = decoded.substring(0, atIndex);
      const serverPart = decoded.substring(atIndex + 1);

      const colonIndex = serverPart.lastIndexOf(':');
      if (colonIndex === -1) return null;
      server = serverPart.substring(0, colonIndex);
      portStr = serverPart.substring(colonIndex + 1);

      const uParts = userPart.split(':');
      method = uParts[0] || '';
      password = uParts.slice(1).join(':');
    }

    if (!server || !portStr || !method || !password) return null;
    const port = parseInt(portStr, 10);
    if (isNaN(port)) return null;

    if (server.startsWith('[') && server.endsWith(']')) {
      server = server.slice(1, -1);
    }

    return {
      type: 'shadowsocks',
      name,
      server,
      port,
      cipher: method,
      password,
      udp: true,
      raw: urlStr
    };
  } catch {
    return null;
  }
}

// ----------------- 解析 ShadowsocksR -----------------
export function parseShadowsocksR(urlStr: string): ProxyNode | null {
  try {
    const raw = urlStr.replace('ssr://', '').trim();
    const decoded = safeBase64Decode(raw);
    if (!decoded) return null;

    // server:port:protocol:method:obfs:password_base64/?params
    const slashIndex = decoded.indexOf('/?');
    const mainPart = slashIndex !== -1 ? decoded.substring(0, slashIndex) : decoded;
    const queryPart = slashIndex !== -1 ? decoded.substring(slashIndex + 2) : '';

    const parts = mainPart.split(':');
    if (parts.length < 6) return null;

    const server = parts[0] || '';
    const port = parseInt(parts[1] || '0', 10);
    const protocol = parts[2] || 'origin';
    const cipher = parts[3] || '';
    const obfs = parts[4] || 'plain';
    const password = safeBase64Decode(parts.slice(5).join(':'));

    if (!server || !port || !cipher || !password) return null;

    let name = 'ShadowsocksR Node';
    let obfsParam = '';
    let protoParam = '';

    if (queryPart) {
      const qParams = new URLSearchParams(queryPart);
      const remarks = qParams.get('remarks');
      if (remarks) {
        name = safeBase64Decode(remarks) || tryDecodeURIComponent(remarks);
      }
      obfsParam = safeBase64Decode(qParams.get('obfsparam') || '') || qParams.get('obfsparam') || '';
      protoParam = safeBase64Decode(qParams.get('protoparam') || '') || qParams.get('protoparam') || '';
    }

    return {
      type: 'ssr',
      name,
      server,
      port,
      cipher,
      password,
      protocol,
      obfs,
      obfsParam,
      protoParam,
      udp: true,
      raw: urlStr
    };
  } catch {
    return null;
  }
}

// ----------------- 解析 Hysteria 2 -----------------
export function parseHysteria2(urlStr: string): ProxyNode | null {
  try {
    let raw = urlStr.replace(/^(?:hysteria2|hy2):\/\//i, '');
    const hashIndex = raw.indexOf('#');
    let name = 'Hysteria 2 Node';

    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1));
      raw = raw.substring(0, hashIndex);
    }

    const atIndex = raw.indexOf('@');
    if (atIndex === -1) return null;

    const password = tryDecodeURIComponent(raw.substring(0, atIndex));
    const rest = raw.substring(atIndex + 1);

    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;

    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 2);
        port = parseInt(portPart, 10) || 443;
      }
    } else {
      const parts = serverPortStr.split(':');
      server = parts[0] || '';
      port = parseInt(parts[1] || '443', 10) || 443;
    }

    if (!server || !password) return null;

    const sni = getUrlParam(urlStr, 'sni') || server;
    const obfs = getUrlParam(urlStr, 'obfs');
    const obfsPassword = getUrlParam(urlStr, 'obfs-password') || getUrlParam(urlStr, 'obfs_password');
    const insecure = getUrlParam(urlStr, 'insecure') === '1' || getUrlParam(urlStr, 'allowInsecure') === '1';

    return {
      type: 'hysteria2',
      name,
      server,
      port,
      password,
      tls: true,
      sni,
      obfs,
      obfsPassword,
      skipCertVerify: insecure,
      udp: true,
      raw: urlStr
    };
  } catch {
    return null;
  }
}

// ----------------- 解析 TUIC -----------------
export function parseTuic(urlStr: string): ProxyNode | null {
  try {
    let raw = urlStr.replace('tuic://', '');
    const hashIndex = raw.indexOf('#');
    let name = 'TUIC Node';

    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1));
      raw = raw.substring(0, hashIndex);
    }

    const atIndex = raw.indexOf('@');
    if (atIndex === -1) return null;

    const userPass = raw.substring(0, atIndex).split(':');
    const uuid = userPass[0] || '';
    const password = userPass[1] || '';

    const rest = raw.substring(atIndex + 1);
    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;

    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 2);
        port = parseInt(portPart, 10) || 443;
      }
    } else {
      const parts = serverPortStr.split(':');
      server = parts[0] || '';
      port = parseInt(parts[1] || '443', 10) || 443;
    }

    if (!server || !uuid) return null;

    const sni = getUrlParam(urlStr, 'sni') || server;
    const congestionControl = getUrlParam(urlStr, 'congestion_control') || 'bbr';
    const udpRelayMode = getUrlParam(urlStr, 'udp_relay_mode') || 'native';
    const alpnStr = getUrlParam(urlStr, 'alpn');
    const alpn = alpnStr ? alpnStr.split(',') : undefined;
    const insecure = getUrlParam(urlStr, 'allow_insecure') === '1' || getUrlParam(urlStr, 'insecure') === '1';

    return {
      type: 'tuic',
      name,
      server,
      port,
      uuid,
      password,
      tls: true,
      sni,
      alpn,
      congestionControl,
      udpRelayMode,
      skipCertVerify: insecure,
      udp: true,
      raw: urlStr
    };
  } catch {
    return null;
  }
}

/**
 * 单条节点链接识别并解析
 */
export function parseSingleNode(link: string): ProxyNode | null {
  const trimmed = link.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('vless://')) return parseVless(trimmed);
  if (trimmed.startsWith('vmess://')) return parseVmess(trimmed);
  if (trimmed.startsWith('trojan://')) return parseTrojan(trimmed);
  if (trimmed.startsWith('ss://')) return parseShadowsocks(trimmed);
  if (trimmed.startsWith('ssr://')) return parseShadowsocksR(trimmed);
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) return parseHysteria2(trimmed);
  if (trimmed.startsWith('tuic://')) return parseTuic(trimmed);

  return null;
}

/**
 * 完整订阅内容解析（支持 Clash YAML、Sing-box JSON、Base64 订阅、多行链接）
 */
export async function parseContent(text: string): Promise<ProxyNode[]> {
  const nodes: ProxyNode[] = [];
  const trimmed = text.trim();
  if (!trimmed) return nodes;

  // 1. 尝试解析为 Clash YAML
  if (trimmed.includes('proxies:') && (trimmed.includes('name:') || trimmed.includes('server:'))) {
    try {
      const doc: any = yaml.load(trimmed);
      if (doc && Array.isArray(doc.proxies)) {
        for (const p of doc.proxies) {
          if (p && p.name && p.server && p.port) {
            nodes.push({
              name: String(p.name),
              type: String(p.type || 'ss').toLowerCase(),
              server: String(p.server),
              port: Number(p.port),
              uuid: p.uuid,
              password: p.password,
              cipher: p.cipher,
              network: p.network,
              tls: p.tls,
              sni: p.sni || p.servername,
              alpn: p.alpn,
              fingerprint: p['client-fingerprint'] || p.fingerprint,
              wsPath: p['ws-opts']?.path || p['ws-path'],
              wsHeaders: p['ws-opts']?.headers || p['ws-headers'],
              flow: p.flow,
              reality: p['reality-opts'] ? {
                publicKey: p['reality-opts']['public-key'],
                shortId: p['reality-opts']['short-id'],
                spiderX: p['reality-opts']['spider-x']
              } : undefined,
              udp: p.udp !== false,
              clashObj: p
            });
          }
        }
        if (nodes.length > 0) return nodes;
      }
    } catch {}
  }

  // 2. 尝试解析为 Sing-Box JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json.outbounds)) {
        for (const ob of json.outbounds) {
          if (ob && ob.tag && ob.server && ob.server_port) {
            nodes.push({
              name: String(ob.tag),
              type: String(ob.type).toLowerCase(),
              server: String(ob.server),
              port: Number(ob.server_port),
              uuid: ob.uuid,
              password: ob.password,
              cipher: ob.method,
              network: ob.transport?.type,
              tls: ob.tls?.enabled,
              sni: ob.tls?.server_name,
              alpn: ob.tls?.alpn,
              udp: true,
              singboxObj: ob
            });
          }
        }
        if (nodes.length > 0) return nodes;
      }
    } catch {}
  }

  // 3. 尝试作为多行链接直接解析
  const lines = trimmed.split(/[\r\n]+/);
  let parsedFromLines = false;
  for (const line of lines) {
    const node = parseSingleNode(line);
    if (node) {
      nodes.push(node);
      parsedFromLines = true;
    }
  }

  if (parsedFromLines && nodes.length > 0) {
    return nodes;
  }

  // 4. 尝试 Base64 解码后解析
  try {
    const decoded = safeBase64Decode(trimmed);
    if (decoded && decoded !== trimmed) {
      const decodedLines = decoded.split(/[\r\n]+/);
      for (const line of decodedLines) {
        const node = parseSingleNode(line);
        if (node) {
          nodes.push(node);
        }
      }
    }
  } catch {}

  return nodes;
}
