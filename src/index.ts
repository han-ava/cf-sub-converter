import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames } from './utils';

export default {
async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
const url = new URL(request.url);

// 1. POST /save (儲存短連結到 KV，智慧儲存過濾與重命名規則)
if (request.method === 'POST' && url.pathname === '/save') {
  try {
    const body: any = await request.json();
    if (!body.path || !body.content) return new Response('Missing path or content', { status: 400 });
    
    // 儲存完整配置 (資料來源 + 保留 + 排除 + 重命名)
    const saveData = {
      content: body.content,
      include: body.include || '',
      exclude: body.exclude || '',
      rename: body.rename || ''
    };
    await env.SUB_CACHE.put(body.path, JSON.stringify(saveData));
    
    // 儲存成功後，自動重定向到結果頁面
    const redirectUrl = `/?url=${encodeURIComponent(body.content)}&target=singbox&include=${encodeURIComponent(body.include || '')}&exclude=${encodeURIComponent(body.exclude || '')}&rename=${encodeURIComponent(body.rename || '')}`;
    return new Response(null, { 
      status: 302, 
      headers: { 'Location': redirectUrl } 
    });
  } catch (e) { return new Response('Error saving profile', { status: 500 }); }
}

// 2. KV 收藏 API (支援 include、exclude 與 rename 欄位)
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

// POST /favs (新增收藏 - 支援過濾與重命名)
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

// PUT /favs (更新收藏 - 支援過濾與重命名)
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

// 3. GET /path (讀取短連結，同時取得對應規則)
let urlParam = url.searchParams.get('url') || '';
let includeParam = url.searchParams.get('include') || '';
let excludeParam = url.searchParams.get('exclude') || '';
let renameParam = url.searchParams.get('rename') || '';

const path = decodeURIComponent(url.pathname.slice(1)); 

if (path && path !== 'favicon.ico' && path !== '') {
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
      // 相容舊版純文字短連結
      urlParam = stored; 
    }
  }
}

// 顯示首頁 (沒有 url 參數也沒有短連結)
if (!urlParam || urlParam.trim() === '') {
  return new Response(HTML_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// 4. 解析並下載 (支援流量資訊透傳與合併)
const inputs = urlParam.split(/[\n\r|]+/); 
const allNodes: ProxyNode[] = [];
const errors: string[] = [];

// 流量資訊累加變數
let totalUpload = 0;
let totalDownload = 0;
let totalTotal = 0;
let minExpire = 0;
let hasTrafficInfo = false;

await Promise.all(inputs.map(async (input) => { 
  const trimmed = input.trim(); 
  if (!trimmed) return;
  
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
        
        // 💥 機場流量資訊 (subscription-userinfo) 解析與累加
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
              minExpire = expireVal; // 取多個訂閱中最先到期的時間
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
}));

if (allNodes.length === 0) {
  const errorReport = `未解析到任何有效節點。\n\n🔍 詳細錯誤診斷報告：\n-------------------------\n${errors.join('\n\n-------------------------\n')}`;
  return new Response(errorReport, { 
    status: 400, 
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } 
  });
}

// 智慧節點與過濾
let filteredNodes = allNodes;

// 💥【全新功能：1. 節點名稱替換 (Rename)】
// 順序最優先，必須在篩選前執行，才能讓直連對準乾淨的名字
if (renameParam) {
  try {
    const rules = renameParam.split(';');
    for (const rule of rules) {
      const [search, replace] = rule.split(',');
      if (search !== undefined && replace !== undefined) {
        filteredNodes.forEach(node => {
          if (node.name) {
            node.name = node.name.split(search).join(replace); // 安全的全局替換
          }
        });
      }
    }
  } catch (e) {
    console.error('Rename replacement failed:', e);
  }
}

// 💥【全新功能：2. 智慧保留與排除過濾】
const buildFilterRegex = (param: string): RegExp => {
  const safePattern = param.replace(/[xXｘＸ]/g, '[xXｘＸ×]').replace(/×/g, '[xXｘＸ×]');
  return new RegExp(safePattern, 'i');
};

// 僅保留關鍵字
if (includeParam) {
  try {
    const includeRegex = buildFilterRegex(includeParam);
    filteredNodes = filteredNodes.filter(node => includeRegex.test(node.name));
  } catch (e) {
    console.error('Invalid include regex:', e);
  }
}

// 排除關鍵字
if (excludeParam) {
  try {
    const excludeRegex = buildFilterRegex(excludeParam);
    filteredNodes = filteredNodes.filter(node => !excludeRegex.test(node.name));
  } catch (e) {
    console.error('Invalid exclude regex:', e);
  }
}

if (filteredNodes.length === 0) {
  return new Response('篩選與替換後，未剩下任何有效節點。', { 
    status: 400, 
    headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
  });
}

// 對篩選過後的節點進行 智慧排序、去重複命名、自動補國旗
const uniqueNodes = deduplicateNodeNames(filteredNodes);

const target = url.searchParams.get('target');

if (!target) {
  const host = `https://${url.host}`;
  const encodedUrl = encodeURIComponent(urlParam);
  let filterQuery = '';
  if (includeParam) filterQuery += `&include=${encodeURIComponent(includeParam)}`;
  if (excludeParam) filterQuery += `&exclude=${encodeURIComponent(excludeParam)}`;
  if (renameParam) filterQuery += `&rename=${encodeURIComponent(renameParam)}`;

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
    <h1>⚡ 篩選並轉換完成 (${uniqueNodes.length} 節點)</h1>
    <div class="result">
      <div class="result-title">📄 Sing-Box (JSON)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=singbox${filterQuery}</div>
    </div>
    <div class="result">
      <div class="result-title">📋 Clash Meta (YAML)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=clash${filterQuery}</div>
    </div>
    <div class="result">
      <div class="result-title">🔗 Base64 (原始)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=base64${filterQuery}</div>
    </div>
    <a class="btn" href="${host}/?url=${encodedUrl}&target=singbox${filterQuery}">📥 下載 Sing-Box 訂閱</a>
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

// 💥 組裝最終的 Header 物件 (包含流量透傳)
const responseHeaders: Record<string, string> = {
  'Content-Type': `${contentType}; charset=utf-8`, 
  'Access-Control-Allow-Origin': '*', 
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'profile-title': filename, 
  'subscription-title': filename,
  'Content-Disposition': `inline; filename="${filename}"`,
  'Profile-Update-Interval': '3600',
};

// 如果有機場回傳流量資訊，進行透傳，點亮客戶端流量面板
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
