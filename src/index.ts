import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames } from './utils';

export default {
async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
const url = new URL(request.url);

// 1. POST /save (儲存短連結到 KV，儲存後自動顯示結果頁面)
if (request.method === 'POST' && url.pathname === '/save') {
  try {
    const body: any = await request.json();
    if (!body.path || !body.content) return new Response('Missing path or content', { status: 400 });
    await env.SUB_CACHE.put(body.path, body.content);
    
    // 儲存成功後，自動重定向到結果頁面
    const redirectUrl = `/?url=${encodeURIComponent(body.content)}&target=singbox`;
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

// GET /favs (讀取收藏)
if (request.method === 'GET' && url.pathname === '/favs') {
  const favs = await getFavs();
  return new Response(JSON.stringify(favs), { 
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
  });
}

// POST /favs (新增收藏)
if (request.method === 'POST' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (!body.name || !body.url) return new Response('Missing name or url', { status: 400 });
    const favs = await getFavs();
    favs.push({ name: body.name, url: body.url });
    await saveFavs(favs);
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error saving favorite', { status: 500 }); }
}

// PUT /favs (更新收藏)
if (request.method === 'PUT' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (body.index === undefined || !body.name || !body.url) return new Response('Missing data', { status: 400 });
    const favs = await getFavs();
    if (body.index >= 0 && body.index < favs.length) {
      favs[body.index] = { name: body.name, url: body.url };
      await saveFavs(favs);
    }
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error updating favorite', { status: 500 }); }
}

// DELETE /favs (刪除收藏)
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

// 2. GET /path (讀取短連結)
let urlParam = url.searchParams.get('url') || '';
// 解碼路徑 (例如 /myself)
const path = decodeURIComponent(url.pathname.slice(1)); 

// 優先從 KV 讀取短連結內容 (不受 urlParam 影響)
if (path && path !== 'favicon.ico' && path !== '') {
  const storedContent = await env.SUB_CACHE.get(path);
  if (storedContent) { 
    urlParam = storedContent; 
  }
}

// 顯示首頁 (沒有 url 參數也沒有短連結)
if (!urlParam || urlParam.trim() === '') {
  return new Response(HTML_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// 4. 解析並轉換為三種格式
const inputs = urlParam.split('|'); 
const allNodes: ProxyNode[] = [];

await Promise.all(inputs.map(async (input) => { 
  const trimmed = input.trim(); 
  if (!trimmed) return;
  
  if (trimmed.startsWith('http')) { 
    try { 
      const separator = trimmed.includes('?') ? '&' : '?';
      const resp = await fetch(`${trimmed}${separator}t=${Date.now()}`, { 
        headers: { 'User-Agent': 'v2rayNG/1.8.5' } 
      }); 
      
      if (resp.ok) { 
        const text = await resp.text(); 
        allNodes.push(...await parseContent(text)); 
      } 
    } catch (e) {} 
  } else { 
    allNodes.push(...await parseContent(trimmed)); 
  }
}));

if (allNodes.length === 0) return new Response('未解析到任何有效節點', { status: 400 });

const uniqueNodes = deduplicateNodeNames(allNodes);

// 檢查 target 參數
const target = url.searchParams.get('target');

if (!target) {
  // 沒有 target，顯示結果頁面
  const host = `https://${url.host}`;
  const encodedUrl = encodeURIComponent(urlParam);

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
    .btn { display: block; background: #22c55e; color: white; text-align: center; padding: 1rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 1.5rem; }
    .btn:hover { background: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ 轉換完成 (${uniqueNodes.length} 節點)</h1>
    
    <div class="result">
      <div class="result-title">📄 Sing-Box (JSON)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=singbox</div>
    </div>
    
    <div class="result">
      <div class="result-title">📋 Clash Meta (YAML)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=clash</div>
    </div>
    
    <div class="result">
      <div class="result-title">🔗 Base64 (原始)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=base64</div>
    </div>
    
    <a class="btn" href="${host}/?url=${encodedUrl}&target=singbox">📥 下載 Sing-Box 訂閱</a>
  </div>
</body>
</html>
`;

  return new Response(htmlInfo, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// 有 target，生成對應格式
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

return new Response(result, { 
  headers: { 
    'Content-Type': `${contentType}; charset=utf-8`, 
    'Access-Control-Allow-Origin': '*', 
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'profile-title': filename, 
    'subscription-title': filename,
    'Content-Disposition': `inline; filename="${filename}"`,
    'Profile-Update-Interval': '3600',
  } 
});
}
};
