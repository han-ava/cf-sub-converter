// test/roundtrip.test.ts
import { describe, expect, test } from 'bun:test';
import { parseSingleNode, parseContent } from '../src/parser';
import { toClashMeta } from '../src/generator';
import { toRawLinks, toBase64 } from '../src/adapters/raw';
import { processNodes, safeBase64Decode } from '../src/utils';
import { FIXTURES } from './fixtures/nodes';
import yaml from 'js-yaml';

describe('Round-Trip & Lossless Preservation Suite', () => {
  test('Raw URI to Raw URI lossless idempotency across all protocols', () => {
    const protocols = [
      FIXTURES.vless_reality,
      FIXTURES.vless_ws_ipv6,
      FIXTURES.vless_xhttp,
      FIXTURES.ss_sip002_plugin,
      FIXTURES.ss_ss2022,
      FIXTURES.hy2_full,
      FIXTURES.anytls_standard,
      FIXTURES.trojan_ws,
      FIXTURES.tuic_standard
    ];

    for (const uri of protocols) {
      const node = parseSingleNode(uri);
      expect(node).not.toBeNull();

      const outputRaw = toRawLinks([node!]);
      
      // Node parsed from raw URI must output the exact same base URI
      const origBase = uri.split('#')[0];
      const outBase = outputRaw.split('#')[0];
      expect(outBase).toBe(origBase);
    }
  });

  test('ProcessNodes renaming only updates #name without corrupting URI query parameters', () => {
    const node = parseSingleNode(FIXTURES.vless_reality);
    expect(node).not.toBeNull();

    const processed = processNodes([node!], {
      renameRules: [{ search: '香港', replace: 'HK-VIP' }]
    });

    expect(processed[0]!.name).toBe('HK-VIP VLESS Reality');
    
    const outputLink = toRawLinks(processed);
    expect(outputLink).toContain('#' + encodeURIComponent('HK-VIP VLESS Reality'));
    expect(outputLink).toContain('pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
    expect(outputLink).toContain('customParam=preserveMe');
  });

  test('Clash YAML Round-trip 100% preservation', async () => {
    const inputYaml = `
proxies:
  - name: "Roundtrip Node"
    type: ss
    server: 8.8.8.8
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: "pass%2Fwith+symbols=456"
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: roundtrip.com
`;
    const nodes = await parseContent(inputYaml);
    expect(nodes.length).toBe(1);

    const generatedYamlStr = toClashMeta(nodes);
    const parsedDoc: any = yaml.load(generatedYamlStr);
    expect(parsedDoc).toBeDefined();
    expect(parsedDoc.proxies).toBeDefined();
    expect(parsedDoc.proxies.length).toBe(1);

    const outProxy = parsedDoc.proxies[0];
    expect(outProxy.name).toBe('Roundtrip Node');
    expect(outProxy.password).toBe('pass%2Fwith+symbols=456');
    expect(outProxy.cipher).toBe('chacha20-ietf-poly1305');
    expect(outProxy.plugin).toBe('v2ray-plugin');
    expect(outProxy['plugin-opts']).toEqual({ mode: 'websocket', host: 'roundtrip.com' });
  });

  test('renderHtmlPage outputs syntactically valid JavaScript in script tag', async () => {
    const { renderHtmlPage } = await import('../src/ui');
    const html = renderHtmlPage('test-version');
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const script = match![1];

    const acorn = await import('acorn');
    let parsed = false;
    try {
      acorn.parse(script, { ecmaVersion: 2020 });
      parsed = true;
    } catch (e: any) {
      console.error('HTML Script syntax error:', e);
    }
    expect(parsed).toBe(true);
  });

  // ── P0: Raw & Base64 Lossless Output Architecture Verification ───────────

  test('P0: Complex VLESS preserves all parameters in Base64 byte-for-byte without legacy loss', () => {
    const complexVlessUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=none&type=tcp&packetEncoding=xudp&encryption=mlkemXXX&unknownABC=123#%E5%8E%9F%E5%90%8D%E7%A7%B0';
    const node = parseSingleNode(complexVlessUri);
    expect(node).not.toBeNull();

    const outputBase64 = toBase64([node!]);
    const decoded = safeBase64Decode(outputBase64);

    expect(decoded).toContain('packetEncoding=xudp');
    expect(decoded).toContain('encryption=mlkemXXX');
    expect(decoded).toContain('unknownABC=123');

    // 除了 #节点名称 之外，URI query 严格 byte-for-byte 保持原样
    const origBase = complexVlessUri.split('#')[0];
    const decodedBase = decoded.split('#')[0];
    expect(decodedBase).toBe(origBase);
  });

  test('P0: 6 Protocol Regressions strictly preserve raw URI byte-for-byte in Base64 / Raw output', () => {
    const regressionCases = [
      // 1. VLESS: encryption + packetEncoding + xhttp extra + unknown params
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=reality&type=xhttp&packetEncoding=xudp&encryption=mlkem768x25519&pbk=abcdef0123456789&extra=%7B%22mode%22%3A%22stream-up%22%2C%22xPaddingBytes%22%3A%22100-1000%22%7D&customVlessParam=123#VLESS%20Regression',

      // 2. HY2: pinSHA256 + ports + hop-interval + gecko
      'hysteria2://mypassword@hy2.example.com:443?sni=hy2.example.com&pinSHA256=f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f&mport=20000-40000&hop-interval=30&obfs=gecko&obfs-password=gecko_pass&customHy2Key=value#HY2%20Regression',

      // 3. SS2022: percent-encoded key + plugin
      'ss://2022-blake3-aes-128-gcm:my%2Bpassword%2Fwith%3Dsymbols@1.2.3.4:8388/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.com&udp-over-tcp=1#SS2022%20Regression',

      // 4. AnyTLS: 原始 query
      'anytls://mypassword@anytls.example.com:443?sni=anytls.example.com&alpn=h2%2Chttp%2F1.1&insecure=1&fp=chrome&idleSessionCheckInterval=30&customAnyKey=preserve#AnyTLS%20Regression',

      // 5. Trojan: transport params
      'trojan://trojanpass@trojan.example.com:443?security=tls&sni=trojan.example.com&type=ws&path=%2Fws-trojan&host=ws.example.com&customTrojanKey=hello#Trojan%20Regression',

      // 6. TUIC: V4/V5 原始 URI
      'tuic://b831381d-6324-4d53-ad4f-8cda48b30811:tuicpass@tuic.example.com:8443?congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=1&customTuicParam=xyz#TUIC%20Regression'
    ];

    for (const originalUri of regressionCases) {
      const node = parseSingleNode(originalUri);
      expect(node).not.toBeNull();

      // 1. Raw Links 输出
      const rawOut = toRawLinks([node!]);
      const origBase = originalUri.split('#')[0];
      const rawBase = rawOut.split('#')[0];
      expect(rawBase).toBe(origBase);

      // 2. Base64 输出
      const base64Out = toBase64([node!]);
      const decoded = safeBase64Decode(base64Out);
      const decodedBase = decoded.split('#')[0];
      expect(decodedBase).toBe(origBase);
    }
  });
});
