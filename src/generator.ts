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
    
    // 1. VMess 強制補充 alterId 與 cipher
    if (p.type === 'vmess') {
      if (p.alterId === undefined) p.alterId = 0;
      if (p.cipher === undefined) p.cipher = 'auto';
    }

    // 2. Reality 強制格式校正
    if (p.type === 'vless' && p.reality) {
      if (p['reality-opts'] && typeof p['reality-opts'] === 'string') {
        try { p['reality-opts'] = JSON.parse(p['reality-opts']); } catch(e) {}
      }
      p.reality = true;
      p.tls = true; // Reality 必須搭配 tls: true
    }
    
    // 3. 【關鍵修正】移除沒開 TLS 卻帶有 TLS 專屬參數的衝突 (避免 Meta 報錯)
    if ((p.type === 'vmess' || p.type === 'vless') && !p.tls && !p.reality) {
      delete p.servername;
      delete p.sni;
      delete p['client-fingerprint'];
      delete p['skip-cert-verify'];
      delete p.alpn;
    }

    // 4. ALPN 陣列校正
    if (p.alpn && typeof p.alpn === 'string') {
      p.alpn = p.alpn.split(',');
    }
    
    // 5. TCP 網路類型簡化 (TCP 是預設值，明確寫出來有時會觸發舊版檢查錯誤)
    if (p.network === 'tcp') {
      delete p.network;
    }
    
    return p;
  }).filter(Boolean);

  if (!Array.isArray(config.proxies)) config.proxies =[];
  config.proxies.push(...processedProxies);
  
  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group: any) => {
      if (!Array.isArray(group.proxies)) group.proxies =[];
      processedProxies.forEach(p => {
        if (!group.proxies.includes(p.name)) group.proxies.push(p.name);
      });
    });
  }
  
  return yaml.dump(config, { noRefs: true, indent: 2 });
}
