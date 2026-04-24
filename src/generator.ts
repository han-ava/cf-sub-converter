import yaml from 'js-yaml';
import { ProxyNode } from './types';
import { REMOTE_CONFIG } from './constants';
import { utf8ToBase64 } from './utils';

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

// 修正：移除不支援的 cache 欄位，改用 URL 時間戳
async function fetchWithUA(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  const cacheBusterUrl = `${url}${separator}t=${Date.now()}`;
  const resp = await fetch(cacheBusterUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  if (!resp.ok) throw new Error(`GitHub 範本下載失敗: ${resp.status}`);
  return await resp.text();
}

// --- 2. Sing-Box 生成器 ---
export async function toSingBoxWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.singbox);
  let config: any;
  try { config = JSON.parse(text); } catch (e) { throw new Error('Sing-Box_Rules.JSON 格式錯誤'); }

  const outbounds = nodes.map(n => JSON.parse(JSON.stringify(n.singboxObj)));
  const nodeTags = outbounds.map((o:any) => o.tag);

  if (!Array.isArray(config.outbounds)) config.outbounds = [];
  config.outbounds.push(...outbounds);

  config.outbounds.forEach((out: any) => {
    if (out.type === 'selector' || out.type === 'urltest') {
      if (!Array.isArray(out.outbounds)) out.outbounds = [];
      const currentOutbounds = new Set(out.outbounds);
      nodeTags.forEach((tag: string) => {
          if (!currentOutbounds.has(tag)) out.outbounds.push(tag);
      });
    }
  });
  return JSON.stringify(config, null, 2);
}

// --- 3. Clash Meta 生成器 ---
export async function toClashWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.clash);
  let config: any;
  try { config = yaml.load(text); } catch (e) { throw new Error('Clash_Rules.YAML 格式錯誤'); }
  
  const proxies = nodes.map(n => {
    const obj = JSON.parse(JSON.stringify(n.clashObj));
    Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
    return obj;
  }); 
  const proxyNames = proxies.map((p: any) => p.name);

  if (!Array.isArray(config.proxies)) config.proxies = [];
  const existingProxies = new Set(config.proxies.map((p:any) => p.name));

  proxies.forEach(p => {
    if (!existingProxies.has(p.name)) config.proxies.push(p);
  });

  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group: any) => {
      if (!Array.isArray(group.proxies)) group.proxies = [];
      const currentProxies = new Set(group.proxies);
      proxyNames.forEach((name: string) => {
        if (!currentProxies.has(name)) group.proxies.push(name);
      });
    });
  }
  return yaml.dump(config, { indent: 2, noRefs: true });
}
