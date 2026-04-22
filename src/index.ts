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
        
        // 過濾不支援的 anytls 協議，防止解析報錯
        if (trimmed.startsWith('anytls://')) return;
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

      const filename = `subscription${fileExt}`;
      const encodedName = encodeURIComponent(path || 'subscription');

      return new Response(result, { 
        headers: { 
          'Content-Type': contentType, 
          'Access-Control-Allow-Origin': '*', 
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'profile-title': encodedName, 
          'subscription-title': encodedName,
          'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Profile-Update-Interval': '3600',
        } 
      });

    } catch (err: any) { return new Response(`轉換錯誤: ${err.message}`, { status: 500 }); }
  },
};
