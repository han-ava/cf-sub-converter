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
    
    // 強制校正 Meta 核心要求的特定欄位格式
    if (p.type === 'vless' && p.reality) {
      // 確保 reality-opts 是明確的巢狀物件
      if (p['reality-opts'] && typeof p['reality-opts'] === 'string') {
        p['reality-opts'] = JSON.parse(p['reality-opts']);
      }
      p.reality = true; // Meta 要求顯式開啟
    }
    
    // 強制校正 alpn 為陣列，防止因字串格式導致的啟動失敗
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
      // 僅添加名稱，避免重複加入
      processedProxies.forEach(p => {
        if (!group.proxies.includes(p.name)) group.proxies.push(p.name);
      });
    });
  }
  
  return yaml.dump(config, { noRefs: true, indent: 2 });
}
