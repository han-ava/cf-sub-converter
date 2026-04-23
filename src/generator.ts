import yaml from 'js-yaml';
import { ProxyNode } from './types';
import { REMOTE_CONFIG } from './constants';
import { utf8ToBase64 } from './utils';

// --- 1. Base64 生成器 (給 V2RayN / Shadowrocket) ---
export function toBase64(nodes: ProxyNode[]) {
  const links = nodes.map(node => {
    try {
      // --- VLESS ---
      if (node.type === 'vless') {
        const params = new URLSearchParams();
        params.set('security', node.reality ? 'reality' : (node.tls ? 'tls' : 'none'));
        params.set('type', node.network || 'tcp');
        if (node.flow) params.set('flow', node.flow);
        if (node.sni) params.set('sni', node.sni);
        if (node.fingerprint) params.set('fp', node.fingerprint);
        if (node.reality) { 
          params.set('pbk', node.reality.publicKey); 
          params.set('sid', node.reality.shortId); 
        }
        if (node.network === 'ws') { 
          if (node.wsPath) params.set('path', node.wsPath); 
          if (node.wsHeaders?.Host) params.set('host', node.wsHeaders.Host); 
        }
        return `vless://${node.uuid}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`;
      }
      
      // --- Hysteria 2 ---
      if (node.type === 'hysteria2') {
        const params = new URLSearchParams();
        if (node.sni) params.set('sni', node.sni);
        if (node.obfs) { 
          params.set('obfs', node.obfs); 
          if (node.obfsPassword) params.set('obfs-password', node.obfsPassword); 
        }
        if (node.skipCertVerify) params.set('insecure', '1');
        return `hysteria2://${node.password}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`;
      }

      // --- VMess ---
      if (node.type === 'vmess') {
        const vmessObj = {
          v: "2", ps: node.name, add: node.server, port: node.port, id: node.uuid,
          aid: node.clashObj?.alterId || 0, scy: "auto", net: node.network, type: "none",
          host: node.wsHeaders?.Host || "", path: node.wsPath || "",
          tls: node.tls ? "tls" : "", sni: node.sni || ""
        };
        return 'vmess://' + utf8ToBase64(JSON.stringify(vmessObj));
      }

      // --- Shadowsocks ---
      if (node.type === 'shadowsocks') {
        const method = encodeURIComponent(node.cipher || '');
        const pass = encodeURIComponent(node.password || '');
        
        const params = new URLSearchParams();
        
        if (node.tls) {
            params.set('security', 'tls');
            if (node.sni) params.set('sni', node.sni);
            if (node.alpn) params.set('alpn', node.alpn.join(','));
            if (node.fingerprint) params.set('fp', node.fingerprint);
            params.set('type', node.network || 'tcp');
            
            if (node.reality && node.reality.shortId) {
                params.set('ech', node.reality.shortId);
            }
        }
        
        if (node.clashObj && node.clashObj.plugin && !node.tls) {
             const pluginOpts = node.clashObj['plugin-opts'];
             const optStr = pluginOpts ? ';' + new URLSearchParams(pluginOpts).toString().replace(/&/g, ';') : '';
             params.set('plugin', node.clashObj.plugin + optStr);
        }

        const query = params.toString();
        return `ss://${method}:${pass}@${node.server}:${node.port}${query ? '/?' + query : ''}#${encodeURIComponent(node.name)}`;
      }

      return null;
    } catch { return null; }
  }).filter(l => l !== null);
  
  return utf8ToBase64(links.join('\n'));
}

// --- 輔助：帶有偽裝與防快取的 Fetch ---
async function fetchWithUA(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  const resp = await fetch(`${url}${separator}t=${Math.random()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
  try { 
    config = JSON.parse(text); 
  } catch (e) { 
    throw new Error('Sing-Box_Rules.JSON 格式錯誤，請確認 GitHub 上的檔案是合法的 JSON'); 
  }

  const outbounds = nodes.map(n => {
     const obj = JSON.parse(JSON.stringify(n.singboxObj));
     
     if (obj.type === 'shadowsocks' && obj.method.toLowerCase().includes('2022')) {
         if (obj.password && obj.password.includes(':')) {
             obj.password = obj.password.split(':')[0];
         }
     }
     return obj;
  });
  
  const nodeTags = outbounds.map((o:any) => o.tag);

  if (!Array.isArray(config.outbounds)) config.outbounds =[];
  config.outbounds.push(...outbounds);

  config.outbounds.forEach((out: any) => {
    if (out.type === 'selector' || out.type === 'urltest') {
      if (!Array.isArray(out.outbounds)) out.outbounds =[];
      const currentOutbounds = new Set(out.outbounds);
      nodeTags.forEach((tag: string) => {
          if (!currentOutbounds.has(tag)) {
              out.outbounds.push(tag);
          }
      });
    }
  });

  return JSON.stringify(config, null, 2);
}

// --- 3. Clash Meta / OpenClash 生成器 ---
export async function toClashWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.clash);
  let config: any;
  try { 
    config = yaml.load(text); 
  } catch (e) { 
    throw new Error('Clash_Rules.YAML 格式錯誤，請確認 GitHub 上的檔案是合法的 YAML'); 
  }
  
  // 處理與過濾 Clash 節點
  const proxies = nodes.map(n => {
    const obj = JSON.parse(JSON.stringify(n.clashObj));
    
    //[關鍵修復 1] OpenClash 對於 SS obfs 插件的嚴格格式要求
    // 必須將 obfs-local 轉為 obfs，並修改內部參數鍵值
    if (obj.type === 'ss' && (obj.plugin === 'obfs-local' || obj.plugin === 'simple-obfs')) {
        obj.plugin = 'obfs'; // Clash 只認識 obfs
        if (obj['plugin-opts']) {
            if (obj['plugin-opts']['obfs']) {
                obj['plugin-opts'].mode = obj['plugin-opts']['obfs'];
                delete obj['plugin-opts']['obfs'];
            }
            if (obj['plugin-opts']['obfs-host']) {
                obj['plugin-opts'].host = obj['plugin-opts']['obfs-host'];
                delete obj['plugin-opts']['obfs-host'];
            }
        }
    }
    
    // 清理 undefined 屬性，避免 yaml.dump 報錯
    Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
    return obj;
  }); 
  
  const proxyNames = proxies.map((p: any) => p.name);

  if (!Array.isArray(config.proxies)) config.proxies =[];
  config.proxies.push(...proxies);

  // [關鍵修復 2] 將節點加入 proxy-groups 並避免重複，防止 OpenClash 報錯
  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group: any) => {
      if (!Array.isArray(group.proxies)) group.proxies =[];
      
      const currentProxies = new Set(group.proxies);
      proxyNames.forEach((name: string) => {
          if (!currentProxies.has(name)) {
              group.proxies.push(name);
          }
      });
    });
  }

  // [關鍵修復 3] noRefs: true 關閉 YAML 的 alias 引用，OpenClash 不支援這種語法
  return yaml.dump(config, {
      indent: 2,
      noRefs: true 
  });
}
