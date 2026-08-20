import { describe, expect, test } from 'bun:test';
import worker from '../src/index';
import { safeBase64Decode } from '../src/utils';

const SOURCE_NODE = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&type=tcp&sni=example.com#Auto-Node';
const ENV = { AUTH_TOKEN: 'test-token' };
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

function createAutoRequest(userAgent: string, target = 'auto'): Request {
  const url = new URL('http://localhost/sub');
  url.searchParams.set('url', SOURCE_NODE);
  url.searchParams.set('target', target);
  url.searchParams.set('token', 'test-token');
  return new Request(url, { headers: { 'User-Agent': userAgent } });
}

describe('automatic subscription target detection', () => {
  test('target=auto returns the format matching known client User-Agents', async () => {
    const cases = [
      { userAgent: 'Shadowrocket/2.2.60', contentType: 'text/plain', marker: 'base64' },
      { userAgent: 'Mihomo/1.19.0', contentType: 'text/yaml', marker: 'proxies:' },
      { userAgent: 'sing-box 1.12.0', contentType: 'application/json', marker: '"outbounds"' },
      { userAgent: 'Surge/5.9.0', contentType: 'text/plain', marker: '[Proxy]' }
    ];

    for (const item of cases) {
      const response = await worker.fetch(createAutoRequest(item.userAgent), ENV, CTX);
      const output = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain(item.contentType);
      if (item.marker === 'base64') {
        expect(safeBase64Decode(output)).toContain('vless://');
      } else {
        expect(output).toContain(item.marker);
      }
    }
  });

  test('unknown clients fall back to Clash Meta and omitted target remains automatic', async () => {
    for (const target of ['auto', '']) {
      const response = await worker.fetch(createAutoRequest('UnknownClient/1.0', target), ENV, CTX);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/yaml');
      expect(await response.text()).toContain('proxies:');
    }
  });

  test('POST target=auto uses the request User-Agent', async () => {
    const request = new Request('http://localhost/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'sing-box 1.12.0'
      },
      body: JSON.stringify({ url: SOURCE_NODE, target: 'auto', token: 'test-token' })
    });

    const response = await worker.fetch(request, ENV, CTX);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.text()).toContain('"outbounds"');
  });
});
