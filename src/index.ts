import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames } from './utils';

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
    // 使用 decodeURIComponent 確保中文路徑能被正確讀取
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
      
      // 編碼名稱 (用於 Header)
      const encodedFilename = encodeURIComponent(filename);
      const encodedTitle = encodeURIComponent(rawFilename);

      return new Response(result, { 
        headers: { 
          'Content-Type': contentType, 
          'Access-Control-Allow-Origin': '*', 
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',

          // [重點修正]
          // 1. 使用 URL 編碼的標題
          'profile-title': encodedTitle, 
          'subscription-title': encodedTitle,
          
          // 2. 改為 inline，並提供 UTF-8 檔名
          // 讓 App 知道這是一個可以直接讀取的配置，而不是下載檔
          'Content-Disposition': `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
          
          'Profile-Update-Interval': '3600',
        } 
      });

    } catch (err: any) { return new Response(`轉換錯誤: ${err.message}`, { status: 500 }); }
  },
};
