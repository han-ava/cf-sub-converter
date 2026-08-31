import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adaptNodesToSingBox,
  adaptNodeToSingBox,
  nodeToSingBoxOutbound
} from '../src/adapters/singbox';
import { toSingBox } from '../src/generator';
import {
  parseAnyTLS,
  parseContent,
  parseHysteria2,
  parseShadowsocks,
  parseTrojan,
  parseTuic,
  parseVless,
  parseVmess
} from '../src/parsers';
import { NodeEnvelope } from '../src/types';

const UUID_A = 'b831381d-6324-4d53-ad4f-8cda48b30811';
const UUID_B = 'a3d9059f-7db9-4674-8be0-b530263f848a';
const REALITY_PUBLIC_KEY = 'f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY';
const singBoxBin = process.env.SING_BOX_BIN ?? 'sing-box';

function required<T>(value: T | null): T {
  expect(value).not.toBeNull();
  return value!;
}

describe('Sing-box v1.13.21 protocol mapping', () => {
  test('maps Shadowsocks plugin options and UDP-over-TCP to native fields', () => {
    const node = required(parseShadowsocks(
      'ss://' + btoa('chacha20-ietf-poly1305:secret')
      + '@1.1.1.1:8388?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.example.com%3Bpath%3D%2Fws%3Btls'
      + '&udp-over-tcp=true&udp-over-tcp-version=2#SS'
    ));

    const result = adaptNodeToSingBox(node);
    expect(result.fatal).toBe(false);
    expect(result.emitted).toBe(true);
    expect(result.config).toMatchObject({
      type: 'shadowsocks',
      plugin: 'v2ray-plugin',
      plugin_opts: 'mode=websocket;host=cdn.example.com;path=/ws;tls',
      udp_over_tcp: { enabled: true, version: 2 }
    });

    const objectUot: NodeEnvelope = {
      ...node,
      protocolData: {
        ...(node.protocolData as Record<string, any>),
        udpOverTcp: { enabled: true, version: 2 },
        udpOverTcpVersion: undefined
      }
    } as NodeEnvelope;
    expect(adaptNodeToSingBox(objectUot)).toMatchObject({
      fatal: false,
      emitted: true,
      config: { udp_over_tcp: { enabled: true, version: 2 } }
    });
  });

  test('normalizes supported Shadowsocks plugins and rejects plugins absent from v1.13.21', async () => {
    const [obfs, shadowTls] = await parseContent(`
proxies:
  - name: Obfs
    type: ss
    server: 1.1.1.1
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: secret
    plugin: obfs
    plugin-opts:
      mode: tls
      host: cdn.example.com
  - name: ShadowTLS
    type: ss
    server: 1.0.0.1
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: secret
    plugin: shadow-tls
    plugin-opts:
      version: 3
      host: cdn.example.com
      password: plugin-secret
`);

    expect(adaptNodeToSingBox(obfs!).config).toMatchObject({
      plugin: 'obfs-local',
      plugin_opts: 'obfs=tls;obfs-host=cdn.example.com'
    });
    const rejected = adaptNodeToSingBox(shadowTls!);
    expect(rejected.fatal).toBe(true);
    expect(rejected.unsupportedParams).toContain('plugin');
  });

  test('maps VMess, VLESS and Trojan nested transports without silently falling back to TCP', () => {
    const vmess = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'VMess WS', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 64, scy: 'aes-128-gcm', net: 'ws',
      host: 'cdn.example.com', path: '/vmess', tls: 'tls', sni: 'origin.example.com',
      fp: 'chrome', packetEncoding: 'xudp', globalPadding: true, authenticatedLength: true
    }))));
    const vless = required(parseVless(
      `vless://${UUID_B}@vless.example.com:443?security=reality&flow=xtls-rprx-vision`
      + `&sni=www.example.com&fp=firefox&pbk=${REALITY_PUBLIC_KEY}&sid=1234abcd`
      + '&type=grpc&serviceName=vless-grpc&packetEncoding=packetaddr#VLESS'
    ));
    const trojan = required(parseTrojan(
      'trojan://password@trojan.example.com:443?type=ws&path=%2Ftrojan'
      + '&host=cdn.example.com&sni=origin.example.com&fp=safari#Trojan'
    ));

    expect(nodeToSingBoxOutbound(vmess)).toMatchObject({
      type: 'vmess',
      alter_id: 64,
      packet_encoding: 'xudp',
      global_padding: true,
      authenticated_length: true,
      transport: { type: 'ws', path: '/vmess', headers: { Host: 'cdn.example.com' } },
      tls: { enabled: true, server_name: 'origin.example.com', utls: { enabled: true, fingerprint: 'chrome' } }
    });
    expect(nodeToSingBoxOutbound(vless)).toMatchObject({
      type: 'vless',
      flow: 'xtls-rprx-vision',
      packet_encoding: 'packetaddr',
      transport: { type: 'grpc', service_name: 'vless-grpc' },
      tls: {
        enabled: true,
        server_name: 'www.example.com',
        utls: { enabled: true, fingerprint: 'firefox' },
        reality: { enabled: true, public_key: REALITY_PUBLIC_KEY, short_id: '1234abcd' }
      }
    });
    expect(nodeToSingBoxOutbound(trojan)).toMatchObject({
      type: 'trojan',
      transport: { type: 'ws', path: '/trojan', headers: { Host: 'cdn.example.com' } },
      tls: {
        enabled: true,
        server_name: 'origin.example.com',
        utls: { enabled: true, fingerprint: 'safari' }
      }
    });
  });

  test('maps URI HTTP hosts, Reality default uTLS and multiplex without silent loss', () => {
    const http = required(parseVless(
      `vless://${UUID_A}@vless.example.com:443?security=tls&type=http&host=cdn.example.com&path=%2Fh2#HTTP`
    ));
    const reality = required(parseVless(
      `vless://${UUID_B}@reality.example.com:443?security=reality&pbk=${REALITY_PUBLIC_KEY}&sid=00aa#Reality`
    ));
    const multiplexNode: NodeEnvelope = {
      ...http,
      name: 'Multiplex',
      protocolData: {
        ...(http.protocolData as Record<string, any>),
        smux: { enabled: true, protocol: 'h2mux', maxConnections: 2, minStreams: 4 }
      }
    } as NodeEnvelope;

    expect(nodeToSingBoxOutbound(http)).toMatchObject({
      transport: { type: 'http', host: ['cdn.example.com'], path: '/h2' }
    });
    expect(adaptNodeToSingBox(reality).fatal).toBe(false);
    expect(nodeToSingBoxOutbound(reality)).toMatchObject({
      tls: {
        utls: { enabled: true, fingerprint: 'chrome' },
        reality: { enabled: true, public_key: REALITY_PUBLIC_KEY, short_id: '00aa' }
      }
    });
    expect(adaptNodeToSingBox(multiplexNode).fatal).toBe(false);
    expect(nodeToSingBoxOutbound(multiplexNode)).toMatchObject({
      multiplex: {
        enabled: true,
        protocol: 'h2mux',
        max_connections: 2,
        min_streams: 4
      }
    });
  });

  test('maps Clash VLESS, VMess and Trojan transport option objects', async () => {
    const nodes = await parseContent(`
proxies:
  - name: Clash VLESS WS
    type: vless
    server: vless.example.com
    port: 443
    uuid: ${UUID_A}
    network: ws
    tls: true
    servername: origin.example.com
    ws-opts:
      path: /vless
      headers:
        Host: cdn.example.com
  - name: Clash VMess gRPC
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: ${UUID_B}
    alterId: 16
    cipher: auto
    network: grpc
    tls: true
    grpc-opts:
      grpc-service-name: vmess-grpc
  - name: Clash Trojan WS
    type: trojan
    server: trojan.example.com
    port: 443
    password: secret
    network: ws
    sni: origin.example.com
    ws-opts:
      path: /trojan
`);

    expect(nodes).toHaveLength(3);
    expect(nodeToSingBoxOutbound(nodes[0]!)).toMatchObject({
      type: 'vless',
      transport: { type: 'ws', path: '/vless', headers: { Host: 'cdn.example.com' } },
      tls: { enabled: true, server_name: 'origin.example.com' }
    });
    expect(nodeToSingBoxOutbound(nodes[1]!)).toMatchObject({
      type: 'vmess',
      alter_id: 16,
      transport: { type: 'grpc', service_name: 'vmess-grpc' }
    });
    expect(nodeToSingBoxOutbound(nodes[2]!)).toMatchObject({
      type: 'trojan',
      transport: { type: 'ws', path: '/trojan' }
    });
    expect(nodes.map(node => adaptNodeToSingBox(node).fatal)).toEqual([false, false, false]);
  });

  test('preserves HTTP and HTTPUpgrade Host semantics and supported timeouts', async () => {
    const nodes = await parseContent(`
proxies:
  - name: VMess HTTP
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: ${UUID_A}
    cipher: auto
    network: http
    http-opts:
      path: /http
      headers:
        Host: cdn.example.com
      idle-timeout: 1m30s
      ping-timeout: 15s
  - name: Trojan Upgrade
    type: trojan
    server: trojan.example.com
    port: 443
    password: secret
    network: httpupgrade
    http-upgrade-opts:
      path: /upgrade
      headers:
        Host: upgrade.example.com
`);

    expect(adaptNodeToSingBox(nodes[0]!)).toMatchObject({ fatal: false, emitted: true, lossy: false });
    expect(nodeToSingBoxOutbound(nodes[0]!)).toMatchObject({
      transport: {
        type: 'http',
        host: ['cdn.example.com'],
        path: '/http',
        idle_timeout: '1m30s',
        ping_timeout: '15s'
      }
    });
    expect(nodeToSingBoxOutbound(nodes[1]!)).toMatchObject({
      transport: {
        type: 'httpupgrade',
        host: 'upgrade.example.com',
        path: '/upgrade'
      }
    });
  });

  test('maps Hysteria2, AnyTLS and TUIC fields supported by v1.13.21', () => {
    const hy2 = required(parseHysteria2(
      'hysteria2://hy2-pass@hy2.example.com:443?ports=20000-30000,31000'
      + '&hop-interval=30&up=100&down=500&obfs=salamander&obfs-password=obfs-pass'
      + '&sni=hy2-sni.example.com&alpn=h3&skip-cert-verify=true#HY2'
    ));
    const anytls = required(parseAnyTLS(
      'anytls://any-pass@any.example.com:443?sni=any-sni.example.com&alpn=h2,http%2F1.1'
      + '&client-fingerprint=chrome&idle-session-check-interval=15&idle-session-timeout=60'
      + '&min-idle-session=5&client-metadata=client-a&skip-cert-verify=true#AnyTLS'
    ));
    const tuic = required(parseTuic(
      `tuic://${UUID_A}:tuic-pass@tuic.example.com:443?sni=tuic-sni.example.com`
      + '&congestion_control=cubic&zero_rtt_handshake=true'
      + '&heartbeat-interval=10&disable-sni=true&udp-over-stream=true'
      + '&alpn=h3&skip-cert-verify=true#TUIC'
    ));

    expect(nodeToSingBoxOutbound(hy2)).toMatchObject({
      type: 'hysteria2',
      server_ports: ['20000:30000', '31000:31000'],
      hop_interval: '30s',
      up_mbps: 100,
      down_mbps: 500,
      obfs: { type: 'salamander', password: 'obfs-pass' },
      tls: { enabled: true, server_name: 'hy2-sni.example.com', alpn: ['h3'], insecure: true }
    });
    expect(nodeToSingBoxOutbound(anytls)).toMatchObject({
      type: 'anytls',
      idle_session_check_interval: '15s',
      idle_session_timeout: '60s',
      min_idle_session: 5,
      client_metadata: 'client-a',
      tls: {
        enabled: true,
        server_name: 'any-sni.example.com',
        alpn: ['h2', 'http/1.1'],
        insecure: true,
        utls: { enabled: true, fingerprint: 'chrome' }
      }
    });
    expect(nodeToSingBoxOutbound(tuic)).toMatchObject({
      type: 'tuic',
      uuid: UUID_A,
      password: 'tuic-pass',
      congestion_control: 'cubic',
      zero_rtt_handshake: true,
      heartbeat: '10s',
      udp_over_stream: true,
      tls: {
        enabled: true,
        disable_sni: true,
        server_name: 'tuic-sni.example.com',
        alpn: ['h3'],
        insecure: true
      }
    });
  });

  test('accepts a TUIC v5 UUID with an omitted optional password', () => {
    const node = required(parseTuic(
      `tuic://${UUID_A}@tuic.example.com:443?sni=tuic.example.com#TUIC-No-Password`
    ));
    expect(node.protocolData).toMatchObject({ uuid: UUID_A });
    expect(node.protocolData.token).toBeUndefined();

    const result = adaptNodeToSingBox(node);
    expect(result).toMatchObject({ fatal: false, emitted: true });
    expect(result.config).toMatchObject({ type: 'tuic', uuid: UUID_A });
    expect(result.config?.password).toBeUndefined();
  });

  test('normalizes scalar YAML strings and rejects structured values for string-only fields', async () => {
    const nodes = await parseContent(`
proxies:
  - name: Numeric SS
    type: ss
    server: 1.1.1.1
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: 123456
  - name: Numeric Trojan
    type: trojan
    server: trojan.example.com
    port: 443
    password: 123456
    network: ws
    ws-opts:
      path: 123
      headers:
        X-Numeric: 456
  - name: Numeric HY2
    type: hysteria2
    server: hy2.example.com
    port: 443
    password: 123456
  - name: Numeric AnyTLS
    type: anytls
    server: any.example.com
    port: 443
    password: 123456
    client-metadata: 789
  - name: Numeric TUIC
    type: tuic
    server: tuic.example.com
    port: 443
    uuid: ${UUID_A}
    password: 123456
  - name: Bad Metadata
    type: anytls
    server: any.example.com
    port: 443
    password: secret
    client-metadata:
      key: value
  - name: Bad WS Path
    type: trojan
    server: trojan.example.com
    port: 443
    password: secret
    network: ws
    ws-opts:
      path:
        key: value
`);

    const results = adaptNodesToSingBox(nodes);
    expect(results.slice(0, 5).every(result => result.emitted && !result.fatal)).toBe(true);
    expect(results.slice(0, 5).map(result => result.config?.password)).toEqual([
      '123456', '123456', '123456', '123456', '123456'
    ]);
    expect(results[1]?.config?.transport).toMatchObject({
      path: '123',
      headers: { 'X-Numeric': '456' }
    });
    expect(results[3]?.config?.client_metadata).toBe('789');
    expect(results[5]).toMatchObject({ fatal: true, emitted: false });
    expect(results[5]?.unsupportedParams).toContain('client_metadata');
    expect(results[6]).toMatchObject({ fatal: true, emitted: false });
    expect(results[6]?.unsupportedParams).toContain('transport.path');
  });

  test('accepts VMess aes-128-cfb and rejects aes-128-ctr for v1.13.21', () => {
    const cfb = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'VMess CFB', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 0, scy: 'aes-128-cfb', net: 'tcp'
    }))));
    const ctr = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'VMess CTR', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 0, scy: 'aes-128-ctr', net: 'tcp'
    }))));

    expect(cfb.protocolData.cipher).toBe('aes-128-cfb');
    expect(adaptNodeToSingBox(cfb)).toMatchObject({
      fatal: false,
      emitted: true,
      config: { type: 'vmess', security: 'aes-128-cfb' }
    });
    expect(adaptNodeToSingBox(ctr)).toMatchObject({ fatal: true, emitted: false });
  });

  test('treats empty legacy VMess QUIC camouflage fields as defaults', () => {
    const node = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'VMess QUIC Defaults', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 0, scy: 'auto', net: 'quic', tls: 'tls',
      type: 'none', host: '', path: ''
    }))));

    expect(adaptNodeToSingBox(node)).toMatchObject({
      fatal: false,
      emitted: true,
      config: { transport: { type: 'quic' } }
    });
  });

  test('preserves cross-format AnyTLS min-idle-session zero', () => {
    const node = required(parseAnyTLS(
      'anytls://secret@any.example.com:443?min-idle-session=0#AnyTLS-Zero'
    ));

    expect(adaptNodeToSingBox(node)).toMatchObject({
      fatal: false,
      emitted: true,
      config: { min_idle_session: 0 }
    });
  });

  test('rejects VMess TCP HTTP camouflage that Sing-box cannot represent', () => {
    const node = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'VMess TCP HTTP', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 0, scy: 'auto', net: 'tcp', type: 'http',
      host: 'cdn.example.com', path: '/camouflage'
    }))));

    expect((node.protocolData.transport as Record<string, any>).headerType).toBe('http');
    expect(adaptNodeToSingBox(node)).toMatchObject({ fatal: true, emitted: false });
  });

  test('rejects disable_sni when Reality requires an SNI handshake', async () => {
    const parsedCross = required(parseVless(
      `vless://${UUID_A}@reality.example.com:443?security=reality&pbk=${REALITY_PUBLIC_KEY}#Reality-No-SNI`
    ));
    const cross: NodeEnvelope = {
      ...parsedCross,
      protocolData: {
        ...(parsedCross.protocolData as Record<string, any>),
        disableSni: true
      }
    } as NodeEnvelope;
    const native = await parseContent(JSON.stringify({
      outbounds: [{
        type: 'vless', tag: 'native-reality', server: 'reality.example.com', server_port: 443,
        uuid: UUID_A,
        tls: {
          enabled: true,
          disable_sni: true,
          utls: { enabled: true, fingerprint: 'chrome' },
          reality: { enabled: true, public_key: REALITY_PUBLIC_KEY }
        }
      }]
    }));

    for (const result of [adaptNodeToSingBox(cross), adaptNodeToSingBox(native[0]!)]) {
      expect(result).toMatchObject({ fatal: true, emitted: false });
      expect(result.unsupportedParams).toContain('tls.disable_sni');
    }
  });

  test('rejects ShadowsocksR because it was removed before v1.13.21', () => {
    const node: NodeEnvelope = {
      name: 'SSR',
      protocol: 'ssr',
      server: 'ssr.example.com',
      port: 8388,
      source: { format: 'uri', raw: 'ssr://fixture' },
      protocolData: {
        cipher: 'aes-256-cfb',
        password: 'secret',
        protocol: 'auth_aes128_md5',
        protoParam: 'user-id',
        obfs: 'tls1.2_ticket_auth',
        obfsParam: 'cdn.example.com',
        extras: {}
      }
    };

    const result = adaptNodeToSingBox(node);
    expect(result.fatal).toBe(true);
    expect(result.emitted).toBe(false);
    expect(result.unsupportedParams).toContain('protocol');
  });

  test('rejects features that cannot be represented by stable v1.13.21', () => {
    const xhttp = required(parseVless(
      `vless://${UUID_A}@xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp#XHTTP`
    ));
    const gecko = required(parseHysteria2(
      'hysteria2://password@hy2.example.com:443?obfs=gecko&obfs-password=secret#Gecko'
    ));
    const tuicV4 = required(parseTuic(
      'tuic://legacy-token@tuic.example.com:443?token=legacy-token#TUIC-v4'
    ));
    const invalidUuid = required(parseVless(
      'vless://not-a-uuid@vless.example.com:443?security=tls#Invalid-UUID'
    ));
    const certificatePin = required(parseHysteria2(
      'hysteria2://password@hy2.example.com:443?insecure=1&pinSHA256='
      + 'f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2#Pinned'
    ));
    const randomHopInterval = required(parseHysteria2(
      'hysteria2://password@hy2.example.com:443?ports=20000-30000&hop-interval=15-30#Random-Hop'
    ));
    const quicSecurity = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'QUIC Security', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 0, scy: 'auto', net: 'quic', type: 'aes-128-gcm',
      host: 'quic-secret', path: 'quic-key'
    }))));
    const badRealityKey = required(parseVless(
      `vless://${UUID_A}@reality.example.com:443?security=reality&pbk=invalid&sid=abc#Bad-Reality`
    ));
    const badRealityFingerprint = required(parseVless(
      `vless://${UUID_A}@reality.example.com:443?security=reality&pbk=${REALITY_PUBLIC_KEY}&sid=00aa&fp=opera#Bad-Fingerprint`
    ));
    const badRealityShortId = required(parseVless(
      `vless://${UUID_A}@reality.example.com:443?security=reality&pbk=${REALITY_PUBLIC_KEY}&sid=abc#Bad-Short-ID`
    ));
    const tuicUdpConflict = required(parseTuic(
      `tuic://${UUID_A}:password@tuic.example.com:443?udp-relay-mode=quic&udp-over-stream=true#TUIC-UDP-Conflict`
    ));
    const invalidVmessFallback = required(parseVmess('vmess://' + btoa(JSON.stringify({
      v: '2', ps: 'Invalid VMess Fallback', add: 'vmess.example.com', port: 443,
      id: UUID_A, aid: 'abc', scy: 'bogus', net: 'tcp', tls: 'abc'
    }))));
    const badShadowsocksMethod: NodeEnvelope = {
      name: 'Bad SS Method',
      protocol: 'shadowsocks',
      server: '1.1.1.1',
      port: 8388,
      source: { format: 'clash', raw: '' },
      protocolData: {
        type: 'ss', server: '1.1.1.1', port: 8388,
        cipher: 'bogus', password: 'secret'
      }
    };
    const badTuicCongestion: NodeEnvelope = {
      ...required(parseTuic(`tuic://${UUID_A}:password@tuic.example.com:443#Bad-TUIC-CC`)),
      protocolData: {
        uuid: UUID_A,
        password: 'password',
        congestionController: 'bogus',
        sni: 'tuic.example.com'
      }
    } as NodeEnvelope;

    for (const [node, field] of [
      [xhttp, 'transport.type'],
      [gecko, 'obfs'],
      [tuicV4, 'token'],
      [invalidUuid, 'uuid'],
      [certificatePin, 'pinSHA256'],
      [randomHopInterval, 'hop_interval'],
      [quicSecurity, 'transport.security'],
      [badRealityKey, 'reality.public_key'],
      [badRealityFingerprint, 'tls.utls.fingerprint'],
      [badRealityShortId, 'reality.short_id'],
      [tuicUdpConflict, 'udp_over_stream'],
      [invalidVmessFallback, 'aid'],
      [badShadowsocksMethod, 'method'],
      [badTuicCongestion, 'congestion_control']
    ] as const) {
      const result = adaptNodeToSingBox(node);
      expect(result.fatal).toBe(true);
      expect(result.emitted).toBe(false);
      expect(result.unsupportedParams).toContain(field);
    }
  });

  test('rejects endpoint and multiplex values that official v1.13.21 cannot load', () => {
    const badPort: NodeEnvelope = {
      name: 'Decimal Port',
      protocol: 'shadowsocks',
      server: '1.1.1.1',
      port: 443.5,
      source: { format: 'clash', raw: '' },
      protocolData: {
        type: 'ss', server: '1.1.1.1', port: 443.5,
        cipher: 'chacha20-ietf-poly1305', password: 'secret'
      }
    };
    expect(adaptNodeToSingBox(badPort)).toMatchObject({
      fatal: true,
      emitted: false,
      unsupportedParams: ['server_port']
    });

    const multiplexConflict: NodeEnvelope = {
      ...required(parseVless(`vless://${UUID_A}@vless.example.com:443?security=tls#Mux-Conflict`)),
      protocolData: {
        uuid: UUID_A,
        security: 'tls',
        sni: 'vless.example.com',
        transport: { type: 'tcp' },
        multiplex: { enabled: true, protocol: 'smux', max_connections: 2, max_streams: 4 }
      }
    } as NodeEnvelope;
    expect(adaptNodeToSingBox(multiplexConflict)).toMatchObject({
      fatal: true,
      emitted: false,
      unsupportedParams: ['multiplex.max_streams']
    });

    const shadowsocks = required(parseShadowsocks(
      'ss://' + btoa('chacha20-ietf-poly1305:secret') + '@1.1.1.1:8388#SS-UOT'
    ));
    const badUotVersion: NodeEnvelope = {
      ...shadowsocks,
      protocolData: { ...(shadowsocks.protocolData as Record<string, any>), udpOverTcp: true, udpOverTcpVersion: 3 }
    } as NodeEnvelope;
    expect(adaptNodeToSingBox(badUotVersion).unsupportedParams).toContain('udp_over_tcp.version');

    const uotMultiplexConflict: NodeEnvelope = {
      ...shadowsocks,
      protocolData: {
        ...(shadowsocks.protocolData as Record<string, any>),
        udpOverTcp: true,
        smux: { enabled: true }
      }
    } as NodeEnvelope;
    expect(adaptNodeToSingBox(uotMultiplexConflict)).toMatchObject({ fatal: true, emitted: false });

    const anyTls = required(parseAnyTLS('anytls://secret@any.example.com:443#AnyTLS-TFO'));
    const anyTlsTfo: NodeEnvelope = {
      ...anyTls,
      protocolData: { ...(anyTls.protocolData as Record<string, any>), tfo: true }
    } as NodeEnvelope;
    expect(adaptNodeToSingBox(anyTlsTfo).unsupportedParams).toContain('tcp_fast_open');
  });

  test('rejects invalid transport paths, duration overflow and uint32 overflow', async () => {
    const paths = await parseContent(`
proxies:
  - { name: Bad WS Path, type: vmess, server: vmess.example.com, port: 443, uuid: ${UUID_A}, cipher: auto, network: ws, ws-opts: { path: "%" } }
  - { name: Bad HTTP Path, type: vmess, server: vmess.example.com, port: 443, uuid: ${UUID_A}, cipher: auto, network: http, http-opts: { path: ["%"] } }
  - { name: Bad H2 Path, type: trojan, server: trojan.example.com, port: 443, password: secret, network: h2, h2-opts: { path: "%" } }
  - { name: Bad Upgrade Path, type: trojan, server: trojan.example.com, port: 443, password: secret, network: httpupgrade, http-upgrade-opts: { path: "%" } }
`);
    for (const result of adaptNodesToSingBox(paths)) {
      expect(result).toMatchObject({ fatal: true, emitted: false });
      expect(result.unsupportedParams).toContain('transport.path');
    }

    const limits = await parseContent(`
proxies:
  - { name: Bad Mark, type: ss, server: 1.1.1.1, port: 8388, cipher: chacha20-ietf-poly1305, password: secret, routing-mark: 4294967296 }
  - { name: Bad HY2 Duration, type: hysteria2, server: hy2.example.com, port: 443, password: secret, hop-interval: 10000000000 }
  - { name: Bad AnyTLS Duration, type: anytls, server: any.example.com, port: 443, password: secret, idle-session-timeout: 10000000000 }
  - { name: Bad TUIC Duration, type: tuic, server: tuic.example.com, port: 443, uuid: ${UUID_A}, heartbeat-interval: 10000000000 }
  - name: Bad gRPC Duration
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: ${UUID_A}
    cipher: auto
    network: grpc
    grpc-opts:
      idle-timeout: 10000000000
  - { name: Bad HY2 Integer, type: hysteria2, server: hy2.example.com, port: 443, password: secret, up: 1e20 }
`);
    const limitResults = adaptNodesToSingBox(limits);
    expect(limitResults.map(result => result.fatal)).toEqual([true, true, true, true, true, true]);
    expect(limitResults[0]?.unsupportedParams).toContain('routing_mark');
    expect(limitResults[1]?.unsupportedParams).toContain('hop_interval');
    expect(limitResults[2]?.unsupportedParams).toContain('idle_session_timeout');
    expect(limitResults[3]?.unsupportedParams).toContain('heartbeat');
    expect(limitResults[4]?.unsupportedParams).toContain('transport.idle_timeout');
    expect(limitResults[5]?.unsupportedParams).toContain('up_mbps');
  });

  test('gates native Sing-box fields that v1.13.21 cannot decode or initialize', async () => {
    const nodes = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'socks', tag: 'bad-endpoint', server: 123, server_port: '1080' },
        { type: 'socks', tag: 'bad-socks-version', server: '127.0.0.1', server_port: 1080, version: '6' },
        { type: 'trojan', tag: 'numeric-password', server: 'trojan.example.com', server_port: 443, password: 123, tls: { enabled: true } },
        { type: 'anytls', tag: 'numeric-metadata', server: 'any.example.com', server_port: 443, password: 'secret', client_metadata: 123, tls: { enabled: true } },
        { type: 'vmess', tag: 'bad-tls-bool', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', tls: { enabled: true, disable_sni: 'bogus' } },
        { type: 'vmess', tag: 'bad-utls-bool', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', tls: { enabled: true, utls: { enabled: 'bogus' } } },
        { type: 'vmess', tag: 'bad-early-data', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', transport: { type: 'ws', max_early_data: 4294967296 } },
        { type: 'vmess', tag: 'bad-native-path', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', transport: { type: 'ws', path: '%' } },
        { type: 'vmess', tag: 'bad-native-transport', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', transport: { type: 'xhttp' } },
        { type: 'vless', tag: 'bad-flow', server: 'vless.example.com', server_port: 443, uuid: UUID_A, flow: 'bogus' },
        { type: 'vless', tag: 'bad-packet', server: 'vless.example.com', server_port: 443, uuid: UUID_A, packet_encoding: 'bogus' },
        { type: 'vmess', tag: 'bad-network', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', network: 'bogus' },
        { type: 'naive', tag: 'bad-naive-tls', server: 'naive.example.com', server_port: 443, tls: { enabled: true, insecure: true } },
        { type: 'shadowsocks', tag: 'bad-plugin', server: '1.1.1.1', server_port: 8388, method: 'chacha20-ietf-poly1305', password: 'secret', plugin: 'bogus' },
        { type: 'anytls', tag: 'bad-min-idle', server: 'any.example.com', server_port: 443, password: 'secret', min_idle_session: '1', tls: { enabled: true } },
        { type: 'shadowtls', tag: 'bad-shadowtls-version', server: 'shadow.example.com', server_port: 443, version: '1', tls: { enabled: true } },
        { type: 'vmess', tag: 'bad-mux-types', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', multiplex: { enabled: 'true', max_connections: '1' } },
        { type: 'vmess', tag: 'bad-native-duration-type', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', connect_timeout: 1 },
        { type: 'http', tag: 'bad-tls-version', server: 'http.example.com', server_port: 443, tls: { enabled: true, min_version: 'wat' } },
        { type: 'ssh', tag: 'bad-ssh-empty-port', server: 'ssh.example.com', server_port: '', password: 'secret' },
        { type: 'vmess', tag: 'bad-native-type-case', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'AUTO' },
        { type: 'vmess', tag: 'bad-native-alias', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', transport: { type: 'h2' } },
        { type: 'vmess', tag: 'bad-native-detour-type', server: 'vmess.example.com', server_port: 443, uuid: UUID_A, security: 'auto', detour: 123 }
      ]
    }));
    const results = adaptNodesToSingBox(nodes);

    expect(results).toHaveLength(23);
    expect(results.every(result => result.fatal && !result.emitted)).toBe(true);
    expect(results[0]?.unsupportedParams).toContain('server');
    expect(results[1]?.unsupportedParams).toContain('version');
    expect(results[2]?.unsupportedParams).toContain('password');
    expect(results[3]?.unsupportedParams).toContain('client_metadata');
    expect(results[4]?.unsupportedParams).toContain('tls.disable_sni');
    expect(results[5]?.unsupportedParams).toContain('tls.utls.enabled');
    expect(results[6]?.unsupportedParams).toContain('transport.max_early_data');
    expect(results[7]?.unsupportedParams).toContain('transport.path');
    expect(results[8]?.unsupportedParams).toContain('transport.type');
    expect(results[9]?.unsupportedParams).toContain('flow');
    expect(results[10]?.unsupportedParams).toContain('packet_encoding');
    expect(results[11]?.unsupportedParams).toContain('network');
    expect(results[12]?.unsupportedParams).toContain('tls.insecure');
    expect(results[13]?.unsupportedParams).toContain('plugin');
    expect(results[14]?.unsupportedParams).toContain('min_idle_session');
    expect(results[15]?.unsupportedParams).toContain('version');
    expect(results[16]?.unsupportedParams).toContain('multiplex.enabled');
    expect(results[17]?.unsupportedParams).toContain('connect_timeout');
    expect(results[18]?.unsupportedParams).toContain('tls.min_version');
    expect(results[19]?.unsupportedParams).toContain('server_port');
    expect(results[20]?.unsupportedParams).toContain('security');
    expect(results[21]?.unsupportedParams).toContain('transport.type');
    expect(results[22]?.unsupportedParams).toContain('detour');
  });

  test('accepts native SSH with the official default port 22', async () => {
    const nodes = await parseContent(JSON.stringify({
      outbounds: [{
        type: 'ssh', tag: 'ssh-default-port', server: 'ssh.example.com', password: 'secret'
      }]
    }));

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.port).toBe(22);
    expect(adaptNodeToSingBox(nodes[0]!)).toMatchObject({ fatal: false, emitted: true });
  });

  test('rejects dangling and cyclic native Sing-box detour references as a node set', async () => {
    const dangling = await parseContent(JSON.stringify({
      outbounds: [{
        type: 'socks', tag: 'dangling', server: '127.0.0.1', server_port: 1080,
        detour: 'removed-group'
      }]
    }));
    expect(adaptNodesToSingBox(dangling)[0]).toMatchObject({
      fatal: true,
      emitted: false,
      unsupportedParams: ['detour']
    });

    const cycle = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'socks', tag: 'a', server: '127.0.0.1', server_port: 1080, detour: 'b' },
        { type: 'http', tag: 'b', server: '127.0.0.1', server_port: 8080, detour: 'a' }
      ]
    }));
    expect(adaptNodesToSingBox(cycle).every(result => result.fatal)).toBe(true);

    const mixedNameCollision = [
      required(parseShadowsocks('ss://' + btoa('chacha20-ietf-poly1305:secret') + '@1.1.1.1:8388#upstream')),
      ...(await parseContent(JSON.stringify({
        outbounds: [{
          type: 'socks', tag: 'native-chain', server: '127.0.0.1', server_port: 1080,
          detour: 'upstream'
        }]
      })))
    ];
    const mixedResults = adaptNodesToSingBox(mixedNameCollision);
    expect(mixedResults[0]?.fatal).toBe(false);
    expect(mixedResults[1]).toMatchObject({ fatal: true, emitted: false });

    const sourceA = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'socks', tag: 'chain-a', server: '127.0.0.1', server_port: 1080, detour: 'shared' },
        { type: 'selector', tag: 'shared', outbounds: ['direct'] }
      ]
    }));
    const sourceB = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'socks', tag: 'shared', server: '127.0.0.1', server_port: 1081 }
      ]
    }));
    const crossSourceResults = adaptNodesToSingBox([...sourceA, ...sourceB]);
    expect(crossSourceResults[0]).toMatchObject({ fatal: true, emitted: false });
    expect(crossSourceResults[0]?.unsupportedParams).toContain('detour');
    expect(crossSourceResults[1]).toMatchObject({ fatal: false, emitted: true });
  });

  test('validates required fields in native Sing-box server outbounds', async () => {
    const nodes = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'shadowsocks', tag: 'missing-password', server: '1.1.1.1', server_port: 8388, method: 'chacha20-ietf-poly1305' },
        { type: 'tuic', tag: 'missing-uuid', server: 'tuic.example.com', server_port: 443, tls: { enabled: true } },
        { type: 'anytls', tag: 'missing-tls', server: 'any.example.com', server_port: 443, password: 'secret' },
        { type: 'anytls', tag: 'invalid-tfo', server: 'any.example.com', server_port: 443, password: 'secret', tcp_fast_open: true, tls: { enabled: true } },
        { type: 'socks', tag: 'missing-resolver', server: 'socks.example.com', server_port: 1080, domain_resolver: 'source-dns' },
        { type: 'shadowsocks', tag: 'none-without-password', server: '1.0.0.1', server_port: 8388, method: 'none', password: '' },
        { type: 'hysteria2', tag: 'empty-auth-is-valid', server: 'hy2.example.com', server_port: 443, tls: { enabled: true } }
      ]
    }));
    const results = adaptNodesToSingBox(nodes);

    expect(results.slice(0, 5).every(result => result.fatal)).toBe(true);
    expect(results[0]?.unsupportedParams).toContain('password');
    expect(results[1]?.unsupportedParams).toContain('uuid');
    expect(results[2]?.unsupportedParams).toContain('tls.enabled');
    expect(results[3]?.unsupportedParams).toContain('tcp_fast_open');
    expect(results[4]?.unsupportedParams).toContain('domain_resolver');
    expect(results[5]).toMatchObject({ fatal: false, emitted: true });
    expect(results[6]).toMatchObject({ fatal: false, emitted: true });
  });

  test('all emitted protocol outbounds pass official sing-box check together', async () => {
    const structuredScalars = await parseContent(`
proxies:
  - name: Structured SS
    type: ss
    server: 1.0.0.1
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: 123456
  - name: Structured Trojan
    type: trojan
    server: trojan-structured.example.com
    port: 443
    password: 123456
    network: ws
    ws-opts:
      path: 123
  - name: Structured HTTP
    type: vmess
    server: vmess-http.example.com
    port: 443
    uuid: ${UUID_B}
    cipher: auto
    network: http
    http-opts:
      path: /http
      headers:
        Host: cdn.example.com
      idle-timeout: 1m30s
`);
    const nativeSsh = await parseContent(JSON.stringify({
      outbounds: [{
        type: 'ssh', tag: 'Native SSH', server: 'ssh.example.com', password: 'secret'
      }]
    }));
    const nodes: NodeEnvelope[] = [
      required(parseShadowsocks(
        'ss://' + btoa('chacha20-ietf-poly1305:secret') + '@1.1.1.1:8388#SS'
      )),
      required(parseVmess('vmess://' + btoa(JSON.stringify({
        v: '2', ps: 'VMess', add: 'vmess.example.com', port: 443,
        id: UUID_A, aid: 0, scy: 'auto', net: 'ws', path: '/ws', tls: 'tls'
      })))),
      required(parseVless(
        `vless://${UUID_B}@vless.example.com:443?security=tls&type=grpc&serviceName=grpc#VLESS`
      )),
      required(parseVless(
        `vless://${UUID_A}@reality.example.com:443?security=reality&pbk=${REALITY_PUBLIC_KEY}&sid=00aa#Reality`
      )),
      required(parseTrojan('trojan://password@trojan.example.com:443?type=ws&path=%2Fws#Trojan')),
      required(parseHysteria2(
        'hysteria2://password@hy2.example.com:443?ports=20000-30000,31000'
        + '&hop-interval=30&obfs=salamander&obfs-password=secret#HY2'
      )),
      required(parseAnyTLS('anytls://password@any.example.com:443#AnyTLS')),
      required(parseTuic(`tuic://${UUID_A}@tuic.example.com:443#TUIC`)),
      ...structuredScalars,
      ...nativeSsh
    ];
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-protocols-'));
    const configPath = join(workDir, 'config.json');

    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );

      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);

      const runResult = spawnSync(
        singBoxBin,
        ['run', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8', timeout: 2_000 }
      );
      const output = `${runResult.stdout}${runResult.stderr}`;
      expect(runResult.error?.message).toContain('ETIMEDOUT');
      expect(output).toContain('sing-box started');
      expect(output).not.toContain('FATAL');
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
