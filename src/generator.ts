import yaml from 'js-yaml';
import { ProxyNode } from './types';
import { REMOTE_CONFIG } from './constants';
import { utf8ToBase64 } from './utils';

async function fetchWithUA(url: string) {
  const resp = await fetch(url + `?t=${Math.random()}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  });
  if (!resp.ok) throw new Error(`Fetch failed`);
  return await resp.text();
}

export function toBase64(nodes: ProxyNode[]) {
  // 簡化處理 Base64 導出
  return utf8ToBase64(nodes.map(n => n.name).join('\n'));
}

export async function toSingBoxWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.singbox);
  const config = JSON.parse(text);
  config.outbounds.push(...nodes.map(n => n.singboxObj).filter(Boolean));
  return JSON.stringify(config, null, 2);
}

export async function toClashWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.clash);
  let config: any = yaml.load(text);
  
  const processedProxies = nodes.map(n => {
    const p = { ...n.clashObj };
    
    // 1. VMess 強制補充 alterId (解決報錯關鍵)
    if (p.type === 'vmess') {
      if (p.alterId === undefined) p.alterId = 0;
    }

    // 2. Reality 強制格式校正
    if (p.type === 'vless' && p.reality) {
      if (p['reality-opts'] && typeof p['reality-opts'] === 'string') {
        try { p['reality-opts'] = JSON.parse(p['reality-opts']); } catch(e) {}
      }
      p.reality = true;
    }
    
    // 3. ALPN 陣列校正
    if (p.alpn && typeof p.alpn === 'string') {
      p.alpn = p.alpn.split(',');
    }
    
    return p;
  }).filter(Boolean);

  if (!Array.isArray(config.proxies)) config.proxies = [];
  config.proxies.push(...processedProxies);
  
  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group: any) => {
      if (!Array.isArray(group.proxies)) group.proxies = [];
      processedProxies.forEach(p => {
        if (!group.proxies.includes(p.name)) group.proxies.push(p.name);
      });
    });
  }
  
  // 輸出時強制關閉複雜的 YAML 引用，這對於 OpenClash 至關重要
  return yaml.dump(config, { noRefs: true, indent: 2 });
}
