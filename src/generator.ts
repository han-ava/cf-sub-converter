import yaml from 'js-yaml';
import { ProxyNode } from './types';
import { REMOTE_CONFIG } from './constants';
import { utf8ToBase64, adjustSS2022Key } from './utils';

// --- 1. Base64 生成器 ---
export function toBase64(nodes: ProxyNode[]) {
  const links = nodes.map(node => {
    try {
      if (node.type === 'vless') {
        const params = new URLSearchParams();
        params.set('security', node.reality?.publicKey ? 'reality' : (node.tls ? 'tls' : 'none'));
        params.set('type', node.network || 'tcp');
        if (node.flow) params.set('flow', node.flow);
        if (node.sni) params.set('sni', node.sni);
        if (node.fingerprint) params.set('fp', node.fingerprint);
        if (node.reality?.publicKey) { 
          params.set('pbk', node.reality.publicKey); 
          if (node.reality.shortId) params.set('sid', node.reality.shortId);
        }
        if (node.network === 'ws') { 
          if (node.wsPath) params.set('path', node.wsPath); 
          if (node.wsHeaders?.Host) params.set('host', node.wsHeaders.Host); 
        }
        return `vless://${node.uuid}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`;
      }
      
      if (node.type === 'hysteria2') {
        const params = new URLSearchParams();
        if (node.sni) params.set('sni', node.sni);
        if (node.obfs) { params.set('obfs', node.obfs); if (node.obfsPassword) params.set('obfs-password', node.obfsPassword); }
        if (node.skipCertVerify) params.set('insecure', '1');
        return `hysteria2://${node.password}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`;
      }

      if (node.type === 'vmess') {
        const vmessObj = {
          v: "2", ps: node.name, add: node.server, port: node.port, id: node.uuid,
          aid: node.clashObj?.alterId || 0, scy: "auto", net: node.network, type: "none",
          host: node.wsHeaders?.Host || "", path: node.wsPath || "",
          tls: node.tls ? "tls" : "", sni: node.sni || ""
        };
        return 'vmess://' + utf8ToBase64(JSON.stringify(vmessObj));
      }

      if (node.type === 'shadowsocks') {
        const userinfo = utf8ToBase64(`${node.cipher}:${node.password}`);
        const params = new URLSearchParams();
        if (node.tls) {
            params.set('security', 'tls');
            if (node.sni) params.set('sni', node.sni);
            params.set('type', node.network || 'tcp');
            if (node.network === 'ws' && node.wsPath) params.set('path', node.wsPath);
        }
        const query = params.toString();
        return `ss://${userinfo}@${node.server}:${node.port}${query ? '/?' + query : ''}#${encodeURIComponent(node.name)}`;
      }
      return null;
    } catch { return null; }
  }).filter(l => l !== null);
  
  return utf8ToBase64(links.join('\n'));
}

async function fetchWithUA(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  const resp = await fetch(`${url}${separator}t=${Date.now()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache'
    }
  });
  if (!resp.ok) throw new Error(`Template fetch failed: ${resp.status}`);
  return await resp.text();
}

// --- 2. Sing-Box 生成器 ---
export async function toSingBoxWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.singbox);
  let config = JSON.parse(text);
  const outbounds = nodes.map(n => JSON.parse(JSON.stringify(n.singboxObj)));
  const nodeTags = outbounds.map((o:any) => o.tag);
  
  if (!Array.isArray(config.outbounds)) config.outbounds = [];
  config.outbounds.push(...outbounds);
  config.outbounds.forEach((out: any) => {
    if (out.type === 'selector' || out.type === 'urltest') {
      if (!Array.isArray(out.outbounds)) out.outbounds = [];
      nodeTags.forEach(tag => { if (!out.outbounds.includes(tag)) out.outbounds.push(tag); });
    }
  });
  return JSON.stringify(config, null, 2);
}

// --- 3. Clash Meta 生成器 (核心修正) ---
export async function toClashWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.clash);
  let config: any = yaml.load(text);
  
  const proxies = nodes.map(n => {
    const obj = JSON.parse(JSON.stringify(n.clashObj));
    // 確保所有布林值都是正確的類型，而非字串
    if (obj.tls !== undefined) obj.tls = !!obj.tls;
    if (obj.reality !== undefined) obj.reality = !!obj.reality;
    if (obj['skip-cert-verify'] !== undefined) obj['skip-cert-verify'] = !!obj['skip-cert-verify'];
    if (obj.udp !== undefined) obj.udp = !!obj.udp;
    
    // 清理 undefined 屬性
    Object.keys(obj).forEach(key => (obj[key] === undefined || obj[key] === null) && delete obj[key]);
    return obj;
  }).filter(p => p && p.name && p.server); // 確保沒有空節點
  
  const proxyNames = proxies.map((p: any) => p.name);

  if (!Array.isArray(config.proxies)) config.proxies = [];
  
  // 避免重複添加節點 (如果模板裡已經有了)
  const existingNames = new Set(config.proxies.map((p:any) => p.name));
  proxies.forEach(p => {
    if (!existingNames.has(p.name)) {
      config.proxies.push(p);
    }
  });

  // 將新節點加入所有策略組
  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group: any) => {
      if (!Array.isArray(group.proxies)) group.proxies = [];
      const currentGroupProxies = new Set(group.proxies);
      proxyNames.forEach(name => {
        if (!currentGroupProxies.has(name)) {
          group.proxies.push(name);
        }
      });
    });
  }
  
  // 重要：noRefs: true 關閉 YAML 錨點引用
  // 重要：lineWidth: -1 防止長字串換行
  return yaml.dump(config, { 
    indent: 2, 
    noRefs: true, 
    lineWidth: -1,
    noCompatMode: true 
  });
}
