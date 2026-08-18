// test/roundtrip.test.ts
import { describe, expect, test } from 'bun:test';
import { parseSingleNode, parseContent } from '../src/parser';
import { toRawLinks, toClashMeta } from '../src/generator';
import { processNodes } from '../src/utils';
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
});
