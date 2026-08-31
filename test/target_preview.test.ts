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
const SHADOWSOCKS =
  'ss://' + Buffer.from('chacha20-ietf-poly1305:secret').toString('base64') + '@1.1.1.1:8388#Surge%20SS';

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

  test('keeps the Surge proxy list compatible and exposes a separate full config target', async () => {
    const listResponse = await convert(SHADOWSOCKS, 'surge');
    const listOutput = await listResponse.text();
    expect(listOutput).toStartWith('[Proxy]\n');
    expect(listOutput).not.toContain('[General]');
    expect(listOutput).not.toContain('[Rule]');

    const confResponse = await convert(SHADOWSOCKS, 'surge-conf');
    const confOutput = await confResponse.text();
    expect(confResponse.status).toBe(200);
    expect(confResponse.headers.get('Content-Disposition')).toContain('SubConverter.conf');
    expect(confOutput).toContain('[General]\n');
    expect(confOutput).toContain('[Proxy]\nSurge SS = ss,');
    expect(confOutput).toContain('[Proxy Group]\n🚀 节点选择 = select, Surge SS, DIRECT');
    expect(confOutput).toContain('[Rule]\n');
    expect(confOutput).toContain('FINAL,🚀 节点选择,dns-failed');
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

  test('rejects XHTTP because Sing-box 1.13 has no XHTTP transport', async () => {
    const { response, json } = await preview(VLESS_XHTTP, 'singbox');

    expect(response.status).toBe(200);
    expect(json.resolvedTarget).toBe('singbox');
    expect(json.perfectCount).toBe(0);
    expect(json.warningCount).toBe(0);
    expect(json.fatalCount).toBe(1);
    expect(json.finalCount).toBe(0);
    expect(json.nodes[0].conversion).toMatchObject({
      target: 'singbox',
      status: 'fatal',
      emitted: false,
      unsupportedParams: ['transport.type']
    });

    const conversionResponse = await convert(VLESS_XHTTP, 'singbox');
    expect(conversionResponse.status).toBe(422);
    expect(await conversionResponse.json()).toMatchObject({
      target: 'singbox',
      totalMatched: 1,
      fatalCount: 1,
      unsupportedParams: ['transport.type']
    });
  });

  test('still returns a Sing-box config when at least one node is safely convertible', async () => {
    const response = await convert(`${VLESS_XHTTP}\n${VLESS_GRPC}`, 'singbox');
    expect(response.status).toBe(200);

    const output = await response.json() as any;
    expect(output.outbounds).toContainEqual(expect.objectContaining({ tag: 'VLESS gRPC' }));
    expect(output.outbounds).not.toContainEqual(expect.objectContaining({ tag: 'VLESS XHTTP' }));
  });

  test('keeps same-endpoint native outbounds from separate configs isolated end to end', async () => {
    const input = [
      {
        outbounds: [
          {
            type: 'http', tag: 'shared', server: '127.0.0.1', server_port: 18080,
            username: 'alpha'
          },
          {
            type: 'socks', tag: 'chain', server: '127.0.0.1', server_port: 11080,
            detour: 'shared'
          }
        ]
      },
      {
        outbounds: [
          {
            type: 'http', tag: 'shared', server: '127.0.0.1', server_port: 18080,
            username: 'beta'
          },
          {
            type: 'socks', tag: 'chain', server: '127.0.0.1', server_port: 11080,
            detour: 'shared'
          }
        ]
      }
    ].map(config => btoa(JSON.stringify(config))).join('\n');

    const { response, json } = await preview(input, 'singbox');
    expect(response.status).toBe(200);
    expect(json.totalRaw).toBe(4);
    expect(json.totalMatched).toBe(4);
    expect(json.finalCount).toBe(4);
    expect(json.debug.processedNodes.map((node: any) => node.protocolData.username).filter(Boolean)).toEqual([
      'alpha', 'beta'
    ]);

    const conversionResponse = await convert(input, 'singbox');
    expect(conversionResponse.status).toBe(200);
    const config = await conversionResponse.json() as any;
    const nativeOutbounds = config.outbounds.filter((outbound: any) => (
      outbound.type === 'http' || outbound.type === 'socks'
    ));
    expect(nativeOutbounds.map((outbound: any) => outbound.tag)).toEqual([
      'shared', 'chain', 'shared 02', 'chain 02'
    ]);
    expect(nativeOutbounds.filter((outbound: any) => outbound.type === 'http').map((outbound: any) => (
      outbound.username
    ))).toEqual(['alpha', 'beta']);
    expect(nativeOutbounds.filter((outbound: any) => outbound.type === 'socks').map((outbound: any) => (
      outbound.detour
    ))).toEqual(['shared', 'shared 02']);
  });

  test('rejects SSR because Sing-box removed the ShadowsocksR outbound', async () => {
    const { json } = await preview(SSR, 'singbox');
    expect(json.fatalCount).toBe(1);
    expect(json.finalCount).toBe(0);

    const response = await convert(SSR, 'singbox');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('没有节点可安全转换'),
      target: 'singbox',
      totalMatched: 1,
      fatalCount: 1,
      unsupportedParams: ['protocol']
    });
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
    expect(html).toContain('<option value="surge-conf">Surge (.conf 完整分流配置)</option>');
    expect(html).toContain("target === 'surge-conf'");
    expect(html).toContain('复制 Surge Proxy 列表链接');
    expect(html).toContain('导入 Surge 完整配置');
    expect(html).toContain('<option value="quantumult-x">Quantumult X (节点订阅)</option>');
    expect(html).toContain('<option value="loon">Loon (节点订阅)</option>');
    expect(html).toContain('quantumult-x:///add-resource?remote-resource=');
    expect(html).toContain('server_remote: [url + \'');
    expect(html).toContain('loon://import?nodelist=');
    expect(html).toContain('导入 Quantumult X 节点订阅');
    expect(html).toContain('导入 Loon 节点订阅');
    expect(onTargetChange).toContain('inspectNodes(false)');
    expect(html).toContain('const requestId = ++latestInspectRequestId');
    expect(html).toContain('requestId !== latestInspectRequestId');
    expect(html).toContain("const presetApplies = target === 'auto' || target === 'clash'");
    expect(html).toContain("(target === 'auto' || target === 'clash') && preset");
    expect(onTargetChange).toContain('syncRulePresetAvailability(target)');
    expect(html).toContain('AUTO → ');
    expect(html).not.toContain('➔ Mihomo');
    expect(html).not.toContain('忠实映射到 Mihomo');
  });
});
