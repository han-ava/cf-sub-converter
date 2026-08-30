import { describe, expect, test } from 'bun:test';
import worker from '../src/index';
import { renderHtmlPage } from '../src/ui';

const ENV = { AUTH_TOKEN: 'test-token' };
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

const VLESS_GRPC =
  'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=grpc&security=tls&sni=example.com&serviceName=test#VLESS%20gRPC';
const VLESS_KCP =
  'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=kcp&security=tls&sni=example.com#VLESS%20KCP';
const VLESS_XHTTP =
  'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=xhttp&security=tls&sni=example.com&path=%2Fxhttp#VLESS%20XHTTP';
const SSR =
  'ssr://' + Buffer.from('1.2.3.4:8388:origin:aes-128-cfb:plain:bXlwYXNz/?remarks=U1NSX05vZGU').toString('base64');

async function preview(node: string, target: string, userAgent = 'Browser/1.0') {
  const response = await worker.fetch(
    new Request('http://localhost/api/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent
      },
      body: JSON.stringify({
        url: node,
        target,
        token: 'test-token',
        emoji: false
      })
    }),
    ENV,
    CTX
  );

  return { response, json: await response.json() as any };
}

async function convert(node: string, target: string): Promise<Response> {
  const url = new URL('http://localhost/sub');
  url.searchParams.set('url', node);
  url.searchParams.set('target', target);
  url.searchParams.set('token', 'test-token');
  url.searchParams.set('emoji', '0');
  return worker.fetch(new Request(url), ENV, CTX);
}

describe('target-aware preview contract', () => {
  test('marks VLESS as fatal for Surge and matches the omitted final output', async () => {
    const { response, json } = await preview(VLESS_GRPC, 'surge');

    expect(response.status).toBe(200);
    expect(json.requestedTarget).toBe('surge');
    expect(json.resolvedTarget).toBe('surge');
    expect(json.fatalCount).toBe(1);
    expect(json.finalCount).toBe(0);
    expect(json.nodes[0].conversion).toMatchObject({
      target: 'surge',
      status: 'fatal',
      emitted: false
    });

    const output = await (await convert(VLESS_GRPC, 'surge')).text();
    expect(output.trim()).toBe('[Proxy]');
    expect(output).not.toContain('VLESS gRPC');
  });

  test('preserves a KCP URI for Raw even though Mihomo rejects it', async () => {
    const rawPreview = await preview(VLESS_KCP, 'raw');
    expect(rawPreview.response.status).toBe(200);
    expect(rawPreview.json.resolvedTarget).toBe('raw');
    expect(rawPreview.json.perfectCount).toBe(1);
    expect(rawPreview.json.fatalCount).toBe(0);
    expect(rawPreview.json.nodes[0].conversion).toMatchObject({
      target: 'raw',
      status: 'perfect',
      emitted: true
    });

    const mihomoPreview = await preview(VLESS_KCP, 'clash');
    expect(mihomoPreview.json.resolvedTarget).toBe('mihomo');
    expect(mihomoPreview.json.fatalCount).toBe(1);

    const output = await (await convert(VLESS_KCP, 'raw')).text();
    expect(output).toContain('type=kcp');
  });

  test('warns instead of claiming a perfect Sing-box XHTTP mapping', async () => {
    const { response, json } = await preview(VLESS_XHTTP, 'singbox');

    expect(response.status).toBe(200);
    expect(json.resolvedTarget).toBe('singbox');
    expect(json.perfectCount).toBe(0);
    expect(json.warningCount).toBe(1);
    expect(json.finalCount).toBe(1);
    expect(json.nodes[0].conversion).toMatchObject({
      target: 'singbox',
      status: 'warning',
      emitted: true
    });
  });

  test('filters unsupported SSR from Sing-box outbounds and selectors', async () => {
    const { json } = await preview(SSR, 'singbox');
    expect(json.fatalCount).toBe(1);
    expect(json.finalCount).toBe(0);

    const response = await convert(SSR, 'singbox');
    const output = await response.json() as any;
    expect(output.outbounds.some((outbound: any) => outbound.tag === 'SSR_Node')).toBe(false);
    const selectors = output.outbounds.filter((outbound: any) => Array.isArray(outbound.outbounds));
    expect(selectors.every((outbound: any) => !outbound.outbounds.includes('SSR_Node'))).toBe(true);
  });

  test('reports the concrete fallback used for auto preview', async () => {
    const { response, json } = await preview(VLESS_GRPC, 'auto', 'Surge/5.9.0');

    expect(response.status).toBe(200);
    expect(json.requestedTarget).toBe('auto');
    expect(json.resolvedTarget).toBe('surge');
    expect(json.autoTargetFallback).toBe(true);
    expect(json.fatalCount).toBe(1);
  });

  test('rejects an unknown preview target', async () => {
    const { response, json } = await preview(VLESS_GRPC, 'unknown-target');
    expect(response.status).toBe(400);
    expect(json.error).toContain('不支持的目标格式');

    const conversionResponse = await convert(VLESS_GRPC, 'unknown-target');
    expect(conversionResponse.status).toBe(400);
    expect(await conversionResponse.json()).toMatchObject({ error: expect.stringContaining('不支持的目标格式') });
  });

  test('sends the selected UI target, refreshes on change, and avoids Mihomo-only copy', () => {
    const html = renderHtmlPage('test-version');
    const onTargetChange = html.match(/function onTargetChange\(\)[\s\S]*?function resetForm\(\)/)?.[0] || '';

    expect(html).toContain("target: document.getElementById('targetClient').value");
    expect(onTargetChange).toContain('inspectNodes(false)');
    expect(html).toContain('const requestId = ++latestInspectRequestId');
    expect(html).toContain('requestId !== latestInspectRequestId');
    expect(html).toContain('AUTO → ');
    expect(html).not.toContain('➔ Mihomo');
    expect(html).not.toContain('忠实映射到 Mihomo');
  });
});
