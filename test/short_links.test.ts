import { describe, expect, test } from 'bun:test';
import worker from '../src/index';

const SOURCE_NODE = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&type=tcp&sni=example.com#Short-Link';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

class MemoryKv {
  private readonly values = new Map<string, string>();
  lastValue = '';

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    this.lastValue = value;
  }
}

function createEnv() {
  return {
    AUTH_TOKEN: 'test-token',
    SHORT_LINKS: new MemoryKv()
  } as any;
}

function createLongUrl(origin = 'https://sub.example.com', token = 'test-token'): string {
  const url = new URL('/sub', origin);
  url.searchParams.set('url', SOURCE_NODE);
  url.searchParams.set('target', 'clash');
  url.searchParams.set('token', token);
  return url.toString();
}

describe('short subscription links', () => {
  test('creates a short link on the current origin and serves the converted subscription', async () => {
    const env = createEnv();
    const createResponse = await worker.fetch(
      new Request('https://sub.example.com/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createLongUrl() })
      }),
      env,
      CTX
    );

    expect(createResponse.status).toBe(200);
    const { shortUrl } = await createResponse.json() as { shortUrl: string };
    expect(shortUrl).toMatch(/^https:\/\/sub\.example\.com\/s\/[A-Za-z0-9_-]{12}$/);
    expect(new URL(env.SHORT_LINKS.lastValue, 'https://sub.example.com').searchParams.has('token')).toBe(false);

    const subscriptionResponse = await worker.fetch(
      new Request(shortUrl, { headers: { 'User-Agent': 'Mihomo/1.19.0' } }),
      env,
      CTX
    );
    expect(subscriptionResponse.status).toBe(200);
    expect(subscriptionResponse.headers.get('Content-Type')).toContain('text/yaml');
    expect(await subscriptionResponse.text()).toContain('proxies:');
  });

  test('rejects external targets and invalid authentication', async () => {
    const env = createEnv();
    const externalResponse = await worker.fetch(
      new Request('https://sub.example.com/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createLongUrl('https://evil.example.com') })
      }),
      env,
      CTX
    );
    expect(externalResponse.status).toBe(400);

    const unauthorizedResponse = await worker.fetch(
      new Request('https://sub.example.com/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createLongUrl('https://sub.example.com', 'wrong-token') })
      }),
      env,
      CTX
    );
    expect(unauthorizedResponse.status).toBe(401);
  });

  test('returns clear errors for missing storage and unknown codes', async () => {
    const missingStorageResponse = await worker.fetch(
      new Request('https://sub.example.com/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createLongUrl() })
      }),
      { AUTH_TOKEN: 'test-token' },
      CTX
    );
    expect(missingStorageResponse.status).toBe(503);

    const missingLinkResponse = await worker.fetch(
      new Request('https://sub.example.com/s/AbCdEf123456'),
      createEnv(),
      CTX
    );
    expect(missingLinkResponse.status).toBe(404);
  });
});
