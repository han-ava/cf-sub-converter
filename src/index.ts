import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames } from './utils';

// 輔助：將字串轉為 RFC 2047 編碼 (=?UTF-8?B?...?=)
// 這是讓 HTTP Header 支援中文的標準做法
function encodeRFC2047(str: string): string {
  try {
    // 如果只有英文數字，直接回傳
    if (/^[\x00-\x7F]*$/.test(str)) return str;
    
    // 轉為 UTF-8 Base64
    const base64 = btoa(unescape(encodeURIComponent(str)));
    return `=?UTF-8?B?${base64}?=`;
  } catch (e) {
    return str; // 失敗則回傳原字串 (雖然可能會報錯，但總比掛掉好)
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url); 
    
    // 1. POST /save (KV Shortlink)
    if (request.method === 'POST' && url.pathname === '/save') {
      try {
        const body: any = await request.json();
        if (!body.path || !body.content) return new Response('Missing path or content', { status: 400 });
        await env.SUB_CACHE.put(body.path, body.content);
        return new Response('OK', { status: 200 });
      } catch (e) { return new Response('Error saving profile', { status: 500 }); }
    }

    // 2. GET /path (Shortlink Redirect)
    let urlParam = url.searchParams.get('url');
    // 解碼路徑 (例如 /我的節點)
    const path = decodeURIComponent(url.pathname.slice(1)); 
    let isShortLink = false;

    if (path && path !== 'favicon.ico' && !urlParam) {
      const storedContent = await env.SUB_CACHE.get(path);
      if (storedContent) { 
        urlParam = storedContent; 
        isShortLink = true; 
      }
    }

    // 3. 顯示前端
    if (!urlParam) return new Response(HTML_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    
    const target = url.searchParams.get('target') || 'singbox';
    
    try {
      // 4. 解析訂閱來源
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

      // 7. 設定名稱
      const rawFilename = isShortLink ? path : 'subscription';
      const filename = `${rawFilename}${fileExt}`;
      const encodedFilename = encodeURIComponent(filename);

      // [重點] 使用 RFC 2047 編碼處理中文標題
      const rfcTitle = encodeRFC2047(rawFilename);

      // 8. 回傳結果
      return new Response(result, { 
        headers: { 
          'Content-Type': contentType, 
          'Access-Control-Allow-Origin': '*', 
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',

          // 給小火箭/Clash 的標題
          'profile-title': rfcTitle,
          'subscription-title': rfcTitle,
          
          // 檔案下載名稱
          'Content-Disposition': `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
          
          'Profile-Update-Interval': '3600',
        } 
      });

    } catch (err: any) { return new Response(`轉換錯誤: ${err.message}`, { status: 500 }); }
  },
};
