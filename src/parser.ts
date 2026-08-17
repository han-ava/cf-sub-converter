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

    const uuid = tryDecodeURIComponent(content.substring(0, atIndex));
    const rest = content.substring(atIndex + 1);

    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;
    
    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 1);
        port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 443;
      }
    } else {
      const parts = serverPortStr.split(':');
      server = parts[0] || '';
      port = parseInt(parts[1] || '443', 10) || 443;
    }

    if (!server || !uuid) return null;

    const type = (getUrlParam(urlStr, 'type') || 'tcp').toLowerCase();
    const security = (getUrlParam(urlStr, 'security') || 'none').toLowerCase();
    const packetEncoding =
      getUrlParam(urlStr, 'packetEncoding') ||
      getUrlParam(urlStr, 'packet-encoding') ||
      undefined;
    const encryption = getUrlParam(urlStr, 'encryption') || undefined;

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
      packetEncoding,
      encryption,
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

      if (serverPart.startsWith('[')) {
        const closingBracket = serverPart.indexOf(']');
        if (closingBracket !== -1) {
          server = serverPart.substring(1, closingBracket);
          const portPart = serverPart.substring(closingBracket + 1);
          portStr = portPart.startsWith(':') ? portPart.substring(1) : portPart;
        }
      }
      if (!server) {
        const colonIndex = serverPart.lastIndexOf(':');
        if (colonIndex === -1) return null;
        server = serverPart.substring(0, colonIndex);
        portStr = serverPart.substring(colonIndex + 1);
      }

      // userPart 可以是 Base64 编码的 (method:password)，也可以是明文 (method:password) 或含 URL 编码
      let decodedUser = safeBase64Decode(userPart);
      if (!decodedUser) {
        decodedUser = safeBase64Decode(tryDecodeURIComponent(userPart));
      }

      if (decodedUser && decodedUser.includes(':')) {
        const uParts = decodedUser.split(':');
        method = uParts[0] || '';
        password = tryDecodeURIComponent(uParts.slice(1).join(':'));
      } else {
        const decodedUserPart = tryDecodeURIComponent(userPart);
        if (decodedUserPart.includes(':')) {
          const uParts = decodedUserPart.split(':');
          method = uParts[0] || '';
          password = tryDecodeURIComponent(uParts.slice(1).join(':'));
        }
      }
    } else {
      const decoded = safeBase64Decode(raw) || safeBase64Decode(tryDecodeURIComponent(raw));
      if (!decoded) return null;
      const atIndex = decoded.lastIndexOf('@');
      if (atIndex === -1) return null;

      const userPart = decoded.substring(0, atIndex);
      const serverPart = decoded.substring(atIndex + 1);

      if (serverPart.startsWith('[')) {
        const closingBracket = serverPart.indexOf(']');
        if (closingBracket !== -1) {
          server = serverPart.substring(1, closingBracket);
          const portPart = serverPart.substring(closingBracket + 1);
          portStr = portPart.startsWith(':') ? portPart.substring(1) : portPart;
        }
      }
      if (!server) {
        const colonIndex = serverPart.lastIndexOf(':');
        if (colonIndex === -1) return null;
        server = serverPart.substring(0, colonIndex);
        portStr = serverPart.substring(colonIndex + 1);
      }

      const uParts = userPart.split(':');
      method = uParts[0] || '';
      password = tryDecodeURIComponent(uParts.slice(1).join(':'));
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
      password: tryDecodeURIComponent(password),
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
    const uuid = tryDecodeURIComponent(userPass[0] || '');
    const password = tryDecodeURIComponent(userPass[1] || '');

    const rest = raw.substring(atIndex + 1);
    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;

    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 1);
        port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 443;
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
 * 协议级关键参数合法性校验（避免生成残缺不可用的节点配置）
 */
export function isValidNode(node: ProxyNode | null): boolean {
  if (!node || !node.server || !node.port || isNaN(node.port) || node.port <= 0 || node.port > 65535) {
    return false;
  }

  // 若自带完整的上游对象且拥有有效服务器与端口，直接信任通过
  if (node.clashObj || node.singboxObj) {
    return true;
  }

  const type = node.type.toLowerCase();

  if (type === 'vless' || type === 'vmess') {
    return !!node.uuid;
  }

  if (type === 'trojan') {
    return !!node.password;
  }

  if (type === 'ss' || type === 'shadowsocks') {
    return !!node.password;
  }

  if (type === 'ssr' || type === 'shadowsocksr') {
    return !!node.password;
  }

  if (type === 'hysteria2' || type === 'hy2' || type === 'hysteria') {
    return !!node.password || !!node.uuid;
  }

  if (type === 'tuic') {
    return !!node.uuid || !!node.password;
  }

  return true;
}

/**
 * 单条节点链接识别并解析
 */
export function parseSingleNode(link: string): ProxyNode | null {
  const trimmed = link.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  let node: ProxyNode | null = null;

  if (trimmed.startsWith('vless://')) node = parseVless(trimmed);
  else if (trimmed.startsWith('vmess://')) node = parseVmess(trimmed);
  else if (trimmed.startsWith('trojan://')) node = parseTrojan(trimmed);
  else if (trimmed.startsWith('ss://')) node = parseShadowsocks(trimmed);
  else if (trimmed.startsWith('ssr://')) node = parseShadowsocksR(trimmed);
  else if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) node = parseHysteria2(trimmed);
  else if (trimmed.startsWith('tuic://')) node = parseTuic(trimmed);

  return isValidNode(node) ? node : null;
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
            const rawPass = p.password || p.secret || p.uuid;
            const password = rawPass ? tryDecodeURIComponent(String(rawPass)) : undefined;
            const uuid = p.uuid ? tryDecodeURIComponent(String(p.uuid)) : password;

            if (p.password) p.password = tryDecodeURIComponent(String(p.password));
            if (p.uuid) p.uuid = tryDecodeURIComponent(String(p.uuid));
            if (p.secret) p.secret = tryDecodeURIComponent(String(p.secret));

            const node: ProxyNode = {
              name: String(p.name),
              type: String(p.type || 'ss').toLowerCase(),
              server: String(p.server),
              port: Number(p.port),
              uuid,
              password,
              cipher: p.cipher || p.method || (String(p.type).toLowerCase() === 'ss' ? 'chacha20-ietf-poly1305' : undefined),
              network: p.network,
              tls: p.tls || p.ssl || (p['reality-opts'] ? true : false),
              sni: p.sni || p.servername || p['server-name'] || p.host,
              alpn: p.alpn,
              fingerprint: p['client-fingerprint'] || p.fingerprint,
              wsPath: p['ws-opts']?.path || p['ws-path'] || p.path,
              wsHeaders: p['ws-opts']?.headers || p['ws-headers'],
              flow: p.flow,
              packetEncoding: p['packet-encoding'] || p.packetEncoding || p['packet_encoding'],
              encryption: p.encryption,
              reality: p['reality-opts'] ? {
                publicKey: p['reality-opts']['public-key'] || p['reality-opts']['publicKey'],
                shortId: p['reality-opts']['short-id'] || p['reality-opts']['shortId'],
                spiderX: p['reality-opts']['spider-x'] || p['reality-opts']['spiderX']
              } : (p.reality ? {
                publicKey: p.reality['public-key'] || p.reality.publicKey,
                shortId: p.reality['short-id'] || p.reality.shortId,
                spiderX: p.reality['spider-x'] || p.reality.spiderX
              } : undefined),
              udp: p.udp !== false,
              clashObj: p
            };
            if (isValidNode(node)) {
              nodes.push(node);
            }
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
          if (ob && (ob.tag || ob.name) && ob.server && (ob.server_port || ob.port)) {
            const rawPass = ob.password || ob.uuid;
            const password = rawPass ? tryDecodeURIComponent(String(rawPass)) : undefined;
            const uuid = ob.uuid ? tryDecodeURIComponent(String(ob.uuid)) : password;

            if (ob.password) ob.password = tryDecodeURIComponent(String(ob.password));
            if (ob.uuid) ob.uuid = tryDecodeURIComponent(String(ob.uuid));

            const node: ProxyNode = {
              name: String(ob.tag || ob.name),
              type: String(ob.type || 'ss').toLowerCase(),
              server: String(ob.server),
              port: Number(ob.server_port || ob.port),
              uuid,
              password,
              cipher: ob.method || ob.cipher,
              network: ob.transport?.type,
              tls: ob.tls?.enabled !== false && !!ob.tls,
              sni: ob.tls?.server_name || ob.tls?.sni,
              alpn: ob.tls?.alpn,
              packetEncoding: ob.packet_encoding || ob['packet-encoding'] || ob.packetEncoding,
              udp: true,
              singboxObj: ob
            };
            if (isValidNode(node)) {
              nodes.push(node);
            }
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
