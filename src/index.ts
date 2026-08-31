// src/index.ts
import packageJson from '../package.json';
import { Env, ProxyNode, NodeEnvelope } from './types';
import { parseContent } from './parser';
import { toClashMeta, toSingBox, toSurge, toShadowrocketConf } from './generator';
import { toRawLinks, toBase64 } from './adapters/raw';
import { adaptNodeToTarget, normalizeTarget } from './adapters/target';
import { adaptNodesToSingBox } from './adapters/singbox';
import { processNodes, createUserinfoNodes, parseUserinfo, getRegionByNodeName, parseRenameRules, formatContentDisposition, safeBase64Decode } from './utils';
import { isAuthorized, checkAuthStatus, fetchSubscriptionWithTimeout, extractRequestToken, sanitizeUrlForLog } from './security';
import { renderHtmlPage } from './ui';

const APP_VERSION = packageJson.version || '3.0.0-hardened';
const SHORT_LINK_PATH_PATTERN = /^\/s\/([A-Za-z0-9_-]{12})$/;

function createShortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseStoredShortTarget(value: string, origin: string): URL | null {
  try {
    const target = new URL(value, origin);
    if (
      target.origin !== origin ||
      (target.pathname !== '/sub' && target.pathname !== '/api/convert')
    ) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

function detectTargetFromUserAgent(userAgent: string): string {
  if (/Shadowrocket/i.test(userAgent)) return 'shadowrocket';
  if (/Clash|Mihomo|Stash/i.test(userAgent)) return 'clash';
  if (isAppleSingBoxClient(userAgent) || /sing-box/i.test(userAgent)) return 'singbox';
  if (/Surge/i.test(userAgent)) return 'surge';
  return 'clash';
}

function isAppleSingBoxClient(userAgent: string): boolean {
  return /\b(?:SFI|SFM|SFT)(?:[/\s(]|$)/i.test(userAgent);
}

function resolveTarget(requestedTarget: unknown, detectedTarget: string): string {
  const normalizedTarget = typeof requestedTarget === 'string'
    ? requestedTarget.trim().toLowerCase()
    : '';
  return !normalizedTarget || normalizedTarget === 'auto' ? detectedTarget : normalizedTarget;
}

function countProtocols(nodes: Array<Pick<ProxyNode, 'protocol'>>): Record<string, number> {
  return nodes.reduce((counts, node) => {
    const protocol = node.protocol || 'unknown';
    counts[protocol] = (counts[protocol] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

function countProtocolNames(protocols: string[]): Record<string, number> {
  return protocols.reduce((counts, protocol) => {
    const name = protocol || 'unknown';
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

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

export interface SourceSummary {
  index: number;
  url: string;
  type: 'remote' | 'direct';
  status?: number;
  contentType?: string;
  rawLength: number;
  decodedLength?: number;
  nodeCount: number;
  protocols: string[];
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
): Promise<{ nodes: ProxyNode[]; userinfo?: string; sources?: SourceSummary[] }> {
  const trimmedUrlParam = urlParam.replace(/^﻿/, '').trim();
  if (!trimmedUrlParam) {
    return { nodes: [], userinfo: undefined, sources: [] };
  }

  // 若输入不包含任何 http/https 远程订阅地址（即为用户直接粘贴的 Base64 订阅、YAML、JSON 或多行节点列表），优先作为整段配置解析，避免被行分割破坏 MIME Base64 或截断
  if (!trimmedUrlParam.includes('http://') && !trimmedUrlParam.includes('https://')) {
    console.log('[SOURCE_START]', { index: 0, source: 'direct_input' });
    console.log('[SOURCE_RESPONSE]', {
      index: 0,
      source: 'direct_input',
      status: 200,
      contentType: 'text/plain',
      length: trimmedUrlParam.length
    });

    let decoded = '';
    try {
      const candidate = safeBase64Decode(trimmedUrlParam);
      if (candidate && candidate !== trimmedUrlParam && candidate.trim() !== trimmedUrlParam.trim()) {
        decoded = candidate;
        console.log('[SOURCE_BASE64_DECODED]', {
          index: 0,
          source: 'direct_input',
          inputLength: trimmedUrlParam.length,
          decodedLength: decoded.length
        });
      }
    } catch {
      console.warn('[SOURCE_BASE64_DECODE_FAILED]', {
        index: 0,
        source: 'direct_input',
        inputLength: trimmedUrlParam.length
      });
    }

    try {
      const parsed = await parseContent(trimmedUrlParam);
      const protocols = parsed.map(n => n.protocol);
      console.log('[SOURCE_PARSE_RESULT]', {
        index: 0,
        source: 'direct_input',
        nodes: parsed.length,
        protocols: countProtocols(parsed)
      });

      const singleSummary: SourceSummary[] = [{
        index: 0,
        url: 'direct_input',
        type: 'direct',
        status: 200,
        contentType: 'text/plain',
        rawLength: trimmedUrlParam.length,
        decodedLength: decoded ? decoded.length : undefined,
        nodeCount: parsed.length,
        protocols
      }];

      console.log('[ALL_SOURCES_SUMMARY]', singleSummary.map(s => ({
        index: s.index,
        source: s.url,
        status: s.status,
        rawLength: s.rawLength,
        decodedLength: s.decodedLength,
        nodeCount: s.nodeCount,
        protocols: countProtocolNames(s.protocols)
      })));

      if (parsed.length > 0) {
        return { nodes: parsed, userinfo: undefined, sources: singleSummary };
      }
    } catch (err: any) {
      console.error('[SOURCE_PARSE_ERROR]', { index: 0, source: 'direct_input', error: err?.message || err });
    }
  }

  const inputs = urlParam.split(/[\n\r|]+/);
  const allNodes: ProxyNode[] = [];
  const fetchedUserinfos: string[] = [];
  const sourceSummaries: SourceSummary[] = [];

  const remoteUrls: string[] = [];
  const rawTexts: string[] = [];

  for (const input of inputs) {
    const trimmed = input.replace(/^﻿/, '').trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      remoteUrls.push(trimmed);
    } else {
      rawTexts.push(trimmed);
    }
  }

  // 远程订阅源最多并发拉取前 20 个，避免对 Worker 与上游造成瞬时压力
  const safeRemoteUrls = remoteUrls.slice(0, 20);
  if (safeRemoteUrls.length > 0) {
    const fetchResults = await pMap(
      safeRemoteUrls.map((url, i) => ({ url, index: i })),
      async ({ url, index }) => {
        console.log('[SOURCE_START]', { index, source: sanitizeUrlForLog(url) });
        try {
          const res = await fetchSubscriptionWithTimeout(url, customUserAgent, enableCache, cacheTtl, outerSignal);
          return { index, url, ...res };
        } catch (err: any) {
          console.error(`Fetch subscription failed for: ${sanitizeUrlForLog(url)} - ${err.message}`);
          return { index, url, ok: false, status: 500, text: '', userinfo: undefined, contentType: undefined, error: err.message };
        }
      },
      6
    );

    for (const res of fetchResults) {
      const { index, url, ok, status, text, userinfo, contentType } = res;
      console.log('[SOURCE_RESPONSE]', {
        index,
        source: sanitizeUrlForLog(url),
        status,
        contentType,
        length: text ? text.length : 0
      });

      if (userinfo) {
        fetchedUserinfos.push(userinfo);
      }

      if (ok && text) {
        let decoded = '';
        try {
          const candidate = safeBase64Decode(text);
          if (candidate && candidate !== text && candidate.trim() !== text.trim()) {
            decoded = candidate;
            console.log('[SOURCE_BASE64_DECODED]', {
              index,
              source: sanitizeUrlForLog(url),
              inputLength: text.length,
              decodedLength: decoded.length
            });
          }
        } catch {
          console.warn('[SOURCE_BASE64_DECODE_FAILED]', {
            index,
            source: sanitizeUrlForLog(url),
            inputLength: text.length
          });
        }

        let parsedNodes: NodeEnvelope[] = [];
        try {
          parsedNodes = await parseContent(text);
          allNodes.push(...parsedNodes);
        } catch (err: any) {
          console.error('[SOURCE_PARSE_ERROR]', { index, source: sanitizeUrlForLog(url), error: err?.message || err });
        }

        const protocols = parsedNodes.map(n => n.protocol);
        console.log('[SOURCE_PARSE_RESULT]', {
          index,
          source: sanitizeUrlForLog(url),
          nodes: parsedNodes.length,
          protocols: countProtocols(parsedNodes)
        });

        if (parsedNodes.length === 0) {
          console.warn('[SOURCE_PARSE_EMPTY]', {
            index,
            source: sanitizeUrlForLog(url),
            status,
            length: text.length
          });
        }

        sourceSummaries.push({
          index,
          url,
          type: 'remote',
          status,
          contentType,
          rawLength: text.length,
          decodedLength: decoded ? decoded.length : undefined,
          nodeCount: parsedNodes.length,
          protocols
        });
      } else {
        sourceSummaries.push({
          index,
          url,
          type: 'remote',
          status,
          contentType,
          rawLength: 0,
          nodeCount: 0,
          protocols: []
        });
      }
    }
  }

  // 解析直接输入的本地节点链接、多行文本或 Base64 块
  if (rawTexts.length > 0) {
    let directIdx = safeRemoteUrls.length;
    for (const rawText of rawTexts) {
      const idx = directIdx++;
      console.log('[SOURCE_START]', { index: idx, source: 'direct_input' });
      console.log('[SOURCE_RESPONSE]', {
        index: idx,
        source: 'direct_input',
        status: 200,
        contentType: 'text/plain',
        length: rawText.length
      });

      let decoded = '';
      try {
        const candidate = safeBase64Decode(rawText);
        if (candidate && candidate !== rawText && candidate.trim() !== rawText.trim()) {
          decoded = candidate;
          console.log('[SOURCE_BASE64_DECODED]', {
            index: idx,
            source: 'direct_input',
            inputLength: rawText.length,
            decodedLength: decoded.length
          });
        }
      } catch {
        console.warn('[SOURCE_BASE64_DECODE_FAILED]', {
          index: idx,
          source: 'direct_input',
          inputLength: rawText.length
        });
      }

      let parsedNodes: NodeEnvelope[] = [];
      try {
        parsedNodes = await parseContent(rawText);
        allNodes.push(...parsedNodes);
      } catch (err: any) {
        console.error('[SOURCE_PARSE_ERROR]', { index: idx, source: 'direct_input', error: err?.message || err });
      }

      const protocols = parsedNodes.map(n => n.protocol);
      console.log('[SOURCE_PARSE_RESULT]', {
        index: idx,
        source: 'direct_input',
        nodes: parsedNodes.length,
        protocols: countProtocols(parsedNodes)
      });

      if (parsedNodes.length === 0) {
        console.warn('[SOURCE_PARSE_EMPTY]', { index: idx, source: 'direct_input', length: rawText.length });
      }

      sourceSummaries.push({
        index: idx,
        url: 'direct_input',
        type: 'direct',
        status: 200,
        contentType: 'text/plain',
        rawLength: rawText.length,
        decodedLength: decoded ? decoded.length : undefined,
        nodeCount: parsedNodes.length,
        protocols
      });
    }
  }

  console.log(
    '[ALL_SOURCES_SUMMARY]',
    sourceSummaries.map(s => ({
      index: s.index,
      source: s.type === 'remote' ? sanitizeUrlForLog(s.url) : s.url,
      status: s.status,
      rawLength: s.rawLength,
      decodedLength: s.decodedLength,
      nodeCount: s.nodeCount,
      protocols: countProtocolNames(s.protocols)
    }))
  );

  // 多订阅默认不混淆流量（none），单订阅保留原样（first）
  const strategy = userinfoStrategy || (remoteUrls.length > 1 ? 'none' : 'first');
  const mergedUserinfo = mergeUserinfos(fetchedUserinfos, strategy);
  return { nodes: allNodes, userinfo: mergedUserinfo, sources: sourceSummaries };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let url = new URL(request.url);

    // 短链在 Worker 内部还原为订阅请求，避免 302 再次暴露完整长链接。
    if (request.method === 'GET') {
      const shortMatch = url.pathname.match(SHORT_LINK_PATH_PATTERN);
      if (shortMatch) {
        if (!env.SHORT_LINKS) {
          return new Response('短链存储未配置', { status: 503, headers: CORS_HEADERS });
        }

        const storedTarget = await env.SHORT_LINKS.get(`short:${shortMatch[1]}`);
        if (!storedTarget) {
          return new Response('短链不存在', { status: 404, headers: CORS_HEADERS });
        }

        const resolvedTarget = parseStoredShortTarget(storedTarget, url.origin);
        if (!resolvedTarget) {
          return new Response('短链无效', { status: 404, headers: CORS_HEADERS });
        }
        // KV 中不保存服务鉴权密钥；短链作为私密能力 URL，解析时使用当前 Secret 完成内部鉴权。
        if (env.AUTH_TOKEN) resolvedTarget.searchParams.set('token', env.AUTH_TOKEN.trim());
        url = resolvedTarget;
      }
    }

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
          token_length: isTokenSet ? env.AUTH_TOKEN!.trim().length : 0,
          short_links_configured: Boolean(env.SHORT_LINKS)
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

    // 4. 使用当前域名生成短链 (/api/shorten)
    if (request.method === 'POST' && url.pathname === '/api/shorten') {
      if (!env.SHORT_LINKS) {
        return new Response(JSON.stringify({ error: '短链存储未配置' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: '无效的 JSON 请求体' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      const target = parseStoredShortTarget(String(body.url || ''), url.origin);
      if (!target) {
        return new Response(JSON.stringify({ error: '只能缩短当前域名下的订阅转换链接' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      const requestToken = extractRequestToken(request, target);
      const authResult = checkAuthStatus(env.AUTH_TOKEN, requestToken);
      if (!authResult.authorized) {
        return new Response(JSON.stringify({ error: authResult.reason }), {
          status: 401,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      try {
        const code = createShortCode();
        const storedTarget = new URL(target);
        storedTarget.searchParams.delete('token');
        await env.SHORT_LINKS.put(`short:${code}`, `${storedTarget.pathname}${storedTarget.search}`);

        return new Response(JSON.stringify({ shortUrl: `${url.origin}/s/${code}` }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS
          }
        });
      } catch {
        return new Response(JSON.stringify({ error: '短链保存失败' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }
    }

    // 5. 实时节点解析与流量预览接口 (/api/preview)
    if (request.method === 'POST' && url.pathname === '/api/preview') {
      try {
        const body: any = await request.json();
        const rawUrl = body.url || '';
        const requestToken = body.token || extractRequestToken(request, url);
        const userAgent = request.headers.get('User-Agent') || '';
        const requestedTarget = typeof body.target === 'string'
          ? body.target.trim().toLowerCase()
          : 'auto';
        const isAutoTarget = !requestedTarget || requestedTarget === 'auto';
        const resolvedTarget = normalizeTarget(resolveTarget(requestedTarget, detectTargetFromUserAgent(userAgent)));
        console.log('[DEBUG][REQUEST]', {
          method: request.method,
          path: url.pathname,
          target: resolvedTarget || requestedTarget,
          userAgent,
          inputLength: String(rawUrl).length,
          hasToken: Boolean(requestToken),
          filters: {
            include: Boolean(body.include),
            exclude: Boolean(body.exclude),
            rename: Boolean(body.rename)
          }
        });

        // 详细 Token 鉴权诊断
        const authResult = checkAuthStatus(env.AUTH_TOKEN, requestToken);
        if (!authResult.authorized) {
          return new Response(JSON.stringify({ error: authResult.reason }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        if (!resolvedTarget) {
          return new Response(JSON.stringify({ error: `不支持的目标格式: ${requestedTarget || '空值'}` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        if (!rawUrl.trim()) {
          return new Response(JSON.stringify({ error: '请输入订阅链接' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const { nodes: rawNodes, userinfo, sources } = await loadAllNodes(rawUrl, undefined, true, 180, 'first');
        console.log('[DEBUG][PARSED_NODES]', {
          count: rawNodes.length,
          protocols: countProtocols(rawNodes)
        });

        // 过滤与重命名
        const renameRules = parseRenameRules(body.rename ? String(body.rename) : '');

        const processedNodes = processNodes(rawNodes, {
          includeRegex: body.include,
          excludeRegex: body.exclude,
          renameRules,
          addEmoji: body.emoji !== false,
          enableUdp: body.udp !== false
        });
        console.log('[DEBUG][PROCESSED_NODES]', {
          count: processedNodes.length,
          dropped: rawNodes.length - processedNodes.length,
          protocols: countProtocols(processedNodes)
        });

        let debugRaw = '';
        let debugBase64 = '';
        try {
          debugRaw = toRawLinks(processedNodes);
          debugBase64 = toBase64(processedNodes);
        } catch (e: any) {
          console.warn('[DEBUG] Failed to serialize debug raw/base64 in preview:', e?.message || e);
        }

        // 统计计算全量 processedNodes（不受 UI 1000 条截断影响）
        let perfectCount = 0;
        let warningCount = 0;
        let fatalCount = 0;

        const batchAdaptationResults = resolvedTarget === 'singbox'
          ? adaptNodesToSingBox(processedNodes)
          : undefined;
        const allConvResults = processedNodes.map((n, index) => {
          const adaptRes = batchAdaptationResults?.[index] || adaptNodeToTarget(n, resolvedTarget);
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
            target: resolvedTarget,
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
            requestedTarget: isAutoTarget ? 'auto' : requestedTarget,
            resolvedTarget,
            autoTargetFallback: isAutoTarget,
            totalRaw: rawNodes.length,
            totalMatched: processedNodes.length,
            perfectCount,
            warningCount,
            fatalCount,
            finalCount,
            userinfo: userinfoObj,
            regions: regionStats,
            warningAggregations,
            nodes: nodeItems,
            debug: {
              sources,
              parsedNodes: rawNodes,
              processedNodes,
              raw: debugRaw,
              base64: debugBase64
            }
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

    // 6. 标准订阅转换接口 (/sub)
    if (url.pathname === '/sub' || url.pathname === '/api/convert') {
      const clientUserAgent = request.headers.get('User-Agent') || '';
      const detectedTarget = detectTargetFromUserAgent(clientUserAgent);

      let rawUrl = '';
      let target = '';
      let includeRegex = '';
      let excludeRegex = '';
      let renameRulesStr = '';
      let addEmoji = true;
      let enableUdp = true;
      let showInfo = true;
      let preset = 'standard';
      let testUrl = 'https://cp.cloudflare.com/generate_204';
      let infoStrategy: 'first' | 'sum' | 'none' = 'first';
      let requestToken = extractRequestToken(request, url);
      let filename = 'SubConverter';
      let enableCache = url.searchParams.get('nocache') !== '1';
      let cacheTtl = 180;

      if (request.method === 'GET') {
        rawUrl = url.searchParams.get('url') || '';
        target = resolveTarget(url.searchParams.get('target'), detectedTarget);
        includeRegex = url.searchParams.get('include') || '';
        excludeRegex = url.searchParams.get('exclude') || '';
        renameRulesStr = url.searchParams.get('rename') || '';
        addEmoji = url.searchParams.get('emoji') !== '0' && url.searchParams.get('flag') !== '0';
        enableUdp = url.searchParams.get('udp') !== '0';
        showInfo = url.searchParams.get('info') !== '0' && url.searchParams.get('show_info') !== '0';
        preset = (url.searchParams.get('preset') || 'standard').toLowerCase();
        testUrl = url.searchParams.get('test_url') || 'https://cp.cloudflare.com/generate_204';
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
          target = resolveTarget(body.target, detectedTarget);
          includeRegex = body.include || '';
          excludeRegex = body.exclude || '';
          renameRulesStr = body.rename || '';
          addEmoji = body.emoji !== false && body.flag !== false;
          enableUdp = body.udp !== false;
          showInfo = body.info !== false && body.show_info !== false;
          preset = (body.preset || 'standard').toLowerCase();
          testUrl = body.test_url || 'https://cp.cloudflare.com/generate_204';
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

      const normalizedTarget = normalizeTarget(target);

      console.log('[DEBUG][REQUEST]', {
        method: request.method,
        path: url.pathname,
        target: normalizedTarget || target,
        preset,
        userAgent: clientUserAgent,
        inputLength: String(rawUrl).length,
        hasToken: Boolean(requestToken),
        cacheEnabled: enableCache,
        filters: {
          include: Boolean(includeRegex),
          exclude: Boolean(excludeRegex),
          rename: Boolean(renameRulesStr)
        }
      });

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

      if (!normalizedTarget) {
        return new Response(JSON.stringify({ error: `不支持的目标格式: ${target || '空值'}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
      target = normalizedTarget;

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
        console.log('[DEBUG][PARSED_NODES]', {
          count: rawNodes.length,
          protocols: countProtocols(rawNodes)
        });

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
        console.log('[DEBUG][PROCESSED_NODES]', {
          count: processedNodes.length,
          dropped: rawNodes.length - processedNodes.length,
          protocols: countProtocols(processedNodes)
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
          const adaptationResults = adaptNodesToSingBox(processedNodes);
          const fatalCount = adaptationResults.filter(result => result.fatal).length;

          if (processedNodes.length > 0 && fatalCount === processedNodes.length) {
            const reasons = Array.from(new Set(
              adaptationResults.flatMap(result =>
                result.skipReason ? [result.skipReason] : result.warnings.map(warning => warning.message)
              )
            ));
            const unsupportedParams = Array.from(new Set(
              adaptationResults.flatMap(result => result.unsupportedParams)
            ));

            return new Response(JSON.stringify({
              error: '没有节点可安全转换为 Sing-box 配置',
              target: 'singbox',
              totalMatched: processedNodes.length,
              fatalCount,
              reasons,
              unsupportedParams
            }), {
              status: 422,
              headers: {
                ...responseHeaders,
                'Content-Type': 'application/json; charset=utf-8'
              }
            });
          }

          const jsonOutput = toSingBox(processedNodes, undefined, {
            includeTun: isAppleSingBoxClient(clientUserAgent)
          });
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
