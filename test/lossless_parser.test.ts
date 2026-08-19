// test/lossless_parser.test.ts
import { describe, expect, test } from 'bun:test';
import { parseContent, parseSingleNode } from '../src/parser';
import { FIXTURES } from './fixtures/nodes';
import { VlessNode, VmessNode, ShadowsocksNode, Hysteria2Node, AnyTLSNode, TrojanNode, TuicNode } from '../src/types';

describe('Lossless Parser Suite', () => {
  test('VLESS Reality & unknownParams preservation', () => {
    const node = parseSingleNode(FIXTURES.vless_reality) as VlessNode;
    expect(node).not.toBeNull();
    expect(node.protocol).toBe('vless');
    expect(node.name).toBe('香港 VLESS Reality');
    expect(node.server).toBe('1.2.3.4');
    expect(node.port).toBe(443);
    expect(node.source.format).toBe('uri');
    expect(node.source.raw).toBe(FIXTURES.vless_reality);
    
    expect(node.protocolData.uuid).toBe('b831381d-6324-4d53-ad4f-8cda48b30811');
    expect(node.protocolData.flow).toBe('xtls-rprx-vision');
    expect(node.protocolData.realityOpts?.publicKey).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
    expect(node.protocolData.realityOpts?.shortId).toBe('1a2b3c4d');
    expect(node.protocolData.realityOpts?.spiderX).toBe('/test');
    expect(node.protocolData.packetEncoding).toBe('xudp');
    
    // Unknown query param preserved in extras
    expect(node.protocolData.extras).toBeDefined();
    expect(node.protocolData.extras.customParam).toBe('preserveMe');
  });

  test('VLESS IPv6 & WebSocket parsing', () => {
    const node = parseSingleNode(FIXTURES.vless_ws_ipv6) as VlessNode;
    expect(node).not.toBeNull();
    expect(node.server).toBe('2606:4700:4700::1111');
    expect(node.port).toBe(443);
    expect(node.protocolData.transport?.type).toBe('ws');
    expect(node.protocolData.transport?.path).toBe('/myws?key=val');
    expect(node.protocolData.transport?.headers?.Host).toBe('cdn.example.com');
  });

  test('VLESS XHTTP parsing', () => {
    const node = parseSingleNode(FIXTURES.vless_xhttp) as VlessNode;
    expect(node).not.toBeNull();
    expect(node.protocolData.transport?.type).toBe('xhttp');
    expect(node.protocolData.transport?.path).toBe('/xhttp-path');
    expect(node.protocolData.transport?.headers?.Host).toBe('xhttp.example.com');
    expect(node.protocolData.transport?.mode).toBe('stream-up');
    expect(node.protocolData.transport?.extra).toBe('xhttp-extra');
  });

  test('VMess JSON & aid preservation (no forced alterId: 0)', () => {
    const node = parseSingleNode(FIXTURES.vmess_standard) as VmessNode;
    expect(node).not.toBeNull();
    expect(node.protocol).toBe('vmess');
    expect(node.name).toBe('美国 VMess WS');
    expect(node.server).toBe('9.8.7.6');
    expect(node.port).toBe(443);
    expect(node.protocolData.alterId).toBe(64); // aid preserved!
    expect(node.protocolData.uuid).toBe('a3d9059f-7db9-4674-8be0-b530263f848a');
    expect(node.protocolData.transport?.path).toBe('/vmessws');
    expect(node.protocolData.transport?.headers?.Host).toBe('us.example.com');
    expect(node.protocolData.packetEncoding).toBe('packet');
  });

  test('Shadowsocks SIP002 plugin & query preservation', () => {
    const node = parseSingleNode(FIXTURES.ss_sip002_plugin) as ShadowsocksNode;
    expect(node).not.toBeNull();
    expect(node.protocol).toBe('shadowsocks');
    expect(node.server).toBe('1.1.1.1');
    expect(node.port).toBe(8388);
    expect(node.protocolData.cipher).toBe('chacha20-ietf-poly1305');
    expect(node.protocolData.password).toBe('mypassword123!');
    expect(node.protocolData.plugin).toBe('v2ray-plugin');
    expect(node.protocolData.pluginOpts?.mode).toBe('websocket');
    expect(node.protocolData.pluginOpts?.host).toBe('cdn.ss.com');
    expect(node.protocolData.pluginOpts?.path).toBe('/ssws');
    expect(node.protocolData.pluginOpts?.tls).toBe(true);
    expect(node.protocolData.udpOverTcp).toBe(true);
  });

  test('Shadowsocks SS2022 with complex password', () => {
    const node = parseSingleNode(FIXTURES.ss_ss2022) as ShadowsocksNode;
    expect(node).not.toBeNull();
    expect(node.protocolData.cipher).toBe('2022-blake3-aes-128-gcm');
    expect(node.protocolData.password).toBe('dGVzdDEyMzQ1Njc4OTAxMg==');
    expect(node.protocolData.udpOverTcp).toBe(true);
    expect(node.protocolData.udpOverTcpVersion).toBe(2);
  });

  test('Hysteria 2 full parameters & unknown queries', () => {
    const node = parseSingleNode(FIXTURES.hy2_full) as Hysteria2Node;
    expect(node).not.toBeNull();
    expect(node.protocol).toBe('hysteria2');
    expect(node.server).toBe('2001:db8::1');
    expect(node.port).toBe(443);
    expect(node.protocolData.password).toBe('my_hy2_password');
    expect(node.protocolData.sni).toBe('hy2.example.com');
    expect(node.protocolData.obfs).toBe('salamander');
    expect(node.protocolData.obfsPassword).toBe('obfspass123');
    expect(node.protocolData.ports).toBe('20000-30000');
    expect(node.protocolData.hopInterval).toBe(30);
    expect(node.protocolData.up).toBe('100');
    expect(node.protocolData.down).toBe('500');
    expect(node.protocolData.alpn).toEqual(['h3']);
    expect(node.protocolData.extras.customHy2Param).toBe('val');

    // Gecko obfs min/max packet sizes
    const geckoNode = parseSingleNode(FIXTURES.hy2_gecko) as Hysteria2Node;
    expect(geckoNode).not.toBeNull();
    expect(geckoNode.protocolData.obfs).toBe('gecko');
    expect(geckoNode.protocolData.obfsMinPacketSize).toBe(64);
    expect(geckoNode.protocolData.obfsMaxPacketSize).toBe(1024);
  });

  test('AnyTLS parsing', () => {
    const node = parseSingleNode(FIXTURES.anytls_standard) as AnyTLSNode;
    expect(node).not.toBeNull();
    expect(node.protocol).toBe('anytls');
    expect(node.server).toBe('anytls.example.com');
    expect(node.port).toBe(8443);
    expect(node.protocolData.password).toBe('any_pass_123');
    expect(node.protocolData.idleSessionTimeout).toBe('60');
    expect(node.protocolData.minIdleSession).toBe('5');
    expect(node.protocolData.insecure).toBe(true);
  });

  test('Trojan and TUIC parsing', () => {
    const trojan = parseSingleNode(FIXTURES.trojan_ws) as TrojanNode;
    expect(trojan).not.toBeNull();
    expect(trojan.protocol).toBe('trojan');
    expect(trojan.protocolData.password).toBe('trojan_pass_999');
    expect(trojan.protocolData.transport?.path).toBe('/trws');

    const tuic = parseSingleNode(FIXTURES.tuic_standard) as TuicNode;
    expect(tuic).not.toBeNull();
    expect(tuic.protocol).toBe('tuic');
    expect(tuic.protocolData.uuid).toBe('tuic-uuid-123');
    expect(tuic.protocolData.password).toBe('tuic_pass_456');
    expect(tuic.protocolData.congestionController).toBe('bbr');
    expect(tuic.protocolData.udpRelayMode).toBe('native');
  });

  test('ShadowsocksR IPv4 and IPv6 parsing', () => {
    // IPv4 SSR
    const ssrIpv4 = 'ssr://' + Buffer.from('1.2.3.4:8388:origin:aes-128-cfb:plain:bXlwYXNz/?remarks=U1NSX05vZGU').toString('base64');
    const node4 = parseSingleNode(ssrIpv4) as ShadowsocksRNode;
    expect(node4).not.toBeNull();
    expect(node4.server).toBe('1.2.3.4');
    expect(node4.port).toBe(8388);
    expect(node4.protocolData.cipher).toBe('aes-128-cfb');
    expect(node4.protocolData.password).toBe('mypass');
    expect(node4.name).toBe('SSR_Node');

    // IPv6 with brackets SSR
    const ssrIpv6Bracket = 'ssr://' + Buffer.from('[2001:db8::1]:8388:origin:aes-128-cfb:plain:bXlwYXNz/?remarks=U1NSX0lQdjY').toString('base64');
    const node6 = parseSingleNode(ssrIpv6Bracket) as ShadowsocksRNode;
    expect(node6).not.toBeNull();
    expect(node6.server).toBe('2001:db8::1');
    expect(node6.port).toBe(8388);
    expect(node6.protocolData.password).toBe('mypass');

    // IPv6 without brackets SSR
    const ssrIpv6NoBracket = 'ssr://' + Buffer.from('2001:db8::1:8388:origin:aes-128-cfb:plain:bXlwYXNz').toString('base64');
    const node6No = parseSingleNode(ssrIpv6NoBracket) as ShadowsocksRNode;
    expect(node6No).not.toBeNull();
    expect(node6No.server).toBe('2001:db8::1');
    expect(node6No.port).toBe(8388);
    expect(node6No.protocolData.password).toBe('mypass');
  });

  test('Clash YAML parsing without lossy decode on special characters in password', async () => {
    const clashYaml = `
proxies:
  - name: "Clash Special Pass"
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-128-gcm
    password: "my%20secret+pass/word=123"
`;
    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.name).toBe('Clash Special Pass');
    // Exact password unchanged - NO tryDecodeURIComponent
    expect(nodes[0]!.protocolData.password).toBe('my%20secret+pass/word=123');
  });
});
