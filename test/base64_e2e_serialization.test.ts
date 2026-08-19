// test/base64_e2e_serialization.test.ts
import { describe, expect, test } from 'vitest';
import { parseContent, parseSingleNode } from '../src/parser';
import { toRawLinks, toBase64 } from '../src/adapters/raw';
import { safeBase64Decode } from '../src/utils';
import worker from '../src/index';

describe('Base64 & Raw End-to-End Serialization Test Suite', () => {
  // 1. Clash VMess -> Base64 -> decode -> vmess://
  test('Clash VMess (WS / gRPC / mKCP / HTTP / XHTTP) serializes to valid vmess:// links in Base64', async () => {
    const clashYaml = `
proxies:
  - name: "Clash VMess WS"
    type: vmess
    server: 1.2.3.4
    port: 443
    uuid: a3d9059f-7db9-4674-8be0-b530263f848a
    alterId: 0
    cipher: auto
    tls: true
    servername: ws.example.com
    network: ws
    ws-opts:
      path: /vmessws
      headers:
        Host: ws.example.com
    alpn:
      - h2
      - http/1.1
    client-fingerprint: chrome
  - name: "Clash VMess gRPC"
    type: vmess
    server: 1.2.3.5
    port: 443
    uuid: b3d9059f-7db9-4674-8be0-b530263f848b
    alterId: 16
    cipher: aes-128-gcm
    tls: true
    servername: grpc.example.com
    network: grpc
    grpc-opts:
      grpc-service-name: vmess-grpc-service
  - name: "Clash VMess mKCP"
    type: vmess
    server: 1.2.3.6
    port: 8443
    uuid: c3d9059f-7db9-4674-8be0-b530263f848c
    alterId: 0
    cipher: auto
    network: mkcp
    mkcp-opts:
      seed: "secret-seed"
      header:
        type: utp
  - name: "Clash VMess XHTTP"
    type: vmess
    server: 1.2.3.7
    port: 443
    uuid: d3d9059f-7db9-4674-8be0-b530263f848d
    alterId: 0
    cipher: auto
    tls: true
    network: xhttp
    xhttp-opts:
      path: /xhttp
      host: xhttp.example.com
`;

    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(4);

    const b64 = toBase64(nodes);
    expect(b64.length).toBeGreaterThan(0);

    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(4);

    // Verify all 4 nodes produce vmess:// links that can be reparsed
    for (const line of lines) {
      expect(line.startsWith('vmess://')).toBe(true);
      const reparsed = parseSingleNode(line);
      expect(reparsed).not.toBeNull();
      expect(reparsed!.protocol).toBe('vmess');
    }

    // Check specific fields of Clash VMess WS
    const wsNode = parseSingleNode(lines[0]!);
    expect(wsNode!.name).toBe('Clash VMess WS');
    expect(wsNode!.server).toBe('1.2.3.4');
    expect(wsNode!.port).toBe(443);
    expect(wsNode!.protocolData.uuid).toBe('a3d9059f-7db9-4674-8be0-b530263f848a');
    expect(wsNode!.protocolData.tls).toBe(true);
    expect(wsNode!.protocolData.sni).toBe('ws.example.com');
    expect(wsNode!.protocolData.transport?.type).toBe('ws');
    expect(wsNode!.protocolData.transport?.path).toBe('/vmessws');
    expect(wsNode!.protocolData.transport?.headers?.Host).toBe('ws.example.com');

    // Check specific fields of Clash VMess gRPC
    const grpcNode = parseSingleNode(lines[1]!);
    expect(grpcNode!.name).toBe('Clash VMess gRPC');
    expect(grpcNode!.server).toBe('1.2.3.5');
    expect(grpcNode!.port).toBe(443);
    expect(grpcNode!.protocolData.uuid).toBe('b3d9059f-7db9-4674-8be0-b530263f848b');
    expect(grpcNode!.protocolData.alterId).toBe(16);
    expect(grpcNode!.protocolData.cipher).toBe('aes-128-gcm');
    expect(grpcNode!.protocolData.transport?.type).toBe('grpc');
    expect(grpcNode!.protocolData.transport?.serviceName).toBe('vmess-grpc-service');

    // Check specific fields of Clash VMess mKCP
    const kcpNode = parseSingleNode(lines[2]!);
    expect(kcpNode!.name).toBe('Clash VMess mKCP');
    expect(kcpNode!.server).toBe('1.2.3.6');
    expect(kcpNode!.port).toBe(8443);
    expect(kcpNode!.protocolData.transport?.type).toBe('mkcp');
    expect(kcpNode!.protocolData.transport?.headerType).toBe('utp');
    expect(kcpNode!.protocolData.transport?.seed).toBe('secret-seed');
  });

  // 2. Sing-box VMess -> Base64 -> decode -> vmess://
  test('Sing-box VMess serializes to valid vmess:// links in Base64', async () => {
    const singboxJson = JSON.stringify({
      outbounds: [
        {
          type: 'vmess',
          tag: 'Singbox VMess WS',
          server: 'singbox.vmess.com',
          server_port: 443,
          uuid: 'e3d9059f-7db9-4674-8be0-b530263f848e',
          security: 'auto',
          alter_id: 0,
          tls: {
            enabled: true,
            server_name: 'singbox.vmess.com',
            insecure: true,
            alpn: ['h2', 'http/1.1'],
            utls: {
              enabled: true,
              fingerprint: 'safari'
            }
          },
          transport: {
            type: 'ws',
            path: '/singws',
            headers: {
              Host: 'singbox.vmess.com'
            }
          }
        },
        {
          type: 'vmess',
          tag: 'Singbox VMess gRPC',
          server: 'singbox.grpc.com',
          server_port: 8443,
          uuid: 'f3d9059f-7db9-4674-8be0-b530263f848f',
          security: 'chacha20-poly1305',
          alter_id: 4,
          tls: {
            enabled: true,
            server_name: 'singbox.grpc.com'
          },
          transport: {
            type: 'grpc',
            service_name: 'my-grpc-service'
          }
        }
      ]
    });

    const nodes = await parseContent(singboxJson);
    expect(nodes.length).toBe(2);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const wsNode = parseSingleNode(lines[0]!);
    expect(wsNode).not.toBeNull();
    expect(wsNode!.name).toBe('Singbox VMess WS');
    expect(wsNode!.server).toBe('singbox.vmess.com');
    expect(wsNode!.port).toBe(443);
    expect(wsNode!.protocolData.uuid).toBe('e3d9059f-7db9-4674-8be0-b530263f848e');
    expect(wsNode!.protocolData.tls).toBe(true);
    expect(wsNode!.protocolData.transport?.type).toBe('ws');
    expect(wsNode!.protocolData.transport?.path).toBe('/singws');

    const grpcNode = parseSingleNode(lines[1]!);
    expect(grpcNode).not.toBeNull();
    expect(grpcNode!.name).toBe('Singbox VMess gRPC');
    expect(grpcNode!.server).toBe('singbox.grpc.com');
    expect(grpcNode!.port).toBe(8443);
    expect(grpcNode!.protocolData.alterId).toBe(4);
    expect(grpcNode!.protocolData.cipher).toBe('chacha20-poly1305');
    expect(grpcNode!.protocolData.transport?.type).toBe('grpc');
    expect(grpcNode!.protocolData.transport?.serviceName).toBe('my-grpc-service');
  });

  // 3. Clash SS -> Base64 -> decode -> ss://
  test('Clash SS (standard, plugin, SS2022) serializes to valid ss:// links in Base64', async () => {
    const clashYaml = `
proxies:
  - name: "Clash SS Standard"
    type: ss
    server: 8.8.8.8
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: mypassword123
    udp: true
  - name: "Clash SS Plugin"
    type: ss
    server: 8.8.8.9
    port: 8443
    cipher: aes-128-gcm
    password: pluginpass
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.domain.com
      path: /ws
      tls: true
`;

    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(2);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const ss1 = parseSingleNode(lines[0]!);
    expect(ss1).not.toBeNull();
    expect(ss1!.protocol).toBe('shadowsocks');
    expect(ss1!.name).toBe('Clash SS Standard');
    expect(ss1!.server).toBe('8.8.8.8');
    expect(ss1!.port).toBe(8388);
    expect(ss1!.protocolData.cipher).toBe('chacha20-ietf-poly1305');
    expect(ss1!.protocolData.password).toBe('mypassword123');

    const ss2 = parseSingleNode(lines[1]!);
    expect(ss2).not.toBeNull();
    expect(ss2!.name).toBe('Clash SS Plugin');
    expect(ss2!.protocolData.plugin).toBe('v2ray-plugin');
    expect(ss2!.protocolData.pluginOpts?.mode).toBe('websocket');
    expect(ss2!.protocolData.pluginOpts?.host).toBe('cdn.domain.com');
  });

  // 4. Clash VLESS -> Base64 -> decode -> vless://
  test('Clash VLESS (Reality, WS, gRPC) serializes to valid vless:// links in Base64', async () => {
    const clashYaml = `
proxies:
  - name: "Clash VLESS Reality"
    type: vless
    server: vless.reality.com
    port: 443
    uuid: 12345678-1234-1234-1234-123456789abc
    flow: xtls-rprx-vision
    packet-encoding: xudp
    tls: true
    servername: reality.sni.com
    client-fingerprint: chrome
    reality-opts:
      public-key: pbk_key_123456
      short-id: 1a2b3c4d
      spider-x: /spx
  - name: "Clash VLESS WS"
    type: vless
    server: vless.ws.com
    port: 443
    uuid: 22345678-1234-1234-1234-123456789abc
    network: ws
    tls: true
    servername: sni.ws.com
    ws-opts:
      path: /vlessws
      headers:
        Host: ws.domain.com
  - name: "Clash VLESS gRPC"
    type: vless
    server: vless.grpc.com
    port: 443
    uuid: 32345678-1234-1234-1234-123456789abc
    network: grpc
    tls: true
    servername: sni.grpc.com
    grpc-opts:
      grpc-service-name: vless-grpc-service
`;

    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(3);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(3);

    // 1. Reality Node
    const realityNode = parseSingleNode(lines[0]!);
    expect(realityNode).not.toBeNull();
    expect(realityNode!.name).toBe('Clash VLESS Reality');
    expect(realityNode!.server).toBe('vless.reality.com');
    expect(realityNode!.port).toBe(443);
    expect(realityNode!.protocolData.uuid).toBe('12345678-1234-1234-1234-123456789abc');
    expect(realityNode!.protocolData.flow).toBe('xtls-rprx-vision');
    expect(realityNode!.protocolData.packetEncoding).toBe('xudp');
    expect(realityNode!.protocolData.security).toBe('reality');
    expect(realityNode!.protocolData.realityOpts?.publicKey).toBe('pbk_key_123456');
    expect(realityNode!.protocolData.realityOpts?.shortId).toBe('1a2b3c4d');
    expect(realityNode!.protocolData.realityOpts?.spiderX).toBe('/spx');

    // 2. WS Node: type MUST be 'ws' (NOT 'vless'!), path and host must be preserved
    expect(lines[1]!).toContain('type=ws');
    expect(lines[1]!).not.toContain('type=vless');
    expect(lines[1]!).toContain('path=%2Fvlessws');
    expect(lines[1]!).toContain('host=ws.domain.com');
    const wsNode = parseSingleNode(lines[1]!);
    expect(wsNode).not.toBeNull();
    expect(wsNode!.name).toBe('Clash VLESS WS');
    expect(wsNode!.protocolData.transport?.type).toBe('ws');
    expect(wsNode!.protocolData.transport?.path).toBe('/vlessws');
    expect(wsNode!.protocolData.transport?.headers?.Host).toBe('ws.domain.com');

    // 3. gRPC Node: type MUST be 'grpc', serviceName must be preserved
    expect(lines[2]!).toContain('type=grpc');
    expect(lines[2]!).not.toContain('type=vless');
    expect(lines[2]!).toContain('serviceName=vless-grpc-service');
    const grpcNode = parseSingleNode(lines[2]!);
    expect(grpcNode).not.toBeNull();
    expect(grpcNode!.name).toBe('Clash VLESS gRPC');
    expect(grpcNode!.protocolData.transport?.type).toBe('grpc');
    expect(grpcNode!.protocolData.transport?.serviceName).toBe('vless-grpc-service');
  });

  // 4b. Sing-box VLESS -> Base64 -> decode -> vless://
  test('Sing-box VLESS (WS and gRPC) serializes to valid vless:// links with correct transport type', async () => {
    const singboxJson = JSON.stringify({
      outbounds: [
        {
          type: 'vless',
          tag: 'Singbox VLESS WS',
          server: 'sb.vless.com',
          server_port: 443,
          uuid: '42345678-1234-1234-1234-123456789abc',
          tls: {
            enabled: true,
            server_name: 'sb.sni.com'
          },
          transport: {
            type: 'ws',
            path: '/sb-vless-ws',
            headers: {
              Host: 'sb.ws.com'
            }
          }
        },
        {
          type: 'vless',
          tag: 'Singbox VLESS gRPC',
          server: 'sb.grpc.com',
          server_port: 443,
          uuid: '52345678-1234-1234-1234-123456789abc',
          tls: {
            enabled: true,
            server_name: 'sb.grpc.com'
          },
          transport: {
            type: 'grpc',
            service_name: 'sb-grpc-service'
          }
        }
      ]
    });

    const nodes = await parseContent(singboxJson);
    expect(nodes.length).toBe(2);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    // WS
    expect(lines[0]!).toContain('type=ws');
    expect(lines[0]!).not.toContain('type=vless');
    expect(lines[0]!).toContain('path=%2Fsb-vless-ws');
    expect(lines[0]!).toContain('host=sb.ws.com');
    const wsNode = parseSingleNode(lines[0]!);
    expect(wsNode).not.toBeNull();
    expect(wsNode!.protocolData.transport?.type).toBe('ws');
    expect(wsNode!.protocolData.transport?.path).toBe('/sb-vless-ws');
    expect(wsNode!.protocolData.transport?.headers?.Host).toBe('sb.ws.com');

    // gRPC
    expect(lines[1]!).toContain('type=grpc');
    expect(lines[1]!).not.toContain('type=vless');
    expect(lines[1]!).toContain('serviceName=sb-grpc-service');
    const grpcNode = parseSingleNode(lines[1]!);
    expect(grpcNode).not.toBeNull();
    expect(grpcNode!.protocolData.transport?.type).toBe('grpc');
    expect(grpcNode!.protocolData.transport?.serviceName).toBe('sb-grpc-service');
  });

  // 5. Clash SSR -> Base64 -> decode -> ssr://
  test('Clash SSR serializes to valid ssr:// links in Base64', async () => {
    const clashYaml = `
proxies:
  - name: "Clash SSR Node"
    type: ssr
    server: 9.9.9.9
    port: 8388
    cipher: aes-256-cfb
    password: ssrpassword
    protocol: auth_aes128_md5
    protocol-param: protoparam123
    obfs: tls1.2_ticket_auth
    obfs-param: obfsparam456
`;

    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(1);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    expect(decoded.startsWith('ssr://')).toBe(true);

    const ssrNode = parseSingleNode(decoded);
    expect(ssrNode).not.toBeNull();
    expect(ssrNode!.protocol).toBe('ssr');
    expect(ssrNode!.name).toBe('Clash SSR Node');
    expect(ssrNode!.server).toBe('9.9.9.9');
    expect(ssrNode!.port).toBe(8388);
    expect(ssrNode!.protocolData.cipher).toBe('aes-256-cfb');
    expect(ssrNode!.protocolData.password).toBe('ssrpassword');
    expect(ssrNode!.protocolData.protocol).toBe('auth_aes128_md5');
    expect(ssrNode!.protocolData.obfs).toBe('tls1.2_ticket_auth');
    expect(ssrNode!.protocolData.protoParam).toBe('protoparam123');
    expect(ssrNode!.protocolData.obfsParam).toBe('obfsparam456');
  });

  // 6. Mixed multi-source subscription -> Base64 -> decode -> matches total node count
  test('Mixed multi-format and multi-protocol subscription retains 100% of nodes in Base64 output', async () => {
    const mixedInput = `
proxies:
  - name: "Clash VMess"
    type: vmess
    server: vmess.clash.com
    port: 443
    uuid: 11111111-1111-1111-1111-111111111111
    network: ws
  - name: "Clash SS"
    type: ss
    server: ss.clash.com
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: pass
  - name: "Clash Trojan"
    type: trojan
    server: trojan.clash.com
    port: 443
    password: trojanpassword
    sni: trojan.clash.com
  - name: "Clash Hysteria2"
    type: hysteria2
    server: hy2.clash.com
    port: 443
    password: hy2password
  - name: "Clash AnyTLS"
    type: anytls
    server: anytls.clash.com
    port: 443
    password: anytlspassword
  - name: "Clash TUIC"
    type: tuic
    server: tuic.clash.com
    port: 8443
    uuid: tuic-uuid
    password: tuicpass
`;

    const nodes = await parseContent(mixedInput);
    expect(nodes.length).toBe(6);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(6);

    // Each line starts with the appropriate protocol prefix
    expect(lines[0]!.startsWith('vmess://')).toBe(true);
    expect(lines[1]!.startsWith('ss://')).toBe(true);
    expect(lines[2]!.startsWith('trojan://')).toBe(true);
    expect(lines[3]!.startsWith('hysteria2://')).toBe(true);
    expect(lines[4]!.startsWith('anytls://')).toBe(true);
    expect(lines[5]!.startsWith('tuic://')).toBe(true);
  });

  // 7. Error protection: nodes > 0 but raw = "" must throw Error
  test('toBase64 throws Error when nodes exist but no nodes could be serialized', () => {
    // Construct an unsupported dummy node that produces no raw links
    const invalidNode = {
      name: 'Unknown Node',
      server: '1.1.1.1',
      port: 80,
      protocol: 'unsupported_custom_protocol_xyz',
      source: { format: 'custom' as any, raw: '' },
      protocolData: {}
    };

    expect(() => {
      toBase64([invalidNode as any]);
    }).toThrow('Base64 output is empty: no nodes could be serialized');
  });

  // 8. End-to-End Worker Request with target=base64
  test('Worker /sub endpoint converts Clash VMess subscription to Base64 HTTP response successfully', async () => {
    const clashYaml = `
proxies:
  - name: "Sub VMess 1"
    type: vmess
    server: sub1.example.com
    port: 443
    uuid: 12345678-1234-1234-1234-123456789012
    network: ws
    ws-opts:
      path: /ws
  - name: "Sub VMess 2"
    type: vmess
    server: sub2.example.com
    port: 443
    uuid: 22345678-1234-1234-1234-123456789012
    network: grpc
    grpc-opts:
      grpc-service-name: grpc-service
`;

    const req = new Request('https://sub.example.com/sub?target=base64&token=test-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: clashYaml,
        target: 'base64',
        token: 'test-token'
      })
    });

    const env = { AUTH_TOKEN: 'test-token' };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const b64Text = await res.text();
    expect(b64Text.length).toBeGreaterThan(0);

    const decoded = safeBase64Decode(b64Text);
    const lines = decoded.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect(lines[0]!.startsWith('vmess://')).toBe(true);
    expect(lines[1]!.startsWith('vmess://')).toBe(true);
  });

  // 9. Unsupported protocol graceful skip & warn
  test('Unsupported protocols (e.g. wireguard, snell) are skipped with warning while valid nodes serialize cleanly', async () => {
    const clashYaml = `
proxies:
  - name: "Valid VLESS WS"
    type: vless
    server: vless.ok.com
    port: 443
    uuid: 12345678-1234-1234-1234-123456789012
    network: ws
  - name: "Unsupported WireGuard"
    type: wireguard
    server: wg.example.com
    port: 51820
    ip: 10.0.0.2
    public-key: wg_pub_key
  - name: "Valid SS"
    type: ss
    server: ss.ok.com
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: sspass
`;

    const nodes = await parseContent(clashYaml);
    expect(nodes.length).toBe(3);

    const b64 = toBase64(nodes);
    const decoded = safeBase64Decode(b64);
    const lines = decoded.split('\n').filter(Boolean);

    // Wireguard is skipped, 2 valid nodes serialized
    expect(lines.length).toBe(2);
    expect(lines[0]!.startsWith('vless://')).toBe(true);
    expect(lines[1]!.startsWith('ss://')).toBe(true);
  });
});
