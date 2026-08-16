// src/index.ts
import packageJson from '../package.json';
import { Env, ProxyNode } from './types';
import { parseContent } from './parser';
import { toClashMeta, toSingBox, toBase64, toRawLinks, toSurge, toShadowrocketConf } from './generator';
import { processNodes, createUserinfoNodes, parseUserinfo, getRegionByNodeName } from './utils';
import { isAuthorized, fetchSubscriptionWithTimeout, extractRequestToken, sanitizeUrlForLog } from './security';
import { renderHtmlPage } from './ui';

const APP_VERSION = packageJson.version || '3.0.0-hardened';

// 基础跨域响应头
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
 * 核心节点聚合与并发拉取逻辑（Promise.allSettled 并行抓取加速）
 */
async function loadAllNodes(
  urlParam: string,
  customUserAgent?: string,
  enableCache = true
): Promise<{ nodes: ProxyNode[]; userinfo?: string }> {
  const inputs = urlParam.split(/[\n\r|]+/);
  const allNodes: ProxyNode[] = [];
  let userinfo: string | undefined = undefined;

  const safeInputs = inputs.slice(0, 30);
  const fetchTasks: Array<Promise<{ ok: boolean; status: number; text: string; userinfo?: string; originalUrl: string }>> = [];
  const rawTexts: string[] = [];

  for (const input of safeInputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      fetchTasks.push(
        fetchSubscriptionWithTimeout(trimmed, customUserAgent, enableCache)
          .then(res => ({ ...res, originalUrl: trimmed }))
          .catch(err => {
            console.error(`Fetch subscription failed for: ${sanitizeUrlForLog(trimmed)} - ${err.message}`);
            return { ok: false, status: 500, text: '', userinfo: undefined, originalUrl: trimmed };
          })
      );
    } else {
      rawTexts.push(trimmed);
    }
  }

  // 并行并发拉取所有远程订阅，大幅缩短总体延迟
  if (fetchTasks.length > 0) {
    const fetchResults = await Promise.allSettled(fetchTasks);

    for (const result of fetchResults) {
      if (result.status === 'fulfilled' && result.value.ok && result.value.text) {
        if (!userinfo && result.value.userinfo) {
          userinfo = result.value.userinfo;
        }
        try {
          const parsed = await parseContent(result.value.text);
          allNodes.push(...parsed);
        } catch (err: any) {
          console.error(`Parse content failed for: ${sanitizeUrlForLog(result.value.originalUrl)}`);
        }
      }
    }
  }

  // 解析直接输入的节点链接或 Base64
  for (const rawText of rawTexts) {
    try {
      const parsed = await parseContent(rawText);
      allNodes.push(...parsed);
    } catch (err: any) {
      console.error('Parse raw node input failed');
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

    // 4. 实时节点解析与流量预览接口 (/api/preview)
    if (request.method === 'POST' && url.pathname === '/api/preview') {
      try {
        const body: any = await request.json();
        const rawUrl = body.url || '';
        const requestToken = body.token || extractRequestToken(request, url);

        if (!isAuthorized(env.AUTH_TOKEN, requestToken, env.PUBLIC_MODE as string)) {
          return new Response(JSON.stringify({ error: '未经授权: Token 缺失或无效' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        if (!rawUrl.trim()) {
          return new Response(JSON.stringify({ error: '请输入订阅链接' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const clientUserAgent = request.headers.get('User-Agent') || undefined;
        const { nodes: rawNodes, userinfo } = await loadAllNodes(rawUrl, clientUserAgent, true);

        // 过滤与重命名
        const renameRules: Array<{ search: string; replace: string }> = [];
        if (body.rename) {
          const pairs = String(body.rename).split(/[\n,;]+/);
          for (const pair of pairs) {
            const trimmed = pair.trim();
            if (!trimmed) continue;
            if (trimmed.includes('=')) {
              const [search, ...rest] = trimmed.split('=');
              if (search) renameRules.push({ search, replace: rest.join('=') });
            }
          }
        }

        const processedNodes = processNodes(rawNodes, {
          includeRegex: body.include,
          excludeRegex: body.exclude,
          renameRules,
          addEmoji: body.emoji !== false,
          enableUdp: body.udp !== false
        });

        // 地区统计
        const regionStats: Record<string, number> = {};
        for (const n of processedNodes) {
          const reg = getRegionByNodeName(n.name);
          const key = reg ? `${reg.flag} ${reg.name}` : '🌐 其他';
          regionStats[key] = (regionStats[key] || 0) + 1;
        }

        const userinfoObj = parseUserinfo(userinfo);

        return new Response(
          JSON.stringify({
            ok: true,
            totalRaw: rawNodes.length,
            totalMatched: processedNodes.length,
            userinfo: userinfoObj,
            regions: regionStats,
            nodes: processedNodes.slice(0, 150).map(n => ({
              name: n.name,
              type: n.type,
              server: n.server,
              port: n.port
            }))
          }),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              ...CORS_HEADERS
            }
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `预览失败: ${err.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
    }

    // 5. 标准订阅转换接口 (/sub)
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
      let preset = 'standard';
      let requestToken = extractRequestToken(request, url);
      let filename = 'SubConverter';
      let enableCache = url.searchParams.get('nocache') !== '1';

      if (request.method === 'GET') {
        rawUrl = url.searchParams.get('url') || '';
        target = (url.searchParams.get('target') || detectedTarget).toLowerCase();
        includeRegex = url.searchParams.get('include') || '';
        excludeRegex = url.searchParams.get('exclude') || '';
        renameRulesStr = url.searchParams.get('rename') || '';
        addEmoji = url.searchParams.get('emoji') !== '0' && url.searchParams.get('flag') !== '0';
        enableUdp = url.searchParams.get('udp') !== '0';
        showInfo = url.searchParams.get('info') !== '0' && url.searchParams.get('show_info') !== '0';
        preset = (url.searchParams.get('preset') || 'standard').toLowerCase();
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
          preset = (body.preset || 'standard').toLowerCase();
          if (body.token) requestToken = body.token;
          filename = body.filename || 'SubConverter';
          if (body.nocache === true) enableCache = false;
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

        // 并发拉取并解析节点
        const { nodes: rawNodes, userinfo } = await loadAllNodes(rawUrl, clientUserAgent, enableCache);

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

        // 过滤与重命名
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
          const yamlOutput = toClashMeta(processedNodes, undefined, preset);
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
        const defaultOutput = toClashMeta(processedNodes, undefined, preset);
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
