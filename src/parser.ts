// src/parser.ts
import { ProxyNode } from "./types";
import { safeBase64Decode, tryDecodeURIComponent } from "./utils";

function parsePluginParams(str: string): Record<string, string> {
  const params: Record<string, string> = {};
  str.split(';').forEach(p => {
    const [k, v] = p.split('=');
    if (k && v) params[k] = v;
  });
  return params;
}

// --- 解析 Shadowsocks ---
function parseShadowsocks(urlStr: string): ProxyNode | null {
  try {
    const getParam = (str: string, key: string) => {
        const regex = new RegExp(`[?&]${key}=([^&#]*)`, 'i');
        const match = str.match(regex);
        return match ? tryDecodeURIComponent(match[1]) : '';
    };

    let raw = urlStr.replace('ss://', '');
    const hashIndex = raw.indexOf('#');
    let name = 'Shadowsocks';
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1));
      raw = raw.substring(0, hashIndex);
    }
    if (raw.includes('?')) { raw = raw.split('?')[0]; }

    let method = ''; let password = ''; let server = ''; let portStr = '';
    
    if (raw.includes('@')) {
      const parts = raw.split('@');
      const serverPart = parts[parts.length - 1];
      const userPart = parts.slice(0, parts.length - 1).join('@');
      const lastColonIndex = serverPart.lastIndexOf(':');
      if (lastColonIndex === -1) return null;
      server = serverPart.substring(0, lastColonIndex);
      portStr = serverPart.substring(lastColonIndex + 1);
      if (server.startsWith('[') && server.endsWith(']')) server = server.slice(1, -1);
      try {
        const decoded = safeBase64Decode(userPart);
        if (decoded && decoded.includes(':')) { 
          const up = decoded.split(':'); method = up[0]; password = up.slice(1).join(':');
        } else { throw new Error('Not Base64'); }
      } catch (e) { const up = userPart.split(':'); method = up[0]; password = up.slice(1).join(':'); }
    } else {
      const decoded = safeBase64Decode(raw);
      if (!decoded) return null;
      const atIndex = decoded.lastIndexOf('@');
      if (atIndex === -1) return null;
      const userPart = decoded.substring(0, atIndex);
      const serverPart = decoded.substring(atIndex + 1);
      const lastColonIndex = serverPart.lastIndexOf(':');
      if (lastColonIndex === -1) return null;
      server = serverPart.substring(0, lastColonIndex);
      portStr = serverPart.substring(lastColonIndex + 1);
      if (server.startsWith('[') && server.endsWith(']')) server = server.slice(1, -1);
      const firstColonIndex = userPart.indexOf(':');
      if (firstColonIndex === -1) return null;
      method = userPart.substring(0, firstColonIndex);
      password = userPart.substring(firstColonIndex + 1);
    }

    if (!server || !portStr || !method || !password) return null;
    const port = parseInt(portStr);
    if (isNaN(port)) return null;

    const pluginStr = getParam(urlStr, 'plugin');
    const security = getParam(urlStr, 'security');
    const type = getParam(urlStr, 'type') || 'tcp'; 
    const sni = getParam(urlStr, 'sni') || getParam(urlStr, 'host') || server;
    const alpnStr = getParam(urlStr, 'alpn');
    const fp = getParam(urlStr, 'fp') || 'chrome';
    const echStr = getParam(urlStr, 'ech');

    const isTls = security === 'tls' || urlStr.includes('obfs=tls') || (alpnStr && alpnStr.length > 0) || (echStr && echStr.length > 0);
    const alpn = alpnStr ? alpnStr.split(',') : undefined;

    const node: ProxyNode = {
      type: 'shadowsocks', name, server, port, cipher: method, password, udp: true,
      tls: isTls, sni: sni, alpn: alpn, fingerprint: fp
    };

    node.singboxObj = {
      tag: name,
      type: 'shadowsocks',
      server: node.server,
      server_port: node.port,
      method: node.cipher,
      password: node.password
    };
    
    if (method.toLowerCase().includes('2022')) { node.singboxObj.udp_over_tcp = true; }

    node.clashObj = {
      name: name, type: 'ss', server: node.server, port: node.port, cipher: node.cipher, password: node.password, udp: true,
      plugin: pluginStr ? pluginStr.split(';')[0] : undefined,
      'plugin-opts': pluginStr ? parsePluginParams(pluginStr.split(';').slice(1).join(';')) : undefined
    };
    if (isTls) { node.clashObj.smux = { enabled: true }; }

    return node;
  } catch (e) { return null; }
}

// --- 解析 VLESS (補上 packet_encoding: 'xudp'，修復 Reality/Vision 與普通 VLESS 連線) ---
function parseVless(urlStr: string): ProxyNode | null {
  try {
    const fakeUrlStr = urlStr.replace(/^[^:]+:\/\//i, 'http://');
    const url = new URL(fakeUrlStr); 
    const params = url.searchParams; 
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'VLESS';
    
    let wsPath = params.get('path') || '/';
    if (!wsPath.startsWith('/')) wsPath = '/' + wsPath;

    const node: ProxyNode = { type: 'vless', name, server: url.hostname, port: parseInt(url.port) || 443, uuid: url.username, tls: params.get('security') === 'tls' || params.get('security') === 'reality', flow: params.get('flow') || undefined, network: params.get('type') || 'tcp', sni: params.get('sni') || params.get('host') || undefined, fingerprint: params.get('fp') || 'chrome', skipCertVerify: params.get('allowInsecure') === '1' };
    if (params.get('security') === 'reality') { node.reality = { publicKey: params.get('pbk') || '', shortId: params.get('sid') || '' }; if (!node.sni) node.sni = node.server; }
    if (node.network === 'ws') { node.wsPath = wsPath; node.wsHeaders = { Host: params.get('host') || node.server }; }
    
    // 💥 補上 packet_encoding: 'xudp'，使 VLESS Vision & Reality 與 Xray-core 端完美協調握手
    const sb: any = { tag: name, type: 'vless', server: node.server, server_port: node.port, uuid: node.uuid, packet_encoding: 'xudp' };
    sb.tls = { enabled: node.tls, server_name: node.sni || node.server, insecure: node.skipCertVerify, utls: { enabled: true, fingerprint: node.fingerprint }};
    if(node.flow) sb.flow = node.flow;
    if(node.reality) sb.tls.reality = { enabled: true, public_key: node.reality.publicKey, short_id: node.reality.shortId };
    if(node.network === 'ws') sb.transport = { type: 'ws', path: node.wsPath, headers: node.wsHeaders };
    node.singboxObj = sb;
    
    const cl: any = { name, type: 'vless', server: node.server, port: node.port, uuid: node.uuid, udp: true, tls: node.tls, servername: node.sni || node.server, 'skip-cert-verify': node.skipCertVerify, 'client-fingerprint': node.fingerprint };
    if(node.flow) cl.flow = node.flow; 
    if(node.reality) { cl.reality = true; cl['reality-opts'] = { 'public-key': node.reality.publicKey, 'short-id': node.reality.shortId }; }
    if(node.network === 'ws') { cl.network = 'ws'; cl['ws-opts'] = { path: node.wsPath, headers: node.wsHeaders }; }
    node.clashObj = cl;

    return node;
  } catch (e) { return null; }
}

// --- 解析 Hysteria2 ---
function parseHysteria2(urlStr: string): ProxyNode | null {
  try {
    const fakeUrlStr = urlStr.replace(/^[^:]+:\/\//i, 'http://');
    const url = new URL(fakeUrlStr); 
    const params = url.searchParams; 
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'Hy2';
    
    const node: ProxyNode = { type: 'hysteria2', name, server: url.hostname, port: parseInt(url.port) || 443, password: url.username, tls: true, sni: params.get('sni') || url.hostname, skipCertVerify: params.get('insecure') === '1', obfs: params.get('obfs') || undefined, obfsPassword: params.get('obfs-password') || undefined };
    const sb: any = { tag: name, type: 'hysteria2', server: node.server, server_port: node.port, password: node.password };
    sb.tls = { enabled: true, server_name: node.sni, insecure: node.skipCertVerify }; if(node.obfs) sb.obfs = { type: node.obfs, password: node.obfsPassword }; node.singboxObj = sb;
    const cl: any = { name, type: 'hysteria2', server: node.server, port: node.port, password: node.password, sni: node.sni, 'skip-cert-verify': node.skipCertVerify };
    if(node.obfs) { cl.obfs = node.obfs; cl['obfs-password'] = node.obfsPassword; } node.clashObj = cl;
    return node;
  } catch (e) { return null; }
}

// --- 解析 TUIC ---
function parseTuic(urlStr: string): ProxyNode | null {
  try {
    const fakeUrlStr = urlStr.replace(/^[^:]+:\/\//i, 'http://');
    const url = new URL(fakeUrlStr);
    const params = url.searchParams;
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'TUIC';

    const congestion_control = params.get('congestion_control') || 'bbr';
    const udp_relay_mode = params.get('udp_relay_mode') || 'native';
    const alpnStr = params.get('alpn');
    const skipCertVerify = params.get('allow_insecure') === '1' || params.get('insecure') === '1';

    const node: ProxyNode = {
      type: 'tuic',
      name,
      server: url.hostname,
      port: parseInt(url.port) || 443,
      uuid: url.username,
      password: url.password,
      tls: true,
      sni: params.get('sni') || url.hostname,
      alpn: alpnStr ? alpnStr.split(',') : ['h3'],
      skipCertVerify,
      congestion_control,
      udp_relay_mode
    };

    const sb: any = { tag: name, type: 'tuic', server: node.server, server_port: node.port, uuid: node.uuid, password: node.password, congestion_control: node.congestion_control, udp_relay_mode: node.udp_relay_mode, tls: { enabled: true, server_name: node.sni, alpn: node.alpn, insecure: node.skipCertVerify } };
    node.singboxObj = sb;

    const cl: any = { name, type: 'tuic', server: node.server, port: node.port, uuid: node.uuid, password: node.password, sni: node.sni, alpn: node.alpn, 'skip-cert-verify': node.skipCertVerify, 'congestion-controller': node.congestion_control, 'udp-relay-mode': node.udp_relay_mode };
    node.clashObj = cl;

    return node;
  } catch (e) { return null; }
}

// --- 解析 AnyTLS (修正：Sing-Box 原生支援 anytls 類型出站) ---
function parseAnytls(urlStr: string): ProxyNode | null {
  try {
    const fakeUrlStr = urlStr.replace(/^[^:]+:\/\//i, 'http://');
    const url = new URL(fakeUrlStr);
    const params = url.searchParams;
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'AnyTLS';
    
    const uuid = url.username; 
    const skipCertVerify = params.get('allowInsecure') === '1' || params.get('insecure') === '1';
    const alpnStr = params.get('alpn');

    const node: ProxyNode = {
      type: 'anytls',
      name,
      server: url.hostname,
      port: parseInt(url.port) || 443,
      uuid: uuid,
      password: uuid,
      tls: true,
      sni: params.get('sni') || url.hostname,
      fingerprint: params.get('fp') || 'chrome',
      skipCertVerify: skipCertVerify,
      alpn: alpnStr ? alpnStr.split(',') : undefined
    };

    // 💥 修正：Sing-Box 原生支援 "anytls" 類型！直接映射為標準 anytls 出站格式並設定密碼與 TLS，徹底解決原本降級為 VLESS 導致的協議不通問題
    const sb: any = { 
      tag: name, 
      type: 'anytls', 
      server: node.server, 
      server_port: node.port, 
      password: node.password, 
      tls: { 
        enabled: true, 
        server_name: node.sni, 
        insecure: node.skipCertVerify, 
        utls: { 
          enabled: true, 
          fingerprint: node.fingerprint 
        } 
      } 
    };
    if (node.alpn) sb.tls.alpn = node.alpn;
    node.singboxObj = sb;

    const cl: any = { name, type: 'anytls', server: node.server, port: node.port, password: node.password, sni: node.sni, 'skip-cert-verify': node.skipCertVerify, 'client-fingerprint': node.fingerprint, udp: true };
    if (node.alpn) cl.alpn = node.alpn;
    node.clashObj = cl;

    return node;
  } catch (e) { return null; }
}

// --- 解析 VMess (補上 packet_encoding: 'xudp' 優化 UDP 傳輸與握手) ---
function parseVmess(vmessUrl: string): ProxyNode | null {
  try {
    const b64 = vmessUrl.replace('vmess://', ''); const jsonStr = safeBase64Decode(b64); const config = JSON.parse(jsonStr); const name = config.ps || 'VMess';
    let wsPath = config.path || '/';
    if (!wsPath.startsWith('/')) wsPath = '/' + wsPath;

    const node: ProxyNode = { type: 'vmess', name, server: config.add, port: parseInt(config.port) || 443, uuid: config.id, cipher: 'auto', tls: config.tls === 'tls', sni: config.sni || config.host, network: config.net || 'tcp', wsPath: wsPath, wsHeaders: config.host ? { Host: config.host } : undefined, skipCertVerify: true };
    
    // 💥 補上 packet_encoding: 'xudp' 以解決 UDP 封包穿透問題
    const sb: any = { tag: name, type: 'vmess', server: node.server, server_port: node.port, uuid: node.uuid, security: 'auto', packet_encoding: 'xudp' };
    sb.tls = { enabled: node.tls, server_name: node.sni || node.server, insecure: true }; if(node.network === 'ws') sb.transport = { type: 'ws', path: node.wsPath, headers: node.wsHeaders }; node.singboxObj = sb;
    
    const cl: any = { name, type: 'vmess', server: node.server, port: node.port, uuid: node.uuid, alterId: parseInt(config.aid) || 0, cipher: config.scy || 'auto', udp: true, tls: node.tls, servername: node.sni || config.host || node.server, network: node.network };
    if(node.network === 'ws') cl['ws-opts'] = { path: wsPath, headers: node.wsHeaders }; 
    node.clashObj = cl;

    return node;
  } catch (e) { return null; }
}

// --- 解析 Trojan ---
function parseTrojan(urlStr: string): ProxyNode | null {
  try {
    const fakeUrlStr = urlStr.replace(/^[^:]+:\/\//i, 'http://');
    const url = new URL(fakeUrlStr); 
    const params = url.searchParams; 
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'Trojan';

    const node: ProxyNode = {
      type: 'trojan',
      name,
      server: url.hostname,
      port: parseInt(url.port) || 443,
      password: url.username,
      tls: true,
      sni: params.get('sni') || params.get('peer') || url.hostname,
      skipCertVerify: params.get('allowInsecure') === '1' || params.get('insecure') === '1'
    };

    const sb: any = {
      tag: name,
      type: 'trojan',
      server: node.server,
      server_port: node.port,
      password: node.password,
      tls: {
        enabled: true,
        server_name: node.sni,
        insecure: node.skipCertVerify
      }
    };
    node.singboxObj = sb;

    const cl: any = {
      name,
      type: 'trojan',
      server: node.server,
      port: node.port,
      password: node.password,
      sni: node.sni,
      'skip-cert-verify': node.skipCertVerify,
      udp: true
    };
    node.clashObj = cl;

    return node;
  } catch (e) { return null; }
}

// --- 主解析函數 ---
export async function parseContent(content: string): Promise<ProxyNode[]> {
  let plainText = content.replace(/^\uFEFF/, '').trim(); 
  
  const protocols = ['ss://', 'vmess://', 'vless://', 'trojan://', 'tuic://', 'hysteria2://', 'hy2://', 'anytls://'];
  const firstLine = plainText.split(/\r?\n/)[0].trim();
  const isPlainText = protocols.some(p => firstLine.startsWith(p));
  
  if (!isPlainText) { 
    try {
      let b64 = plainText.replace(/[\s\r\n]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      b64 = b64.replace(/=+$/, '');
      while (b64.length % 4 > 0) b64 += '=';
      
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoded = new TextDecoder('utf-8').decode(bytes);
      
      if (decoded && protocols.some(p => decoded.includes(p))) {
        plainText = decoded.replace(/^\uFEFF/, '').trim(); 
      } else {
        throw new Error("Base64 解碼成功，但內容並非有效的代理節點。");
      }
    } catch (err: any) {
      throw new Error(`Base64 暴力解碼失敗: ${err.message}`);
    }
  }
  
  const lines = plainText.split(/\r?\n/); 
  const nodes: ProxyNode[] = [];
  
  for (const line of lines) { 
    let l = line.replace(/^[\s\uFEFF\xA0\u200B\u200C\u200D\u200E\u200F]+|[\s\uFEFF\xA0\u200B\u200C\u200D\u200E\u200F]+$/g, ''); 
    if (!l) continue;
    
    if (l.startsWith('ss://')) { const n = parseShadowsocks(l); if (n) nodes.push(n); } 
    else if (l.startsWith('vless://')) { const n = parseVless(l); if (n) nodes.push(n); } 
    else if (l.startsWith('hysteria2://') || l.startsWith('hy2://')) { const n = parseHysteria2(l); if (n) nodes.push(n); } 
    else if (l.startsWith('vmess://')) { const n = parseVmess(l); if (n) nodes.push(n); }
    else if (l.startsWith('tuic://')) { const n = parseTuic(l); if (n) nodes.push(n); }
    else if (l.startsWith('anytls://')) { const n = parseAnytls(l); if (n) nodes.push(n); }
    else if (l.startsWith('trojan://')) { const n = parseTrojan(l); if (n) nodes.push(n); }
  } 
  
  if (nodes.length === 0) {
    throw new Error("資料獲取成功，但未能成功配對到任何支援的節點格式。");
  }
  
  return nodes;
}
