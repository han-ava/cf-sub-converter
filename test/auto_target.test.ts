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
      { userAgent: 'Clash Verge/2.4.0', contentType: 'text/yaml', marker: 'proxies:' },
      { userAgent: 'Stash/3.1.0', contentType: 'text/yaml', marker: 'proxies:' },
      { userAgent: 'v2rayN/7.15.6', contentType: 'text/plain', marker: 'base64' },
      { userAgent: 'v2rayNG/1.10.29', contentType: 'text/plain', marker: 'base64' },
      { userAgent: 'Quantumult X/1.5.1', contentType: 'text/plain', marker: 'vless=' },
      { userAgent: 'Loon/3.4.0', contentType: 'text/plain', marker: 'VLESS,' },
      { userAgent: 'sing-box 1.13.21', contentType: 'application/json', marker: '"outbounds"' },
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
        'User-Agent': 'sing-box 1.13.21'
      },
      body: JSON.stringify({ url: SOURCE_NODE, target: 'auto', token: 'test-token' })
    });

    const response = await worker.fetch(request, ENV, CTX);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.text()).toContain('"outbounds"');
  });

  test('official graphical sing-box clients receive a TUN inbound while generic CLI stays proxy-only', async () => {
    const graphicalClientUserAgents = [
      'SFI (sing-box 1.14.0; language zh_CN)',
      'SFI/1.12.1 (Build 1; sing-box 1.11.3; language en_US)',
      'SFM (sing-box 1.14.0; language zh_CN)',
      'SFT (sing-box 1.14.0; language zh_CN)',
      'SFA (sing-box 1.14.0; language zh_CN)',
      'SFW (sing-box 1.14.0; language zh_CN)',
      'SFL (sing-box 1.14.0; language zh_CN)'
    ];

    for (const userAgent of graphicalClientUserAgents) {
      const response = await worker.fetch(createAutoRequest(userAgent), ENV, CTX);
      const config = await response.json() as any;

      expect(response.status).toBe(200);
      expect(config.inbounds).toEqual(expect.arrayContaining([
        {
          type: 'tun',
          tag: 'tun-in',
          address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
          auto_route: true,
          stack: 'system'
        },
        {
          type: 'mixed',
          tag: 'mixed-in',
          listen: '127.0.0.1',
          listen_port: 2080
        }
      ]));
    }

    const genericResponse = await worker.fetch(
      createAutoRequest('sing-box 1.13.21'),
      ENV,
      CTX
    );
    const genericConfig = await genericResponse.json() as any;

    expect(genericConfig.inbounds.some((inbound: any) => inbound.type === 'tun')).toBe(false);
    expect(genericConfig.inbounds.some((inbound: any) => inbound.type === 'mixed')).toBe(true);
  });
});
