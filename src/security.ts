// src/security.ts

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
 * 校验订阅 URL 是否合法且安全
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
 * 校验访问 Token
 */
export function isAuthorized(authTokenInEnv?: string, requestToken?: string | null): boolean {
  // 如果环境变量未配置 AUTH_TOKEN，默认公开服务
  if (!authTokenInEnv || authTokenInEnv.trim() === '') {
    return true;
  }

  if (!requestToken) {
    return false;
  }

  return safeCompareToken(authTokenInEnv.trim(), requestToken.trim());
}

/**
 * 带有超时与安全防护的订阅抓取请求
 */
export async function fetchSubscriptionWithTimeout(
  url: string,
  customUserAgent?: string
): Promise<{ ok: boolean; status: number; text: string; userinfo?: string }> {
  if (!isSafeSubscriptionUrl(url)) {
    throw new Error(`安全拦截: 禁止请求非法或内网订阅地址 (${url})`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 秒超时

  try {
    const userAgent = customUserAgent || 'ClashMeta/1.18.0 (v2rayNG/1.8.5)';
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const userinfo = response.headers.get('subscription-userinfo') || undefined;

    if (!response.ok) {
      return { ok: false, status: response.status, text: '', userinfo };
    }

    // 限制单次响应最大体积为 10MB 防止 OOM 崩溃
    const text = await response.text();
    if (text.length > 10 * 1024 * 1024) {
      throw new Error('订阅内容超过 10MB 上限，已中止处理');
    }

    return { ok: true, status: response.status, text, userinfo };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`请求订阅超时 (15s): ${url}`);
    }
    throw err;
  }
}
