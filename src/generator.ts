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
        // V2RayN 支援明文格式，這裡使用 URL Encode 確保包含冒號等特殊字元的密碼不會報錯
        const method = encodeURIComponent(node.cipher || '');
        const pass = encodeURIComponent(node.password || '');
        
        const params = new URLSearchParams();
        
        // 寫入標準 SIP002 參數
        if (node.tls) {
            params.set('security', 'tls');
            if (node.sni) params.set('sni', node.sni);
            if (node.alpn) params.set('alpn', node.alpn.join(','));
            if (node.fingerprint) params.set('fp', node.fingerprint);
            params.set('type', node.network || 'tcp');
            
            // ECH 參數 (若有的話，存放在 reality.shortId 中)
            if (node.reality && node.reality.shortId) {
                params.set('ech', node.reality.shortId);
            }
        }
        
        // 寫回原本的 plugin 參數 (如果有的話)
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

// --- 2. Sing-Box 生成器 (處理遠端 JSON) ---
export async function toSingBoxWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.singbox);
  let config: any;
  try { 
    config = JSON.parse(text); 
  } catch (e) { 
    throw new Error('Sing-Box_Rules.JSON 格式錯誤，請確認 GitHub 上的檔案是合法的 JSON'); 
  }

  // 映射節點並進行最終清洗
  const outbounds = nodes.map(n => {
     // 深拷貝一份，避免污染原始物件
     const obj = JSON.parse(JSON.stringify(n.singboxObj));
     
     // [關鍵相容性保護] 
     // Sing-Box 的 SS-2022 只需要 Server Key (冒號前面的部分)
     // 如果密碼中包含冒號，強制切斷，防止出現 "bad key length, got 72" 崩潰
     if (obj.type === 'shadowsocks' && obj.method.toLowerCase().includes('2022')) {
         if (obj.password && obj.password.includes(':')) {
             obj.password = obj.password.split(':')[0];
         }
     }
     
     return obj;
  });
  
  const nodeTags = outbounds.map((o:any) => o.tag);

  if (!Array.isArray(config.outbounds)) config.outbounds = [];
  
  // 將節點加入到設定的最後方
  config.outbounds.push(...outbounds);

  // 自動將節點加入所有的 selector 與 urltest 策略組中
  config.outbounds.forEach((out: any) => {
    if (out.type === 'selector' || out.type === 'urltest') {
      if (!Array.isArray(out.outbounds)) out.outbounds = [];
      // 避免重複加入
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

// --- 3. Clash Meta / OpenClash 生成器 (處理遠端 YAML) ---
export async function toClashWithTemplate(nodes: ProxyNode[]) {
  const text = await fetchWithUA(REMOTE_CONFIG.clash);
  let config: any;
  try { 
    config = yaml.load(text); 
  } catch (e) { 
    throw new Error('Clash_Rules.YAML 格式錯誤，請確認 GitHub 上的檔案是合法的 YAML'); 
  }
  
  const proxies = nodes.map(n => n.clashObj); 
  const proxyNames = proxies.map(p => p.name);

  if (!Array.isArray(config.proxies)) config.proxies = [];
  config.proxies.push(...proxies);

  // 將節點加入 proxy-groups
  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'].forEach((group: any) => {
      if (!Array.isArray(group.proxies)) group.proxies = [];
      group.proxies.push(...proxyNames);
    });
  }

  return yaml.dump(config);
}
