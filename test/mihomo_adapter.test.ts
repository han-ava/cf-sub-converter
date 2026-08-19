// test/mihomo_adapter.test.ts
import { describe, expect, test } from 'bun:test';
import { parseSingleNode, parseContent } from '../src/parser';
import { adaptNodeToMihomo, nodeToClashProxy } from '../src/adapters/mihomo';
import { FIXTURES } from './fixtures/nodes';

describe('Mihomo Adapter Suite', () => {
  test('VLESS Reality to Mihomo YAML Proxy object', () => {
    const node = parseSingleNode(FIXTURES.vless_reality);
    const result = adaptNodeToMihomo(node!);
    
    expect(result.fatal).toBe(false);
    expect(result.config!.type).toBe('vless');
    expect(result.config!.name).toBe('香港 VLESS Reality');
    expect(result.config!.server).toBe('1.2.3.4');
    expect(result.config!.port).toBe(443);
    expect(result.config!.uuid).toBe('b831381d-6324-4d53-ad4f-8cda48b30811');
    expect(result.config!.flow).toBe('xtls-rprx-vision');
    expect(result.config!['packet-encoding']).toBe('xudp');
    expect(result.config!['client-fingerprint']).toBe('chrome');
    expect(result.config!['reality-opts']).toEqual({
      'public-key': 'f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY',
      'short-id': '1a2b3c4d',
      'spider-x': '/test'
    });

    // Warning recorded for customParam
    expect(result.unsupportedParams).toContain('customParam');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('VMess with alterId and packet encoding to Mihomo', () => {
    const node = parseSingleNode(FIXTURES.vmess_standard);
    const result = adaptNodeToMihomo(node!);

    expect(result.fatal).toBe(false);
    expect(result.config!.type).toBe('vmess');
    expect(result.config!.alterId).toBe(64); // preserved!
    expect(result.config!['packet-encoding']).toBe('packet');
    expect(result.config!['ws-opts']).toEqual({
      path: '/vmessws',
      headers: { Host: 'us.example.com' }
    });
  });

  test('Shadowsocks with plugin and udp-over-tcp to Mihomo', () => {
    const node = parseSingleNode(FIXTURES.ss_sip002_plugin);
    const result = adaptNodeToMihomo(node!);

    expect(result.fatal).toBe(false);
    expect(result.config!.type).toBe('ss');
    expect(result.config!.cipher).toBe('chacha20-ietf-poly1305');
    expect(result.config!.password).toBe('mypassword123!');
    expect(result.config!.plugin).toBe('v2ray-plugin');
    expect(result.config!['plugin-opts']).toEqual({
      mode: 'websocket',
      host: 'cdn.ss.com',
      path: '/ssws',
      tls: true
    });
    expect(result.config!['udp-over-tcp']).toBe(true);
  });

  test('Hysteria2 all parameters to Mihomo', () => {
    const node = parseSingleNode(FIXTURES.hy2_full);
    const result = adaptNodeToMihomo(node!);

    expect(result.fatal).toBe(false);
    expect(result.config!.type).toBe('hysteria2');
    expect(result.config!.server).toBe('2001:db8::1');
    expect(result.config!.port).toBe(443);
    expect(result.config!.password).toBe('my_hy2_password');
    expect(result.config!.sni).toBe('hy2.example.com');
    expect(result.config!.ports).toBe('20000-30000');
    expect(result.config!['hop-interval']).toBe(30);
    expect(result.config!.up).toBe('100');
    expect(result.config!.down).toBe('500');
    expect(result.config!.obfs).toBe('salamander');
    expect(result.config!['obfs-password']).toBe('obfspass123');
    expect(result.config!['obfs-min-packet-size']).toBeUndefined();
    expect(result.config!['obfs-max-packet-size']).toBeUndefined();
    expect(result.config!.fingerprint).toBe('f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f');
    expect(result.config!['client-fingerprint']).toBeUndefined();
    expect(result.config!['skip-cert-verify']).toBe(true);

    expect(result.unsupportedParams).toContain('customHy2Param');
  });

  test('AnyTLS to Mihomo without Reality', () => {
    const node = parseSingleNode(FIXTURES.anytls_standard);
    const result = adaptNodeToMihomo(node!);

    expect(result.fatal).toBe(false);
    expect(result.config!.type).toBe('anytls');
    expect(result.config!.server).toBe('anytls.example.com');
    expect(result.config!.port).toBe(8443);
    expect(result.config!.password).toBe('any_pass_123');
    expect(result.config!['idle-session-timeout']).toBe('60');
    expect(result.config!['min-idle-session']).toBe('5');
    expect(result.config!['reality-opts']).toBeUndefined(); // Reality forbidden for AnyTLS in Mihomo
  });

  test('Clash to Clash 100% passthrough without password mangling', async () => {
    const clashYaml = `
proxies:
  - name: "Clash Untouched Node"
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-128-gcm
    password: "special%20pass+with/symbols=123"
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: test.com
`;
    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(1);

    const proxy = nodeToClashProxy(nodes[0]!);
    expect(proxy).toBeDefined();
    expect(proxy!.name).toBe('Clash Untouched Node');
    expect(proxy!.password).toBe('special%20pass+with/symbols=123'); // exactly preserved!
    expect(proxy!.plugin).toBe('v2ray-plugin');
    expect(proxy!['plugin-opts']).toEqual({ mode: 'websocket', host: 'test.com' });
  });
});
