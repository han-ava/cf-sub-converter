// src/index.ts
import packageJson from '../package.json';
import { Env, ProxyNode } from './types';
import { parseContent } from './parser';
import { toClashMeta, toSingBox, toBase64, toRawLinks, toSurge, toShadowrocketConf } from './generator';
import { adaptNodeToMihomo } from './adapters/mihomo';
import { processNodes, createUserinfoNodes, parseUserinfo, getRegionByNodeName, parseRenameRules, formatContentDisposition } from './utils';
import { isAuthorized, checkAuthStatus, fetchSubscriptionWithTimeout, extractRequestToken, sanitizeUrlForLog } from './security';
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
 * 限制并发的异步任务执行器（Worker Pool，默认最大并发 6）
 * 使用显式任务队列避免共享可变索引的竞态隐患
 */
async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 6): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  // 构建带索引的任务队列，通过 pop 逐个消费（pop 是同步原子操作）
  const queue = items.map((item, i) => ({ item, i }));
  queue.reverse(); // reverse 使 pop 按原始顺序消费

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    let task: { item: T; i: number } | undefined;
    while ((task = queue.pop()) !== undefined) {
      results[task.i] = await fn(task.item);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * 汇总多个机场的流量信息
 */
function mergeUserinfos(userinfos: string[], strategy: 'first' | 'sum' | 'none'): string | undefined {
  const validInfos = userinfos.filter(Boolean);
  if (validInfos.length === 0) return undefined;
  if (validInfos.length === 1) return validInfos[0];

  if (strategy === 'none') return undefined;
  if (strategy === 'first') return validInfos[0];

  // strategy === 'sum'
  let totalUpload = 0;
  let totalDownload = 0;
  let totalTotal = 0;
  let minExpire = Infinity;

  for (const info of validInfos) {
    const parsed = parseUserinfo(info);
    if (parsed) {
      totalUpload += parsed.upload || 0;
      totalDownload += parsed.download || 0;
      totalTotal += parsed.total || 0;
      if (parsed.expire && parsed.expire < minExpire) {
        minExpire = parsed.expire;
      }
    }
  }

  const expirePart = minExpire !== Infinity ? `; expire=${minExpire}` : '';
  return `upload=${totalUpload}; download=${totalDownload}; total=${totalTotal}${expirePart}`;
}

/**
 * 核心节点聚合与并发控制抓取逻辑
 */
async function loadAllNodes(
  urlParam: string,
  customUserAgent?: string,
  enableCache = true,
  cacheTtl = 180,
  userinfoStrategy?: 'first' | 'sum' | 'none',
  outerSignal?: AbortSignal
): Promise<{ nodes: ProxyNode[]; userinfo?: string }> {
  const inputs = urlParam.split(/[\n\r|]+/);
  const allNodes: ProxyNode[] = [];
  const fetchedUserinfos: string[] = [];

  const safeInputs = inputs.slice(0, 20); // 最多 20 个订阅源
  const remoteUrls: string[] = [];
  const rawTexts: string[] = [];

  for (const input of safeInputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      remoteUrls.push(trimmed);
    } else {
      rawTexts.push(trimmed);
    }
  }

  // 限制最大并发数为 6，避免对 Worker 与上游造成瞬时压力
  if (remoteUrls.length > 0) {
    const fetchResults = await pMap(
      remoteUrls,
      async (url) => {
        try {
          return await fetchSubscriptionWithTimeout(url, customUserAgent, enableCache, cacheTtl, outerSignal);
        } catch (err: any) {
          console.error(`Fetch subscription failed for: ${sanitizeUrlForLog(url)} - ${err.message}`);
          return { ok: false, status: 500, text: '', userinfo: undefined };
        }
      },
      6
    );

    for (const result of fetchResults) {
      if (result.ok && result.text) {
        if (result.userinfo) {
          fetchedUserinfos.push(result.userinfo);
        }
        try {
          const parsed = await parseContent(result.text);
          allNodes.push(...parsed);
        } catch {
          console.error('Parse subscription content failed');
        }
      }
    }
  }

  // 解析直接输入的节点链接或 Base64
  for (const rawText of rawTexts) {
    try {
      const parsed = await parseContent(rawText);
      allNodes.push(...parsed);
    } catch {
      console.error('Parse raw node input failed');
    }
  }

  // 多订阅默认不混淆流量（none），单订阅保留原样（first）
  const strategy = userinfoStrategy || (remoteUrls.length > 1 ? 'none' : 'first');
  const mergedUserinfo = mergeUserinfos(fetchedUserinfos, strategy);
  return { nodes: allNodes, userinfo: mergedUserinfo };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS 跨域预检处理
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. 首页 UI (禁止客户端与边缘缓存 HTML，确保更新即时生效)
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return new Response(renderHtmlPage(APP_VERSION), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...CORS_HEADERS,
          ...SECURITY_PAGE_HEADERS
        }
      });
    }

    // 3. 版本与健康检查接口 (/version)
    if (request.method === 'GET' && url.pathname === '/version') {
      const isTokenSet = typeof env.AUTH_TOKEN === 'string' && env.AUTH_TOKEN.trim().length > 0;
      return new Response(
        JSON.stringify({
          name: 'cf-sub-converter',
          version: APP_VERSION,
          status: 'ok',
          security: 'hardened',
          auth_token_configured: isTokenSet,
          token_length: isTokenSet ? env.AUTH_TOKEN!.trim().length : 0
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

        // 详细 Token 鉴权诊断
        const authResult = checkAuthStatus(env.AUTH_TOKEN, requestToken);
        if (!authResult.authorized) {
          return new Response(JSON.stringify({ error: authResult.reason }), {
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

        const { nodes: rawNodes, userinfo } = await loadAllNodes(rawUrl, undefined, true, 180, 'first');

        // 过滤与重命名
        const renameRules = parseRenameRules(body.rename ? String(body.rename) : '');

        const processedNodes = processNodes(rawNodes, {
          includeRegex: body.include,
          excludeRegex: body.exclude,
          renameRules,
          addEmoji: body.emoji !== false,
          enableUdp: body.udp !== false
        });

        // 统计计算全量 processedNodes（不受 UI 1000 条截断影响）
        let perfectCount = 0;
        let warningCount = 0;
        let fatalCount = 0;

        const allConvResults = processedNodes.map(n => {
          const adaptRes = adaptNodeToMihomo(n);
          let status: 'perfect' | 'warning' | 'fatal' = 'perfect';
          if (adaptRes.fatal) { status = 'fatal'; fatalCount++; }
          else if (adaptRes.lossy || adaptRes.warnings.length > 0) { status = 'warning'; warningCount++; }
          else { perfectCount++; }
          return { n, adaptRes, status };
        });

        const finalCount = perfectCount + warningCount;

        // 计算全量 warning / unsupportedParams 聚合诊断数据
        const warningAggMap: Record<string, { protocol: string; param: string; sampleMessage?: string; count: number }> = {};
        for (const { n, adaptRes, status } of allConvResults) {
          if (status === 'warning') {
            const proto = n.protocol.toUpperCase();
            if (adaptRes.unsupportedParams && adaptRes.unsupportedParams.length > 0) {
              for (const p of adaptRes.unsupportedParams) {
                const key = `${proto}::${p}`;
                if (!warningAggMap[key]) {
                  warningAggMap[key] = { protocol: proto, param: p, count: 0 };
                }
                warningAggMap[key].count++;
              }
            } else if (adaptRes.warnings && adaptRes.warnings.length > 0) {
              for (const w of adaptRes.warnings) {
                const p = w.field || w.message;
                const key = `${proto}::${p}`;
                if (!warningAggMap[key]) {
                  warningAggMap[key] = { protocol: proto, param: p, sampleMessage: w.message, count: 0 };
                }
                warningAggMap[key].count++;
              }
            }
          }
        }
        const warningAggregations = Object.values(warningAggMap).sort((a, b) => b.count - a.count);

        // UI 展示截取前 1000 条（统计已在全量计算完毕）
        const nodeItems = allConvResults.slice(0, 1000).map(({ n, adaptRes, status }) => ({
          name: n.name,
          type: n.protocol,
          server: n.server,
          port: n.port,
          conversion: {
            status,
            emitted: adaptRes.emitted,
            target: 'mihomo',
            lossy: adaptRes.lossy,
            warnings: adaptRes.warnings.map(w => `[${w.level.toUpperCase()}] ${w.message}`),
            unsupportedParams: adaptRes.unsupportedParams,
            skipReason: adaptRes.skipReason
          }
        }));

        // 地区统计基于全量节点（确保在正则筛选时，所有地区标签始终完整保留并展示，支持即时快速切换）
        const preFilteredNodes = processNodes(rawNodes, {
          renameRules,
          addEmoji: body.emoji !== false,
          enableUdp: body.udp !== false
        });

        const regionStats: Record<string, number> = {};
        for (const n of preFilteredNodes) {
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
            perfectCount,
            warningCount,
            fatalCount,
            finalCount,
            userinfo: userinfoObj,
            regions: regionStats,
            warningAggregations,
            nodes: nodeItems
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
      let testUrl = 'http://www.gstatic.com/generate_204';
      let infoStrategy: 'first' | 'sum' | 'none' = 'first';
      let requestToken = extractRequestToken(request, url);
      let filename = 'SubConverter';
      let enableCache = url.searchParams.get('nocache') !== '1';
      let cacheTtl = 180;

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
        testUrl = url.searchParams.get('test_url') || 'http://www.gstatic.com/generate_204';
        filename = url.searchParams.get('filename') || 'SubConverter';

        const infoParam = url.searchParams.get('info_mode');
        if (infoParam === 'sum' || infoParam === 'none' || infoParam === 'first') {
          infoStrategy = infoParam;
        }

        const ttlParam = parseInt(url.searchParams.get('cache_ttl') || '', 10);
        if (!isNaN(ttlParam) && ttlParam > 0) cacheTtl = ttlParam;
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
          testUrl = body.test_url || 'http://www.gstatic.com/generate_204';
          if (body.info_mode) infoStrategy = body.info_mode;
          if (body.token) requestToken = body.token;
          filename = body.filename || 'SubConverter';
          if (body.nocache === true) enableCache = false;
          if (body.cache_ttl) cacheTtl = Number(body.cache_ttl);
        } catch {
          return new Response(JSON.stringify({ error: '无效的 JSON 请求体' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }
      }

      // 严格鉴权校验：未配置 AUTH_TOKEN 或 Token 不匹配直接拒绝
      const authResult = checkAuthStatus(env.AUTH_TOKEN, requestToken);
      if (!authResult.authorized) {
        return new Response(
          JSON.stringify({
            error: authResult.reason,
            hint: '请确认网页或订阅链接中的 &token= 与 Cloudflare Dashboard 中设置的 AUTH_TOKEN 一致'
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          }
        );
      }

      if (!rawUrl.trim()) {
        return new Response(JSON.stringify({ error: '参数缺失: 缺少 url 订阅链接' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // 全局 25 秒超时防护
      const globalAbortController = new AbortController();
      const globalTimeout = setTimeout(() => globalAbortController.abort(), 25000);

      try {
        // 解析重命名规则 (支持 DEL-前缀、=、@、- 以及逗号/换行/分号/竖线分隔)
        const renameRules = parseRenameRules(renameRulesStr);

        // 并发池拉取并解析节点 (统一使用 UPSTREAM_USER_AGENT)
        const { nodes: rawNodes, userinfo } = await loadAllNodes(
          rawUrl,
          undefined,
          enableCache,
          cacheTtl,
          infoStrategy,
          globalAbortController.signal
        );

        clearTimeout(globalTimeout);

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

        // 过滤、重命名与特征去重
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
          'profile-web-page-url': url.origin,
          'profile-title': filename,
          'subscription-title': filename
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
          const yamlOutput = toClashMeta(processedNodes, undefined, preset, testUrl);
          responseHeaders['Content-Type'] = 'text/yaml; charset=utf-8';
          responseHeaders['Content-Disposition'] = formatContentDisposition(filename, 'yaml');
          return new Response(yamlOutput, { headers: responseHeaders });
        }

        if (target === 'singbox' || target === 'sing-box') {
          const jsonOutput = toSingBox(processedNodes);
          responseHeaders['Content-Type'] = 'application/json; charset=utf-8';
          responseHeaders['Content-Disposition'] = formatContentDisposition(filename, 'json');
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
          responseHeaders['Content-Disposition'] = formatContentDisposition(filename, 'conf');
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
        const defaultOutput = toClashMeta(processedNodes, undefined, preset, testUrl);
        responseHeaders['Content-Type'] = 'text/yaml; charset=utf-8';
        responseHeaders['Content-Disposition'] = formatContentDisposition(filename, 'yaml');
        return new Response(defaultOutput, { headers: responseHeaders });
      } catch (err: any) {
        clearTimeout(globalTimeout);
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
