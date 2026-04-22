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

function parseVless(urlStr: string): ProxyNode | null {
  try {
    const url = new URL(urlStr); const params = url.searchParams;
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'VLESS';
    
    const node: ProxyNode = { 
        type: 'vless', name, server: url.hostname, port: parseInt(url.port), 
        uuid: url.username, tls: params.get('security') === 'tls' || params.get('security') === 'reality', 
        flow: params.get('flow') || undefined, network: params.get('type') || 'tcp', 
        sni: params.get('sni') || params.get('host') || undefined, 
        fingerprint: params.get('fp') || 'chrome', 
        skipCertVerify: params.get('allowInsecure') === '1' 
    };
    
    if (params.get('security') === 'reality') { 
        node.reality = { publicKey: params.get('pbk') || '', shortId: params.get('sid') || '' }; 
        if (!node.sni) node.sni = node.server; 
    }
    if (node.network === 'ws') { node.wsPath = params.get('path') || '/'; node.wsHeaders = { Host: params.get('host') || node.server }; }

    // Clash Meta 格式
    const cl: any = { 
        name, type: 'vless', server: node.server, port: node.port, uuid: node.uuid, 
        tls: node.tls, servername: node.sni || node.server, 
        'skip-cert-verify': node.skipCertVerify, 'client-fingerprint': node.fingerprint 
    };
    if(node.flow) cl.flow = node.flow; 
    if(node.reality) { cl.reality = true; cl['reality-opts'] = { 'public-key': node.reality.publicKey, 'short-id': node.reality.shortId }; }
    if(node.network === 'ws') { cl.network = 'ws'; cl['ws-opts'] = { path: node.wsPath, headers: node.wsHeaders }; }
    
    node.clashObj = cl;
    return node;
  } catch (e) { return null; }
}

function parseHysteria2(urlStr: string): ProxyNode | null {
  try {
    const url = new URL(urlStr); const params = url.searchParams;
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'Hy2';
    const alpn = params.get('alpn') ? params.get('alpn')!.split(',') : ['h3'];
    
    const node: ProxyNode = { type: 'hysteria2', name, server: url.hostname, port: parseInt(url.port), password: url.username, tls: true, sni: params.get('sni') || url.hostname, skipCertVerify: params.get('insecure') === '1' };
    node.clashObj = { name, type: 'hysteria2', server: node.server, port: node.port, password: node.password, sni: node.sni, 'skip-cert-verify': node.skipCertVerify, alpn };
    return node;
  } catch (e) { return null; }
}

function parseTuic(urlStr: string): ProxyNode | null {
  try {
    const url = new URL(urlStr); const params = url.searchParams;
    const name = tryDecodeURIComponent(url.hash.slice(1)) || 'TUIC';
    const alpn = params.get('alpn') ? params.get('alpn')!.split(',') : ['h3'];
    
    const node: ProxyNode = { type: 'tuic', name, server: url.hostname, port: parseInt(url.port), uuid: url.username, password: url.password || url.username };
    node.clashObj = {
      name, type: 'tuic', server: node.server, port: node.port, uuid: node.uuid, password: node.password,
      sni: params.get('sni') || node.server, 'skip-cert-verify': params.get('insecure') === '1',
      'udp-relay-mode': params.get('udp_relay_mode') || 'native',
      'congestion-controller': params.get('congestion_control') || 'bbr',
      alpn
    };
    return node;
  } catch (e) { return null; }
}

function parseVmess(vmessUrl: string): ProxyNode | null {
  try {
    const jsonStr = safeBase64Decode(vmessUrl.replace('vmess://', '')); 
    const config = JSON.parse(jsonStr); 
    const node: ProxyNode = { type: 'vmess', name: config.ps || 'VMess', server: config.add, port: parseInt(config.port), uuid: config.id, network: config.net || 'tcp', wsPath: config.path };
    const cl: any = { name: node.name, type: 'vmess', server: node.server, port: node.port, uuid: node.uuid, cipher: 'auto', tls: config.tls === 'tls', servername: config.sni || config.host, network: node.network };
    if(node.network === 'ws') cl['ws-opts'] = { path: node.wsPath, headers: { Host: config.host } };
    node.clashObj = cl;
    return node;
  } catch (e) { return null; }
}

export async function parseContent(content: string): Promise<ProxyNode[]> {
  let plainText = content;
  if (!content.includes('://')) { const decoded = safeBase64Decode(content); if (decoded) plainText = decoded; }
  const lines = plainText.split(/\r?\n/); const nodes: ProxyNode[] = [];
  for (const line of lines) { const l = line.trim(); if (!l) continue;
    if (l.startsWith('vless://')) { const n = parseVless(l); if (n) nodes.push(n); } 
    else if (l.startsWith('hysteria2://') || l.startsWith('hy2://')) { const n = parseHysteria2(l); if (n) nodes.push(n); } 
    else if (l.startsWith('vmess://')) { const n = parseVmess(l); if (n) nodes.push(n); }
    else if (l.startsWith('tuic://')) { const n = parseTuic(l); if (n) nodes.push(n); }
  } return nodes;
}
