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
    const path = url.pathname.slice(1); // 這是短鏈路徑
    let isShortLink = false;

    // 如果路徑存在且不是 favicon，嘗試從 KV 讀取
    if (path && path !== 'favicon.ico' && !urlParam) {
      const storedContent = await env.SUB_CACHE.get(path);
      if (storedContent) { 
        urlParam = storedContent; 
        isShortLink = true; // 標記這是短連結
      }
    }

    // 3. 如果沒有訂閱連結，顯示前端頁面
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
            // 加入隨機參數防止 fetch 到舊的訂閱內容
            const separator = trimmed.includes('?') ? '&' : '?';
            const resp = await fetch(`${trimmed}${separator}t=${Date.now()}`, { 
              headers: { 'User-Agent': 'v2rayng/1.8.5' } 
            }); 
            
            if (resp.ok) { 
              const text = await resp.text(); 
              allNodes.push(...await parseContent(text)); 
            } 
          } catch (e) {} 
        } else { 
          // 處理直接貼上的節點 (vmess://...)
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

      // 7. 設定名稱
      // 如果是短鏈，用短鏈名稱；否則用 subscription
      // 使用 encodeURIComponent 處理中文檔名，但 profile-title 通常吃原始字串
      const rawFilename = isShortLink ? decodeURIComponent(path) : 'subscription';
      const filename = `${rawFilename}${fileExt}`;
      const encodedFilename = encodeURIComponent(filename);
      // 這裡將名稱再做一次編碼，確保 header 不會因為中文報錯
      const safeProfileTitle = encodeURIComponent(rawFilename);

      // 8. 回傳結果
      return new Response(result, { 
        headers: { 
          'Content-Type': contentType, 
          'Access-Control-Allow-Origin': '*', 
          
          // 禁止快取
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',

          // [關鍵新增] 告訴 Shadowrocket/Clash 這個訂閱叫什麼名字
          // 優先使用 UTF-8 編碼的標頭，若不支援則使用 safeProfileTitle
          'profile-title': rawFilename, 
          'subscription-title': rawFilename, // 部分軟體使用這個

          // 檔案下載名稱
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
          
          // 更新間隔 (1小時)
          'Profile-Update-Interval': '3600',
        } 
      });

    } catch (err: any) { return new Response(`轉換錯誤: ${err.message}`, { status: 500 }); }
  },
};
