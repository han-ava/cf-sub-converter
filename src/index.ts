// src/index.ts
import packageJson from '../package.json';
import { Env, ProxyNode } from './types';
import { parseContent } from './parser';
import { toClashMeta, toSingBox, toBase64, toRawLinks, toSurge, toShadowrocketConf } from './generator';
import { processNodes, createUserinfoNodes } from './utils';
import { isAuthorized, fetchSubscriptionWithTimeout, extractRequestToken, sanitizeUrlForLog } from './security';
import { renderHtmlPage } from './ui';

const APP_VERSION = packageJson.version || '3.0.0-hardened';

// 基础跨域响应头（保持客户端兼容）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400'
};

// 首页安全防护响应头
const SECURITY_PAGE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'interest-cohort=()'
};

/**
 * 核心节点聚合与拉取逻辑（内置日志脱敏与最大并发/数量限制）
 */
async function loadAllNodes(urlParam: string, customUserAgent?: string): Promise<{ nodes: ProxyNode[]; userinfo?: string }> {
  const inputs = urlParam.split(/[\n\r|]+/);
  const allNodes: ProxyNode[] = [];
  let userinfo: string | undefined = undefined;

  // 限制单次最多聚合 30 个订阅链接，防止无限循环
  const safeInputs = inputs.slice(0, 30);

  for (const input of safeInputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const fetchResult = await fetchSubscriptionWithTimeout(trimmed, customUserAgent);
        if (fetchResult.ok && fetchResult.text) {
          if (!userinfo && fetchResult.userinfo) {
            userinfo = fetchResult.userinfo;
          }
          const parsed = await parseContent(fetchResult.text);
          allNodes.push(...parsed);
        }
      } catch (err: any) {
        // 日志脱敏：仅打印 Host 与安全错误信息，绝不打印完整 Token 链接
        console.error(`Fetch subscription failed for: ${sanitizeUrlForLog(trimmed)} - ${err.message}`);
      }
    } else {
      // 直接作为节点链接或 Base64 解析
      try {
        const parsed = await parseContent(trimmed);
        allNodes.push(...parsed);
      } catch (err: any) {
        console.error(`Parse raw node input failed - ${err.message}`);
      }
    }
  }

  return { nodes: allNodes, userinfo };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS 跨域预检处理
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. 首页 UI
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return new Response(renderHtmlPage(APP_VERSION), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          ...CORS_HEADERS,
          ...SECURITY_PAGE_HEADERS
        }
      });
    }

    // 3. 版本与健康检查接口 (/version)
    if (request.method === 'GET' && url.pathname === '/version') {
      return new Response(
        JSON.stringify({
          name: 'cf-sub-converter',
          version: APP_VERSION,
          status: 'ok',
          security: 'hardened'
        }),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS
          }
        }
      );
    }

    // 4. 标准订阅转换接口 (/sub)
    if (url.pathname === '/sub' || url.pathname === '/api/convert') {
      const clientUserAgent = request.headers.get('User-Agent') || '';
      let detectedTarget = 'clash';

      if (/Shadowrocket/i.test(clientUserAgent)) {
        detectedTarget = 'shadowrocket';
      } else if (/Clash|Mihomo|Stash/i.test(clientUserAgent)) {
        detectedTarget = 'clash';
      } else if (/sing-box/i.test(clientUserAgent)) {
        detectedTarget = 'singbox';
      } else if (/Surge/i.test(clientUserAgent)) {
        detectedTarget = 'surge';
      }

      let rawUrl = '';
      let target = '';
      let includeRegex = '';
      let excludeRegex = '';
      let renameRulesStr = '';
      let addEmoji = true;
      let enableUdp = true;
      let showInfo = true;
      let requestToken = extractRequestToken(request, url);
      let filename = 'SubConverter';

      if (request.method === 'GET') {
        rawUrl = url.searchParams.get('url') || '';
        target = (url.searchParams.get('target') || detectedTarget).toLowerCase();
        includeRegex = url.searchParams.get('include') || '';
        excludeRegex = url.searchParams.get('exclude') || '';
        renameRulesStr = url.searchParams.get('rename') || '';
        addEmoji = url.searchParams.get('emoji') !== '0' && url.searchParams.get('flag') !== '0';
        enableUdp = url.searchParams.get('udp') !== '0';
        showInfo = url.searchParams.get('info') !== '0' && url.searchParams.get('show_info') !== '0';
        filename = url.searchParams.get('filename') || 'SubConverter';
      } else if (request.method === 'POST') {
        try {
          const body: any = await request.json();
          rawUrl = body.url || '';
          target = (body.target || detectedTarget).toLowerCase();
          includeRegex = body.include || '';
          excludeRegex = body.exclude || '';
          renameRulesStr = body.rename || '';
          addEmoji = body.emoji !== false && body.flag !== false;
          enableUdp = body.udp !== false;
          showInfo = body.info !== false && body.show_info !== false;
          if (body.token) requestToken = body.token;
          filename = body.filename || 'SubConverter';
        } catch {
          return new Response(JSON.stringify({ error: '无效的 JSON 请求体' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }
      }

      // 访问鉴权校验
      if (!isAuthorized(env.AUTH_TOKEN, requestToken, env.PUBLIC_MODE as string)) {
        return new Response(JSON.stringify({ error: '未经授权: Token 缺失或无效' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      if (!rawUrl.trim()) {
        return new Response(JSON.stringify({ error: '参数缺失: 缺少 url 订阅链接' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      try {
        // 解析重命名规则 (格式: "香港=HK, 日本=JP" 或换行)
        const renameRules: Array<{ search: string; replace: string }> = [];
        if (renameRulesStr) {
          const pairs = renameRulesStr.split(/[\n,;]+/);
          for (const pair of pairs) {
            const trimmed = pair.trim();
            if (!trimmed) continue;
            if (trimmed.includes('=')) {
              const [search, ...rest] = trimmed.split('=');
              if (search) renameRules.push({ search, replace: rest.join('=') });
            } else if (trimmed.includes('@')) {
              const [search, ...rest] = trimmed.split('@');
              if (search) renameRules.push({ search, replace: rest.join('@') });
            }
          }
        }

        // 拉取并解析节点
        const { nodes: rawNodes, userinfo } = await loadAllNodes(rawUrl, clientUserAgent);

        if (rawNodes.length === 0) {
          return new Response('未成功解析到任何可用代理节点，请检查原始订阅链接是否有效。', {
            status: 404,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'private, no-store, no-cache, must-revalidate',
              ...CORS_HEADERS
            }
          });
        }

        // 过滤与重命名（内部包含字符清洗与长度截断）
        let processedNodes = processNodes(rawNodes, {
          includeRegex,
          excludeRegex,
          renameRules,
          addEmoji,
          enableUdp
        });

        // 响应头构建：禁止私密订阅被中间缓存
        const responseHeaders: Record<string, string> = {
          ...CORS_HEADERS,
          'Cache-Control': 'private, no-store, no-cache, must-revalidate',
          'profile-update-interval': '24',
          'profile-web-page-url': url.origin
        };

        if (userinfo) {
          responseHeaders['subscription-userinfo'] = userinfo;
        }

        // Shadowrocket 或 Base64 模式下如果开启了 showInfo 并且存在流量信息，生成置顶提示节点
        if (showInfo && userinfo && (target === 'shadowrocket' || target === 'rocket' || target === 'base64')) {
          const infoNodes = createUserinfoNodes(userinfo);
          processedNodes = [...infoNodes, ...processedNodes];
        }

        // 根据 target 输出对应配置
        if (target === 'clash' || target === 'meta' || target === 'mihomo') {
          const yamlOutput = toClashMeta(processedNodes);
          responseHeaders['Content-Type'] = 'text/yaml; charset=utf-8';
          responseHeaders['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}.yaml"`;
          return new Response(yamlOutput, { headers: responseHeaders });
        }

        if (target === 'singbox' || target === 'sing-box') {
          const jsonOutput = toSingBox(processedNodes);
          responseHeaders['Content-Type'] = 'application/json; charset=utf-8';
          responseHeaders['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}.json"`;
          return new Response(jsonOutput, { headers: responseHeaders });
        }

        if (target === 'shadowrocket' || target === 'rocket' || target === 'base64') {
          const base64Output = toBase64(processedNodes);
          responseHeaders['Content-Type'] = 'text/plain; charset=utf-8';
          return new Response(base64Output, { headers: responseHeaders });
        }

        if (target === 'shadowrocket-conf') {
          const confOutput = toShadowrocketConf(processedNodes);
          responseHeaders['Content-Type'] = 'text/plain; charset=utf-8';
          responseHeaders['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}.conf"`;
          return new Response(confOutput, { headers: responseHeaders });
        }

        if (target === 'surge') {
          const surgeOutput = toSurge(processedNodes);
          responseHeaders['Content-Type'] = 'text/plain; charset=utf-8';
          return new Response(surgeOutput, { headers: responseHeaders });
        }

        if (target === 'raw') {
          const rawOutput = toRawLinks(processedNodes);
          responseHeaders['Content-Type'] = 'text/plain; charset=utf-8';
          return new Response(rawOutput, { headers: responseHeaders });
        }

        // 默认返回 Clash Meta
        const defaultOutput = toClashMeta(processedNodes);
        responseHeaders['Content-Type'] = 'text/yaml; charset=utf-8';
        return new Response(defaultOutput, { headers: responseHeaders });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `订阅转换失败: ${err.message}` }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
            ...CORS_HEADERS
          }
        });
      }
    }

    // 404 Not Found
    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
