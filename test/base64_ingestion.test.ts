// test/base64_ingestion.test.ts
import { describe, expect, test } from 'bun:test';
import { parseContent, parseSingleNode } from '../src/parser';
import { safeBase64Decode, safeBase64Encode } from '../src/utils';
import worker from '../src/index';

describe('Base64 Ingestion Robustness Suite', () => {
  const sampleVless = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=reality&type=tcp&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY#VLESS%20Node';
  const sampleVmess = 'vmess://' + safeBase64Encode(JSON.stringify({
    v: '2',
    ps: 'VMess Node',
    add: 'vmess.example.com',
    port: 443,
    id: 'b831381d-6324-4d53-ad4f-8cda48b30811',
    aid: 0,
    scy: 'auto',
    net: 'ws',
    type: 'none',
    host: 'vmess.example.com',
    path: '/ws',
    tls: 'tls'
  }));
  const sampleSS = 'ss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.4:8388#SS%20Node';
  const sampleTrojan = 'trojan://trojanpassword@trojan.example.com:443?security=tls&sni=trojan.example.com#Trojan%20Node';
  const sampleHy2 = 'hysteria2://pass123@hy2.example.com:443?sni=hy2.example.com#Hy2%20Node';

  test('1. Standard multi-line Base64 subscription decodes and parses all nodes', async () => {
    const rawList = [sampleVless, sampleVmess, sampleSS, sampleTrojan, sampleHy2].join('\n');
    const b64 = safeBase64Encode(rawList);

    const nodes = await parseContent(b64);
    expect(nodes.length).toBe(5);
    expect(nodes[0]!.protocol).toBe('vless');
    expect(nodes[1]!.protocol).toBe('vmess');
    expect(nodes[2]!.protocol).toBe('shadowsocks');
    expect(nodes[3]!.protocol).toBe('trojan');
    expect(nodes[4]!.protocol).toBe('hysteria2');
  });

  test('2. MIME-wrapped Base64 subscription (with \\r\\n or \\n every 64/76 chars) parses cleanly', async () => {
    const rawList = Array.from({ length: 10 }, (_, i) =>
      `vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.${i + 1}:443?security=reality&type=tcp#Node-${i + 1}`
    ).join('\n');

    const standardB64 = safeBase64Encode(rawList);
    // Wrap at 64 characters with \r\n and internal spaces
    const wrappedB64 = standardB64.match(/.{1,64}/g)!.join('\r\n') + '\n  \n';

    const decoded = safeBase64Decode(wrappedB64);
    expect(decoded).toContain('vless://');
    expect(decoded.split('\n').filter(Boolean).length).toBe(10);

    const nodes = await parseContent(wrappedB64);
    expect(nodes.length).toBe(10);
  });

  test('3. URL-safe Base64 (- and _) without padding (=) decodes seamlessly', async () => {
    const rawList = [sampleVless, sampleVmess].join('\n');
    const standardB64 = safeBase64Encode(rawList);
    // Convert to URL-safe and strip padding
    const urlSafeB64 = standardB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const decoded = safeBase64Decode(urlSafeB64);
    expect(decoded).toContain(sampleVless);

    const nodes = await parseContent(urlSafeB64);
    expect(nodes.length).toBe(2);
  });

  test('4. UTF-8 BOM (\\uFEFF) at start does not corrupt Base64 decoding or node parsing', async () => {
    const rawList = [sampleVless, sampleSS].join('\n');
    const b64WithBom = '﻿' + safeBase64Encode(rawList);

    const nodes = await parseContent(b64WithBom);
    expect(nodes.length).toBe(2);
    expect(nodes[0]!.name).toBe('VLESS Node');
  });

  test('5. URL-encoded Base64 string (%2B, %2F, %3D) decodes without error', async () => {
    const rawList = [sampleVless, sampleTrojan].join('\n');
    const b64 = safeBase64Encode(rawList);
    const urlEncodedB64 = encodeURIComponent(b64);

    const decoded = safeBase64Decode(urlEncodedB64);
    expect(decoded).toContain(sampleVless);

    const nodes = await parseContent(urlEncodedB64);
    expect(nodes.length).toBe(2);
  });

  test('6. Base64 strings with data: URI or base64:// prefix decode correctly', async () => {
    const rawList = sampleVless;
    const b64 = safeBase64Encode(rawList);

    const dataUri = `data:text/plain;base64,${b64}`;
    const base64Uri = `base64://${b64}`;

    const nodes1 = await parseContent(dataUri);
    expect(nodes1.length).toBe(1);

    const nodes2 = await parseContent(base64Uri);
    expect(nodes2.length).toBe(1);
  });

  test('7. Base64-encoded Clash YAML and Sing-box JSON are parsed recursively', async () => {
    const clashYaml = `
proxies:
  - name: "B64 Clash SS"
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-128-gcm
    password: pass
`;
    const b64Yaml = safeBase64Encode(clashYaml);
    const yamlNodes = await parseContent(b64Yaml);
    expect(yamlNodes.length).toBe(1);
    expect(yamlNodes[0]!.name).toBe('B64 Clash SS');

    const singboxJson = JSON.stringify({
      outbounds: [
        {
          tag: 'B64 Singbox Trojan',
          type: 'trojan',
          server: 'trojan.example.com',
          server_port: 443,
          password: 'pass'
        }
      ]
    });
    const b64Json = safeBase64Encode(singboxJson);
    const jsonNodes = await parseContent(b64Json);
    expect(jsonNodes.length).toBe(1);
    expect(jsonNodes[0]!.name).toBe('B64 Singbox Trojan');
  });

  test('8. Mixed subscription (plain URI + comment lines + Base64 blob) parses ALL nodes without drop', async () => {
    const b64SubList = [sampleVmess, sampleTrojan].join('\n');
    const b64Blob = safeBase64Encode(b64SubList);

    const mixedContent = [
      '# 这是一个测试订阅公告',
      '// 注释行',
      sampleVless,
      b64Blob,
      sampleSS
    ].join('\n');

    const nodes = await parseContent(mixedContent);
    // 1 (VLESS) + 2 (from B64 Blob: VMess + Trojan) + 1 (SS) = 4 nodes total
    expect(nodes.length).toBe(4);
    const protocols = nodes.map(n => n.protocol);
    expect(protocols).toContain('vless');
    expect(protocols).toContain('vmess');
    expect(protocols).toContain('trojan');
    expect(protocols).toContain('shadowsocks');
  });

  test('9. Single-line Base64 node (without URI scheme) in parseSingleNode', () => {
    const b64Vless = safeBase64Encode(sampleVless);
    const node = parseSingleNode(b64Vless);
    expect(node).not.toBeNull();
    expect(node!.protocol).toBe('vless');
    expect(node!.server).toBe('1.2.3.4');
  });

  test('10. Worker /sub and /api/preview endpoints with large direct Base64 input (>20 nodes)', async () => {
    const rawList = Array.from({ length: 30 }, (_, i) =>
      `vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.${i + 1}:443?security=reality&type=tcp&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY#Node-${i + 1}`
    ).join('\n');

    const b64Subscription = safeBase64Encode(rawList);

    // POST /sub?target=clash
    const req = new Request('http://localhost/sub?target=clash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: b64Subscription,
        token: 'test-token'
      })
    });

    const env = { AUTH_TOKEN: 'test-token' } as any;
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain('proxies:');
    // Ensure all 30 nodes were loaded (not truncated to 20!)
    expect(text).toContain('Node-1');
    expect(text).toContain('Node-20');
    expect(text).toContain('Node-30');
  });

  test('11. Nested Base64 subscription (double-encoded Base64) parses seamlessly', async () => {
    const rawList = [sampleVless, sampleHy2].join('\n');
    const innerB64 = safeBase64Encode(rawList);
    const outerB64 = safeBase64Encode(innerB64);

    const nodes = await parseContent(outerB64);
    expect(nodes.length).toBe(2);
    expect(nodes[0]!.protocol).toBe('vless');
    expect(nodes[1]!.protocol).toBe('hysteria2');
  });

  test('12. Base64 containing raw VMess JSON object (without vmess:// prefix) is recognized', async () => {
    const rawVmessJson = JSON.stringify({
      v: '2',
      ps: 'Raw JSON VMess',
      add: 'json.vmess.com',
      port: 443,
      id: 'b831381d-6324-4d53-ad4f-8cda48b30811',
      net: 'ws',
      tls: 'tls'
    });
    const b64 = safeBase64Encode(rawVmessJson);

    const nodes = await parseContent(b64);
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.protocol).toBe('vmess');
    expect(nodes[0]!.name).toBe('Raw JSON VMess');
  });

  test('13. POST /api/preview works with direct Base64 subscription input', async () => {
    const rawList = Array.from({ length: 25 }, (_, i) =>
      `vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.${i + 1}:443?security=reality&type=tcp&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY#香港%20Node-${i + 1}`
    ).join('\n');

    const b64Subscription = safeBase64Encode(rawList);

    const req = new Request('http://localhost/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: b64Subscription,
        token: 'test-token',
        emoji: true
      })
    });

    const env = { AUTH_TOKEN: 'test-token' } as any;
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    const json: any = await resp.json();
    expect(json.ok).toBe(true);
    expect(json.totalRaw).toBe(25);
    expect(json.totalMatched).toBe(25);
    expect(json.finalCount).toBe(25);
    expect(json.nodes.length).toBe(25);
    expect(json.nodes[0].name).toContain('🇭🇰');
  });
});
