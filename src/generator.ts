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
  
  // 核心修正：將 parser 輸出的 clashObj 進行 Meta 格式校驗
  const proxies = nodes.map(n => n.clashObj).filter(Boolean).map(p => {
    // 確保 alpn 是陣列
    if (p.alpn && typeof p.alpn === 'string') p.alpn = [p.alpn];
    return p;
  });

  if (!Array.isArray(config.proxies)) config.proxies = []; 
  config.proxies.push(...proxies);
  
  if (Array.isArray(config['proxy-groups'])) { 
    config['proxy-groups'].forEach((group: any) => { 
      if (!Array.isArray(group.proxies)) group.proxies = []; 
      group.proxies.push(...proxies.map(p => p.name)); 
    }); 
  }
  return yaml.dump(config, { noRefs: true });
}
