import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames } from './utils';
export default {
async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
const url = new URL(request.url);

// 1. POST /save (儲存短連結到 KV)
if (request.method === 'POST' && url.pathname === '/save') {
  try {
    const body: any = await request.json();
    if (!body.path || !body.content) return new Response('Missing path or content', { status: 400 });
    await env.SUB_CACHE.put(body.path, body.content);
    return new Response('OK', { status: 200 });
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
let urlParam = url.searchParams.get('url');
// 解碼路徑 (例如 /myself)
const path = decodeURIComponent(url.pathname.slice(1)); 

if (path && path !== 'favicon.ico' && !urlParam) {
  const storedContent = await env.SUB_CACHE.get(path);
  if (storedContent) { 
    urlParam = storedContent; 
  }
}

// 3. 顯示前端頁面
if (!urlParam) return new Response(HTML_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const target = url.searchParams.get('target') || 'singbox';

try {
  // 4. 解析訂閱來源 (支援多行)
  const inputs = urlParam.split('|'); 
  const allNodes: ProxyNode[] = [];
  
  await Promise.all(inputs.map(async (input) => { 
    const trimmed = input.trim(); 
    if (!trimmed) return;
    
    if (trimmed.startsWith('http')) { 
      try { 
        // 加入隨機參數防止 fetch 緩存，確保拿到最新節點
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
      // 處理直接貼上的節點連結
      allNodes.push(...await parseContent(trimmed)); 
    }
  }));

  if (allNodes.length === 0) return new Response('未解析到任何有效節點', { status: 400 });
  
  // 5. 節點去重
  const uniqueNodes = deduplicateNodeNames(allNodes);

  // 6. 生成配置
  let result = ''; 
  let contentType = 'text/plain; charset=utf-8';
  let fileExt = '.txt';

  if (target === 'clash') { 
    result = await toClashWithTemplate(uniqueNodes); 
    contentType = 'text/yaml; charset=utf-8'; 
    fileExt = '.yaml';
  } else if (target === 'base64') { 
    result = toBase64(uniqueNodes); 
    contentType = 'text/plain; charset=utf-8'; 
    fileExt = '.txt';
  } else { 
    result = await toSingBoxWithTemplate(uniqueNodes); 
    contentType = 'application/json; charset=utf-8'; 
    fileExt = '.json';
  }

  // 7. 設定基本檔名
  // 使用 URL 編碼確保標頭不報錯，客戶端能解就解，不能解就顯示亂碼或網域，手動改名即可
  const filename = `subscription${fileExt}`;
  const encodedName = encodeURIComponent(path || 'subscription');

  // 8. 回傳結果
  return new Response(result, { 
    headers: { 
      'Content-Type': contentType, 
      'Access-Control-Allow-Origin': '*', 
      
      // 強制不快取，確保每次更新都是最新的
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',

      // 標準標頭
      'profile-title': encodedName, 
      'subscription-title': encodedName,
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Profile-Update-Interval': '3600',
    } 
  });

} catch (err: any) { return new Response(`轉換錯誤: ${err.message}`, { status: 500 }); }
},
};
