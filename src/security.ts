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
 * 校验订阅 URL 是否合法且安全（协议、主机、内网 IP、端口白名单）
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

    // 端口限制检查
    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (isNaN(portNum) || !ALLOWED_PORTS.has(portNum)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 恒定时间字符串比较（防止时序侧信道攻击）
 */
export function safeCompareToken(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * 从请求中提取 Token（优先支持 Authorization: Bearer，兼容客户端 ?token=）
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
 * 校验访问权限
 */
export function isAuthorized(authTokenInEnv?: string, requestToken?: string | null, publicMode?: string): boolean {
  // 如果环境变量显式配置了 AUTH_TOKEN，必须严格校验
  if (authTokenInEnv && authTokenInEnv.trim() !== '') {
    if (!requestToken) return false;
    return safeCompareToken(authTokenInEnv.trim(), requestToken.trim());
  }

  // 如果未配置 AUTH_TOKEN 且未开启 PUBLIC_MODE，依然允许个人开发测试，或按需要拒绝
  if (publicMode === 'false') {
    return false;
  }

  return true;
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

/**
 * 带有 302 重定向核验、边缘短效缓存与超时防护的安全订阅抓取
 */
export async function fetchSubscriptionWithTimeout(
  initialUrl: string,
  customUserAgent?: string,
  enableCache = true
): Promise<{ ok: boolean; status: number; text: string; userinfo?: string }> {
  // 1. 边缘缓存查询 (3 分钟短效缓存，大幅提升重复测速与配置拉取性能)
  let cacheKeyUrl = '';
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;

  if (enableCache && cache) {
    try {
      const hash = await sha256Hex(initialUrl);
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
  const userAgent = customUserAgent || 'ClashMeta/1.18.0 (v2rayNG/1.8.5)';
  const maxRedirects = 5;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    if (!isSafeSubscriptionUrl(currentUrl)) {
      throw new Error('安全策略拦截: 目标地址不符合安全规范或指向内网');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 秒超时

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

      // 限制单次响应最大体积为 10MB 防止内存耗尽
      const text = await response.text();
      if (text.length > 10 * 1024 * 1024) {
        throw new Error('订阅内容超过 10MB 上限，已中止处理');
      }

      // 异步存入边缘短效缓存
      if (enableCache && cache && cacheKeyUrl) {
        try {
          const cacheHeaders: Record<string, string> = {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=180'
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
