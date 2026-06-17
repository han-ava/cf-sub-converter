// src/index.ts
// @ts-ignore
import packageJson from '../package.json';
import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames, groupNodesByFlag } from './utils';

const version = packageJson.version || '2.5.0';

// 輔助載入與解析節點（不含流量統計，專供 API 使用）
async function loadNodes(urlParam: string): Promise<ProxyNode[]> {
  const inputs = urlParam.split(/[\n\r|]+/); 
  const allNodes: ProxyNode[] = [];

  for (const input of inputs) {
    const trimmed = input.trim(); 
    if (!trimmed) continue;
    
    if (trimmed.startsWith('http')) { 
      try { 
        const separator = trimmed.includes('?') ? '&' : '?';
        const fetchUrl = `${trimmed}${separator}t=${Date.now()}`;
        
        const resp = await fetch(fetchUrl, { 
          headers: { 
            'User-Agent': 'v2rayNG/1.8.5',
            'Accept': '*/*'
          } 
        }); 
        
        if (resp.ok) { 
          const text = await resp.text(); 
          if (!text.trim().startsWith('<')) {
             try {
               const parsed = await parseContent(text);
               allNodes.push(...parsed);
             } catch(err) {}
          }
        }
      } catch (e) {} 
    } else { 
      try {
        const parsed = await parseContent(trimmed);
        allNodes.push(...parsed); 
      } catch(err) {}
    }
  }
  return allNodes;
}

// 安全的 Base64 編碼，防止中文節點名解析錯誤
function safeBtoa(str: string): string {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } catch (e) {
    return btoa(str);
  }
}

// 動態從 GitHub 獲取模板腳本並進行變數置換 (網址增加動態時間戳，消除 Cloudflare 緩存)
async function getArgoScriptFromGithub(node: ProxyNode, port: string, token: string, domain: string): Promise<string> {
  const GITHUB_TEMPLATE_URL = `https://raw.githubusercontent.com/sammy0101/cf-sub-converter/main/argo.sh?t=${Date.now()}`;
  let template = "";
  
  try {
    const res = await fetch(GITHUB_TEMPLATE_URL, { headers: { 'User-Agent': 'v2rayNG/1.8.5' } });
    if (res.ok) {
      template = await res.text();
    } else {
      throw new Error("GitHub Fetch Failed");
    }
  } catch(e) {
    // 降級備用本地極簡模板 
    template = `#!/bin/bash
echo "警告: 無法從 GitHub 獲取最新 argo.sh 模板，正在使用降級極簡部署..."
if ! command -v cloudflared &> /dev/null; then
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi
cloudflared tunnel --url http://127.0.0.1:{{VLESS_PORT}}
`;
  }

  const vlessType = node.network || 'ws';
  const vlessPath = node.wsPath || '/';
  
  // 統一節點名稱格式為：[原節點名]_Argo
  const argoNodeName = `${node.name}_Argo`;
  const isTls = node.tls ? "true" : "false";
  const realHost = node.wsHeaders?.Host || node.sni || node.server; 

  // 替換模板中的自訂佔位符
  return template
    .replace("{{NODE_TYPE}}", node.type)
    .replace("{{VLESS_UUID}}", node.uuid || '')
    .replace("{{VLESS_PATH}}", vlessPath)
    .replace("{{VLESS_TYPE}}", vlessType)
    .replace("{{VLESS_PORT}}", port)
    .replace("{{NODE_NAME}}", argoNodeName)
    .replace("{{TUNNEL_TOKEN}}", token.trim())
    .replace("{{CUSTOM_DOMAIN}}", domain.trim())
    .replace("{{VLESS_TLS}}", isTls)
    .replace("{{ORIGIN_HOST}}", realHost);
}

export default {
async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
const url = new URL(request.url);

// 跨域預檢
if (request.method === 'OPTIONS') {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

// GET /argo/sh/:id 路由 (供 VPS 執行 wget/curl 讀取一鍵安裝腳本)
if (request.method === 'GET' && url.pathname.startsWith('/argo/sh/')) {
  const scriptId = url.pathname.split('/').pop();
  if (env.SUB_CACHE && scriptId) {
    const script = await env.SUB_CACHE.get(`script:${scriptId}`);
    if (script) {
      return new Response(script, {
        headers: { 
          'Content-Type': 'text/plain; charset=utf-8', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }
  }
  return new Response('# 錯誤: 該腳本不存在或已過期 (有效期 1 小時)，請重新在網頁上生成。\nexit 1\n', { 
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

// POST /api/parse-argo (同時解析並篩選 VLESS 和 VMess 節點)
if (request.method === 'POST' && (url.pathname === '/api/parse-vless' || url.pathname === '/api/parse-argo')) {
  try {
    const body: any = await request.json();
    const rawUrl = body.url || '';
    if (!rawUrl.trim()) {
      return new Response(JSON.stringify({ error: '請輸入有效的節點內容' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    const allNodes = await loadNodes(rawUrl);
    // 篩選 VLESS & VMess
    const argoCompatibleNodes = allNodes.filter(n => n.type === 'vless' || n.type === 'vmess').map((n, idx) => ({
      index: idx,
      name: n.name,
      server: n.server,
      port: n.port,
      type: n.type,
      host: n.wsHeaders?.Host || n.sni || n.server
    }));

    return new Response(JSON.stringify(argoCompatibleNodes), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}

// POST /api/argo-generate (生成 VPS 腳本與獨立 Argo 明文節點)
if (request.method === 'POST' && url.pathname === '/api/argo-generate') {
  try {
    const body: any = await request.json();
    const rawUrl = body.url || '';
    const selectedIndices: number[] = body.indices || [];
    const port = body.port || '8080';
    const token = body.token || '';
    const domain = body.domain || '';

    if (!rawUrl.trim() || selectedIndices.length === 0) {
      return new Response(JSON.stringify({ error: '無效的參數或未選擇 any 節點' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    const allNodes = await loadNodes(rawUrl);
    const compatibleNodes = allNodes.filter(n => n.type === 'vless' || n.type === 'vmess');
    const selectedObjects = selectedIndices.map(idx => compatibleNodes[idx]).filter(Boolean);

    if (selectedObjects.length === 0) {
      return new Response(JSON.stringify({ error: '選擇的節點不存在' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    let scripts = '';
    const generatedNodesData: any[] = [];

    for (let i = 0; i < selectedObjects.length; i++) {
      const node = selectedObjects[i];
      const originalIndex = selectedIndices[i];
      
      scripts += await getArgoScriptFromGithub(node, port, token, domain) + '\n\n';

      const targetDomain = (token.trim() && domain.trim()) ? domain.trim() : "請在VPS執行一鍵安裝腳本獲取臨時域名.trycloudflare.com";
      
      // 格式優化：統一變更節點名字後置：[原節點名]_Argo
      const argoNodeName = `${node.name}_Argo`;

      let argoLink = '';
      if (node.type === 'vless') {
        argoLink = `vless://${node.uuid}@${targetDomain}:443?encryption=none&security=tls&type=${node.network || 'ws'}&host=${targetDomain}&path=${node.wsPath || '/'}#${encodeURIComponent(argoNodeName)}`;
      } else {
        const vmessObj = {
          v: "2", ps: argoNodeName, add: targetDomain, port: 443, id: node.uuid,
          aid: 0, scy: "auto", net: node.network || 'ws', type: "none",
          host: targetDomain, path: node.wsPath || '/', tls: "tls", sni: targetDomain
        };
        argoLink = 'vmess://' + safeBtoa(JSON.stringify(vmessObj));
      }

      generatedNodesData.push({ originalIndex, link: argoLink });
    }

    // 將 Bash 腳本存入 KV 中 (保留 1 小時)
    let scriptId = '';
    if (env.SUB_CACHE) {
      scriptId = crypto.randomUUID();
      await env.SUB_CACHE.put('script:' + scriptId, scripts, { expirationTtl: 3600 });
    }

    return new Response(JSON.stringify({ 
      scriptId: scriptId, 
      argoNodes: generatedNodesData 
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}

// 0. GET /version 
if (request.method === 'GET' && url.pathname === '/version') {
  return new Response(`subconverter v${version} ${url.host} backend\n`, {
    headers: { 
      'Content-Type': 'text/plain; charset=utf-8', 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    } 
  });
}

// 1. POST /save 
if (request.method === 'POST' && url.pathname === '/save') {
  try {
    const body: any = await request.json();
    if (!body.path || !body.content) return new Response('Missing path or content', { status: 400 });
    
    const saveData = {
      content: body.content,
      include: body.include || '',
      exclude: body.exclude || '',
      rename: body.rename || ''
    };
    await env.SUB_CACHE.put(body.path, JSON.stringify(saveData));
    
    const redirectUrl = `/?url=${encodeURIComponent(body.content)}&include=${encodeURIComponent(body.include || '')}&exclude=${encodeURIComponent(body.exclude || '')}&rename=${encodeURIComponent(body.rename || '')}`;
    return new Response(null, { 
      status: 302, 
      headers: { 'Location': redirectUrl } 
    });
  } catch (e) { return new Response('Error saving profile', { status: 500 }); }
}

// 2. KV 收藏 API
const FAVS_KEY = 'favorites';

async function getFavs(): Promise<any[]> {
  const data = await env.SUB_CACHE.get(FAVS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveFavs(favs: any[]): Promise<void> {
  await env.SUB_CACHE.put(FAVS_KEY, JSON.stringify(favs));
}

if (request.method === 'GET' && url.pathname === '/favs') {
  const favs = await getFavs();
  return new Response(JSON.stringify(favs), { 
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
  });
}

if (request.method === 'POST' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (!body.name || !body.url) return new Response('Missing name or url', { status: 400 });
    const favs = await getFavs();
    favs.push({ 
      name: body.name, 
      url: body.url, 
      include: body.include || '', 
      exclude: body.exclude || '',
      rename: body.rename || ''
    });
    await saveFavs(favs);
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error saving favorite', { status: 500 }); }
}

if (request.method === 'PUT' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (body.index === undefined || !body.name || !body.url) return new Response('Missing data', { status: 400 });
    const favs = await getFavs();
    if (body.index >= 0 && body.index < favs.length) {
      favs[body.index] = { 
        name: body.name, 
        url: body.url, 
        include: body.include || '', 
        exclude: body.exclude || '',
        rename: body.rename || ''
      };
      await saveFavs(favs);
    }
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error updating favorite', { status: 500 }); }
}

if (request.method === 'DELETE' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (body.index === undefined) return new Response('Missing index', { status: 400 });
    const favs = await getFavs();
    if (body.index >= 0 && body.index < favs.length) {
      favs.splice(body.index, 1);
      await saveFavs(favs);
    }
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error deleting favorite', { status: 500 }); }
}

// 3. GET /path (讀取短連結或一般轉換)
let urlParam = url.searchParams.get('url') || '';
let includeParam = url.searchParams.get('include') || '';
let excludeParam = url.searchParams.get('exclude') || '';
let renameParam = url.searchParams.get('rename') || '';

const path = decodeURIComponent(url.pathname.slice(1)); 

if (path && path !== 'sub' && path !== 'favicon.ico' && path !== '') {
  const stored = await env.SUB_CACHE.get(path);
  if (stored) { 
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.content) {
        urlParam = parsed.content;
        if (!includeParam) includeParam = parsed.include || '';
        if (!excludeParam) excludeParam = parsed.exclude || '';
        if (!renameParam) renameParam = parsed.rename || '';
      }
    } catch (e) {
      urlParam = stored; 
    }
  }
}

if (!urlParam || urlParam.trim() === '') {
  if (path === 'sub') {
    return new Response('Error: Missing parameter "url"', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  const dynamicHtml = HTML_PAGE.replace('v2.5.0', `v${version}`);
  return new Response(dynamicHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// 4. 解析並下載 
const inputs = urlParam.split(/[\n\r|]+/); 
const allNodes: ProxyNode[] = [];
const errors: string[] = [];

let totalUpload = 0;
let totalDownload = 0;
let totalTotal = 0;
let minExpire = 0;
let hasTrafficInfo = false;

for (const input of inputs) {
  const trimmed = input.trim(); 
  if (!trimmed) continue;
  
  if (trimmed.startsWith('http')) { 
    try { 
      const separator = trimmed.includes('?') ? '&' : '?';
      const fetchUrl = `${trimmed}${separator}t=${Date.now()}`;
      
      const resp = await fetch(fetchUrl, { 
        headers: { 
          'User-Agent': 'v2rayNG/1.8.5',
          'Accept': '*/*'
        } 
      }); 
      
      if (resp.ok) { 
        const text = await resp.text(); 
        
        const userInfo = resp.headers.get('subscription-userinfo');
        if (userInfo) {
          hasTrafficInfo = true;
          const uploadMatch = userInfo.match(/upload=(\d+)/i);
          const downloadMatch = userInfo.match(/download=(\d+)/i);
          const totalMatch = userInfo.match(/total=(\d+)/i);
          const expireMatch = userInfo.match(/expire=(\d+)/i);

          totalUpload += uploadMatch ? parseInt(uploadMatch[1]) : 0;
          totalDownload += downloadMatch ? parseInt(downloadMatch[1]) : 0;
          totalTotal += totalMatch ? parseInt(totalMatch[1]) : 0;
          
          const expireVal = expireMatch ? parseInt(expireMatch[1]) : 0;
          if (expireVal > 0) {
            if (minExpire === 0 || expireVal < minExpire) {
              minExpire = expireVal; 
            }
          }
        }

        if (text.trim().startsWith('<')) {
           errors.push(`❌ [${trimmed}]\n失敗原因: 伺服器回傳了 HTML 網頁而不是訂閱代碼。`);
        } else {
           try {
             const parsed = await parseContent(text);
             allNodes.push(...parsed);
           } catch(err: any) {
             errors.push(`⚠️ [${trimmed}]\n失敗原因: ${err.message}\n內容預覽: ${text.substring(0, 100)}...`);
           }
        }
      } else {
        errors.push(`❌ [${trimmed}]\n失敗原因: HTTP 狀態碼 ${resp.status} ${resp.statusText}`);
      }
    } catch (e: any) {
      errors.push(`❌ [${trimmed}]\n連線錯誤: ${e.message}`);
    } 
  } else { 
    try {
      const parsed = await parseContent(trimmed);
      allNodes.push(...parsed); 
    } catch(err: any) {
      errors.push(`⚠️ [手動輸入內容]\n失敗原因: ${err.message}`);
    }
  }
}

if (allNodes.length === 0) {
  const errorReport = `未解析到任何有效節點。\n\n🔍 詳細錯誤診斷報告：\n-------------------------\n${errors.join('\n\n-------------------------\n')}`;
  return new Response(errorReport, { 
    status: 400, 
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } 
  });
}

let filteredNodes = allNodes;

// 智慧節點名稱替換邏輯
if (renameParam) {
  try {
    const rules = renameParam.split('|');
    for (const rule of rules) {
      const trimmedRule = rule.trim();
      if (!trimmedRule) continue;

      if (trimmedRule.startsWith('DEL-')) {
        const search = trimmedRule.substring(4); 
        if (search) {
          filteredNodes.forEach(node => {
            if (node.name) {
              node.name = node.name.split(search).join('');
            }
          });
        }
      } else if (trimmedRule.includes('-')) {
        const index = trimmedRule.indexOf('-');
        const search = trimmedRule.substring(0, index).trim();
        const replace = trimmedRule.substring(index + 1).trim();
        
        if (search && replace !== undefined) {
          if (search.toUpperCase() === 'ALL') {
            filteredNodes.forEach(node => {
              node.name = replace;
            });
          } else {
            filteredNodes.forEach(node => {
              if (node.name) {
                node.name = node.name.split(search).join(replace);
              }
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Rename replacement failed:', e);
  }
}

const buildFilterRegex = (param: string): RegExp => {
  const safePattern = param.replace(/[xXｘＸ]/g, '[xXｘＸ×]').replace(/×/g, '[xXｘＸ×]');
  return new RegExp(safePattern, 'i');
};

if (includeParam) {
  try {
    const includeRegex = buildFilterRegex(includeParam);
    filteredNodes = filteredNodes.filter(node => includeRegex.test(node.name));
  } catch (e) {
    console.error('Invalid include regex:', e);
  }
}

if (excludeParam) {
  try {
    const excludeRegex = buildFilterRegex(excludeParam);
    filteredNodes = filteredNodes.filter(node => !excludeRegex.test(node.name));
  } catch (e) {
    console.error('Invalid exclude regex:', e);
  }
}

if (filteredNodes.length === 0) {
  return new Response('篩選與替換後，未剩下 any 有效節點。', { 
    status: 400, 
    headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
  });
}

// 智慧分群與去重複命名
const sortedNodes = groupNodesByFlag(filteredNodes);
const uniqueNodes = deduplicateNodeNames(sortedNodes);

let target = url.searchParams.get('target');

// 自適應 User-Agent 偵測邏輯 (適用於自適應/短連結)
if (!target) {
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();
  
  // 檢查是否為代理客戶端，若不是代理客戶端（例如普通瀏覽器），則繼續輸出網頁摘要介面
  const isAgent = ua.includes('clash') || 
                  ua.includes('mihomo') || 
                  ua.includes('stash') || 
                  ua.includes('sing-box') || 
                  ua.includes('singbox') || 
                  ua.includes('shadowrocket') || 
                  ua.includes('v2ray') || 
                  ua.includes('surfboard') || 
                  ua.includes('quantumult') || 
                  ua.includes('hiddify') || 
                  ua.includes('subconverter');

  if (isAgent) {
    if (ua.includes('clash') || ua.includes('mihomo') || ua.includes('stash') || ua.includes('surfboard')) {
      target = 'clash';
    } else if (ua.includes('sing-box') || ua.includes('singbox') || ua.includes('hiddify')) {
      target = 'singbox';
    } else {
      target = 'base64'; // 其它客戶端降級為 Base64 格式
    }
  }
}

if (!target) {
  const host = `https://${url.host}`;
  const encodedUrl = encodeURIComponent(urlParam);
  let filterQuery = '';
  if (includeParam) filterQuery += `&include=${encodeURIComponent(includeParam)}`;
  if (excludeParam) filterQuery += `&exclude=${encodeURIComponent(excludeParam)}`;
  if (renameParam) filterQuery += `&rename=${encodeURIComponent(renameParam)}`;

  const adaptiveLink = path ? `${host}/${path}` : `${host}/?url=${encodedUrl}${filterQuery}`;

  const htmlInfo = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>訂閱轉換結果</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; display: flex; justify-content: center; }
    .container { background: #1e293b; padding: 2rem; border-radius: 16px; max-width: 600px; width: 100%; }
    h1 { margin: 0 0 1.5rem 0; font-size: 1.5rem; text-align: center; }
    .result { background: #0f172a; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .result-title { font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 8px; }
    .result-link { background: #334155; padding: 0.8rem; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 0.85rem; }
    .btn { display: block; color: white; text-align: center; padding: 1rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ 篩選並轉換完成 (${uniqueNodes.length} 節點)</h1>
    <div class="result">
      <div class="result-title">🔗 自適應 (自動辨識客戶端)</div>
      <div class="result-link">${adaptiveLink}</div>
    </div>
    <div class="result">
      <div class="result-title">📄 Sing-Box (JSON)</div>
      <div class="result-link">${host}/?url=${encodedUrl}${filterQuery}&target=singbox</div>
    </div>
    <div class="result">
      <div class="result-title">📋 Clash Meta (YAML)</div>
      <div class="result-link">${host}/?url=${encodedUrl}${filterQuery}&target=clash</div>
    </div>
    <div class="result">
      <div class="result-title">🔗 Base64</div>
      <div class="result-link">${host}/?url=${encodedUrl}${filterQuery}&target=base64</div>
    </div>
    
    <!-- 提供三個平台的下載按鈕 -->
    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 1.5rem;">
      <a class="btn" style="background: #3b82f6; margin-top: 0;" href="${host}/?url=${encodedUrl}${filterQuery}&target=base64">📥 下載 Base64 訂閱</a>
      <a class="btn" style="background: #f59e0b; margin-top: 0;" href="${host}/?url=${encodedUrl}${filterQuery}&target=clash">📥 下載 Clash Meta 訂閱</a>
      <a class="btn" style="background: #10b981; margin-top: 0;" href="${host}/?url=${encodedUrl}${filterQuery}&target=singbox">📥 下載 Sing-Box 訂閱</a>
    </div>
  </div>
</body>
</html>
`;
  return new Response(htmlInfo, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

let result = '';
let contentType = 'text/plain';
let fileExt = '.txt';

if (target === 'clash') { 
  result = await toClashWithTemplate(uniqueNodes); 
  contentType = 'text/yaml'; 
  fileExt = '.yaml';
} else if (target === 'base64') { 
  result = toBase64(uniqueNodes); 
  contentType = 'text/plain'; 
  fileExt = '.txt';
} else { 
  result = await toSingBoxWithTemplate(uniqueNodes); 
  contentType = 'application/json'; 
  fileExt = '.json';
}

const filename = `subscription${fileExt}`;

const responseHeaders: Record<string, string> = {
  'Content-Type': `${contentType}; charset=utf-8`, 
  'Access-Control-Allow-Origin': '*', 
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'profile-title': filename, 
  'subscription-title': filename,
  'Content-Disposition': `inline; filename="${filename}"`,
  'Profile-Update-Interval': '3600',
};

if (hasTrafficInfo) {
  let userInfoHeader = `upload=${totalUpload}; download=${totalDownload}; total=${totalTotal}`;
  if (minExpire > 0) {
    userInfoHeader += `; expire=${minExpire}`;
  }
  responseHeaders['subscription-userinfo'] = userInfoHeader;
}

return new Response(result, { headers: responseHeaders });
}
};
