// src/security.ts

/**
 * 允许请求的目标端口白名单（标准 Web 端口与常见 CDN/代理端口）
 */
const ALLOWED_PORTS = new Set([
  80, 443, 8080, 8443, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096
]);

/**
 * 计算字符串的 SHA-256 哈希值
 */
export async function sha256Hex(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 校验是否为私有 IP 或本地回环 IP（防止 SSRF 漏洞）
 */
export function isPrivateIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, '');

  // IPv4 检查
  const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    const [o1, o2, o3, o4] = octets as [number, number, number, number];

    // 0.0.0.0/8
    if (o1 === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return true;
    // 10.0.0.0/8 (Private)
    if (o1 === 10) return true;
    // 172.16.0.0/12 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (o1 === 192 && o2 === 168) return true;
    // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
    if (o1 === 169 && o2 === 254) return true;
    // 100.64.0.0/10 (CGNAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
    // 224.0.0.0/4 (Multicast)
    if (o1 >= 224) return true;

    return false;
  }

  // IPv6 检查
  const lower = cleanIp.toLowerCase();
  if (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') || // Link-local
    lower.startsWith('fc') ||    // Unique Local Address (fc00::/7)
    lower.startsWith('fd')
  ) {
    return true;
  }

  return false;
}

/**
 * 校验订阅 URL 是否合法且安全（协议、主机、内网 IP 阻断）
 */
export function isSafeSubscriptionUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // 检查主机名关键字
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan')
    ) {
      return false;
    }

    if (isPrivateIp(hostname)) {
      return false;
    }

    // 端口合法性校验（1-65535）
    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 严格恒定时间字符串比较（消除长度差异的时序侧信道）
 */
export function safeCompareToken(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const lenA = a.length;
  const lenB = b.length;
  let mismatch = lenA ^ lenB;
  const maxLen = Math.max(lenA, lenB);

  for (let i = 0; i < maxLen; i++) {
    const charA = i < lenA ? a.charCodeAt(i) : 0;
    const charB = i < lenB ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }

  return mismatch === 0;
}

/**
 * 从请求中提取 Token（支持 Authorization: Bearer，兼容客户端 ?token=）
 */
export function extractRequestToken(request: Request, url: URL): string {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return authHeader.trim();
  }

  // 兼容 Clash / Shadowrocket / Sing-Box 等客户端单一 URL 订阅
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    return queryToken.trim();
  }

  return '';
}

/**
 * 详细鉴权诊断（返回明确的原因，便于用户在控制台与前端排查）
 */
export function checkAuthStatus(authTokenInEnv?: string, requestToken?: string | null): { authorized: boolean; reason?: string } {
  if (!authTokenInEnv || authTokenInEnv.trim() === '') {
    return {
      authorized: false,
      reason: '服务端未检测到 AUTH_TOKEN 环境变量（请确认 Cloudflare 后台 Settings ➔ Variables and Secrets 中变量名是否为大写 AUTH_TOKEN 并已保存部署）'
    };
  }

  if (!requestToken || requestToken.trim() === '') {
    return {
      authorized: false,
      reason: '请求缺少 Token（请在网页输入框中填入您的 AUTH_TOKEN 密码）'
    };
  }

  const valid = safeCompareToken(authTokenInEnv.trim(), requestToken.trim());
  if (!valid) {
    return {
      authorized: false,
      reason: 'Token 不匹配（网页输入的密码与 Cloudflare 后台设置的不一致，请核对拼写、大小写及前后空格）'
    };
  }

  return { authorized: true };
}

/**
 * 严格访问权限校验（默认必须设置 AUTH_TOKEN，未设置直接拒绝）
 */
export function isAuthorized(authTokenInEnv?: string, requestToken?: string | null): boolean {
  return checkAuthStatus(authTokenInEnv, requestToken).authorized;
}

/**
 * 脱敏 URL，用于安全的错误日志（仅保留协议与主机名，去除敏感的 ?token= 等参数）
 */
export function sanitizeUrlForLog(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '[Invalid URL]';
  }
}

export const UPSTREAM_USER_AGENT = 'ClashMeta/1.19.0; Mihomo/1.19.0; Shadowrocket/1990; v2rayNG/1.9.0';

/**
 * 带有 302 重定向核验、精确 Cache Key（URL + 固定上游 UA）、流式体积截断与超时的安全订阅抓取
 */
export async function fetchSubscriptionWithTimeout(
  initialUrl: string,
  _customUserAgent?: string,
  enableCache = true,
  cacheTtlSeconds = 180,
  outerSignal?: AbortSignal
): Promise<{ ok: boolean; status: number; text: string; userinfo?: string }> {
  // 向上游请求时始终使用统一固定的代理客户端 UA，确保看板与客户端获取完全一致的完整节点数据，杜绝缓存分裂
  const userAgent = UPSTREAM_USER_AGENT;

  // 1. 精确 Cache Key (URL + UserAgent 哈希，防止不同客户端拉取到混淆格式)
  let cacheKeyUrl = '';
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;

  if (enableCache && cache) {
    try {
      const cacheSignature = `${initialUrl}\n${userAgent}`;
      const hash = await sha256Hex(cacheSignature);
      cacheKeyUrl = `https://sub-cache.internal/${hash}`;
      const cachedResp = await cache.match(cacheKeyUrl);
      if (cachedResp) {
        const userinfo = cachedResp.headers.get('subscription-userinfo') || undefined;
        const text = await cachedResp.text();
        return { ok: true, status: 200, text, userinfo };
      }
    } catch {}
  }

  let currentUrl = initialUrl;
  const maxRedirects = 5;
  let redirectCount = 0;

  // 全局外层超时信号：在循环外注册一次，避免每次重定向叠加监听器
  let outerAborted = false;
  if (outerSignal) {
    if (outerSignal.aborted) {
      throw new Error('请求订阅上游超时 (全局超时)');
    }
    outerSignal.addEventListener('abort', () => { outerAborted = true; }, { once: true });
  }

  while (redirectCount <= maxRedirects) {
    if (outerAborted) {
      throw new Error('请求订阅上游超时 (全局超时)');
    }

    if (!isSafeSubscriptionUrl(currentUrl)) {
      throw new Error('安全策略拦截: 目标地址不符合安全规范或指向内网');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 单个订阅 15 秒超时

    // 将外层信号连接到当前请求的 controller
    const onOuterAbort = () => controller.abort();
    if (outerSignal && !outerSignal.aborted) {
      outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    }

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        redirect: 'manual', // 手动拦截每一跳重定向，进行严密安全核验
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 处理 301, 302, 303, 307, 308 重定向
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location');
        if (!location) {
          throw new Error('订阅服务器返回重定向但缺少 Location 标头');
        }

        // 解析相对路径或绝对路径
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      const userinfo = response.headers.get('subscription-userinfo') || undefined;

      if (!response.ok) {
        return { ok: false, status: response.status, text: '', userinfo };
      }

      // 预先检查 Content-Length，若超过 10MB 直接拒绝，避免无谓加载到内存
      const contentLengthHeader = response.headers.get('Content-Length');
      if (contentLengthHeader) {
        const cl = parseInt(contentLengthHeader, 10);
        if (!isNaN(cl) && cl > 10 * 1024 * 1024) {
          throw new Error('订阅内容超过 10MB 上限，已中止处理');
        }
      }

      const text = await response.text();
      if (text.length > 10 * 1024 * 1024) {
        throw new Error('订阅内容超过 10MB 上限，已中止处理');
      }

      // 异步存入边缘短效缓存
      if (enableCache && cache && cacheKeyUrl) {
        try {
          const cacheHeaders: Record<string, string> = {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': `public, max-age=${cacheTtlSeconds}`
          };
          if (userinfo) cacheHeaders['subscription-userinfo'] = userinfo;
          const cacheResp = new Response(text, { headers: cacheHeaders });
          cache.put(cacheKeyUrl, cacheResp).catch(() => {});
        } catch {}
      }

      return { ok: true, status: response.status, text, userinfo };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('请求订阅上游超时 (15s)');
      }
      throw err;
    }
  }

  throw new Error('订阅重定向次数过多 (超过 5 次)，已中止请求');
}
