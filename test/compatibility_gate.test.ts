// test/compatibility_gate.test.ts
import { describe, expect, test } from 'bun:test';
import { parseSingleNode } from '../src/parser';
import { adaptNodeToMihomo } from '../src/adapters/mihomo';
import { toClashMeta } from '../src/generator';
import { FIXTURES } from './fixtures/nodes';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

describe('Tower-Inspired Compatibility Gate Suite', () => {
  test('1. Valid VLESS Reality node passes Compatibility Gate (perfect/warning, emitted=true)', () => {
    const node = parseSingleNode(FIXTURES.vless_reality);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.config).toBeDefined();
    expect(res.skipReason).toBeUndefined();
  });

  test('2. VLESS Reality missing pbk triggers fatal and emitted=false', () => {
    const invalidRealityUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=yahoo.com&fp=chrome#Broken%20Reality';
    const node = parseSingleNode(invalidRealityUri);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.config).toBeUndefined();
    expect(res.skipReason).toContain('pbk');
  });

  test('3. VLESS with unsupported transport (e.g. kcp) triggers fatal and emitted=false', () => {
    const kcpVlessUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=kcp&security=tls#KCP%20VLESS';
    const node = parseSingleNode(kcpVlessUri);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.skipReason).toContain('传输协议');
  });

  test('4. SS2022 with invalid key length triggers fatal and strictBase64 error', () => {
    // 8 bytes base64 (not 16 bytes for aes-128-gcm)
    const badKey = Buffer.from('12345678').toString('base64');
    const badSS2022Uri = `ss://${Buffer.from(`2022-blake3-aes-128-gcm:${badKey}`).toString('base64')}@1.2.3.4:8388#Bad%20Key%20SS2022`;
    const node = parseSingleNode(badSS2022Uri);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.skipReason).toContain('16 字节');
  });

  test('5. AnyTLS + Reality combo triggers fatal and skipReason', () => {
    const anytlsRealityUri = 'anytls://mypassword@1.2.3.4:8443?sni=example.com&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY&reality=1#Incompatible%20AnyTLS';
    const node = parseSingleNode(anytlsRealityUri);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.skipReason).toContain('不支持 AnyTLS 与 Reality');
  });

  test('6. VMess with unsupported transport triggers fatal', () => {
    const vmessBadNet = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2',
      ps: 'VMess Bad Net',
      add: '1.2.3.4',
      port: 443,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
      aid: 0,
      net: 'quic-unknown'
    })).toString('base64');

    const node = parseSingleNode(vmessBadNet);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.skipReason).toContain('传输协议');
  });

  test('7. toClashMeta excludes fatal nodes and only populates emitted proxies in proxy-groups', () => {
    const healthyNode = parseSingleNode(FIXTURES.vless_reality)!;
    const fatalNode = parseSingleNode('vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=kcp&security=tls#Fatal%20Node')!;

    const yamlStr = toClashMeta([healthyNode, fatalNode], undefined, 'minimal');
    const doc: any = yaml.load(yamlStr);

    expect(doc.proxies.length).toBe(1);
    expect(doc.proxies[0].name).toBe('香港 VLESS Reality');

    // Proxy groups only reference healthy node name
    const selectGroup = doc['proxy-groups'].find((g: any) => g.name === '🚀 节点选择');
    expect(selectGroup).toBeDefined();
    expect(selectGroup.proxies).toContain('香港 VLESS Reality');
    expect(selectGroup.proxies).not.toContain('Fatal Node');
  });

  test('8. Full generated config with fatal nodes filtered passes mihomo -t -f', () => {
    const nodes = [
      parseSingleNode(FIXTURES.vless_reality)!,
      parseSingleNode('vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=kcp#Bad%20Node')!,
      parseSingleNode(FIXTURES.ss_ss2022)!,
      parseSingleNode(FIXTURES.hy2_full)!,
      parseSingleNode(FIXTURES.anytls_standard)!
    ];

    const fullConfigYaml = toClashMeta(nodes, undefined, 'standard');
    const tempConfigPath = `/tmp/test_gate_mihomo_${Date.now()}.yaml`;

    try {
      writeFileSync(tempConfigPath, fullConfigYaml, 'utf-8');
      const proc = spawnSync('mihomo', ['-t', '-f', tempConfigPath], {
        encoding: 'utf-8'
      });

      console.log('Compatibility Gate Mihomo output:', proc.stdout || proc.stderr);
      expect(proc.status).toBe(0);
      expect((proc.stdout || proc.stderr).toLowerCase()).toContain('successful');
    } finally {
      try {
        unlinkSync(tempConfigPath);
      } catch {}
    }
  });

  // ── P0-1: XHTTP extra 展平到 xhttp-opts 顶层与递归映射 ───────────────────

  test('9. VLESS XHTTP: downloadSettings and reuseSettings recursive mapping (P0-1)', () => {
    const xhttpComplexExtra = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        reuseSettings: {
          maxConcurrency: 16,
          maxConnections: 4,
          cMaxReuseTimes: 100,
          hMaxRequestTimes: 50,
          hMaxReusableSecs: 30,
          hKeepAlivePeriod: 15
        },
        downloadSettings: {
          address: 'download.example.com',
          port: 8443,
          noGRPCHeader: true,
          xPaddingBytes: '10-20',
          tlsSettings: {
            serverName: 'dl.example.com',
            alpn: ['h2'],
            insecure: true,
            realitySettings: {
              publicKey: 'pubkey123',
              shortId: 'sid123'
            }
          },
          reuseSettings: {
            maxConcurrency: 8
          }
        }
      })) +
      '#XHTTP%20Complex%20Settings'
    );
    expect(xhttpComplexExtra).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpComplexExtra!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    const xhttpOpts = res.config!['xhttp-opts'] as Record<string, any>;
    expect(xhttpOpts).toBeDefined();

    // 验证 reuse-settings 递归映射
    expect(xhttpOpts['reuse-settings']).toEqual({
      'max-concurrency': 16,
      'max-connections': 4,
      'c-max-reuse-times': 100,
      'h-max-request-times': 50,
      'h-max-reusable-secs': 30,
      'h-keep-alive-period': 15
    });

    // 验证 download-settings 递归映射
    expect(xhttpOpts['download-settings']).toBeDefined();
    expect(xhttpOpts['download-settings'].address).toBe('download.example.com');
    expect(xhttpOpts['download-settings'].port).toBe(8443);
    expect(xhttpOpts['download-settings']['no-grpc-header']).toBe(true);
    expect(xhttpOpts['download-settings']['x-padding-bytes']).toBe('10-20');
    expect(xhttpOpts['download-settings']['tls-settings']).toEqual({
      'server-name': 'dl.example.com',
      'alpn': ['h2'],
      'insecure': true,
      'reality-settings': {
        'public-key': 'pubkey123',
        'short-id': 'sid123'
      }
    });
    expect(xhttpOpts['download-settings']['reuse-settings']).toEqual({
      'max-concurrency': 8
    });
    expect(xhttpOpts['extra']).toBeUndefined();
  });

  test('10. VLESS XHTTP: x-padding-bytes mapped flat to xhttp-opts, no extra sub-layer (P0-1)', () => {
    const xhttpSafe = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=reality' +
      '&pbk=abcdefghijklmnopqrstuvwxyz012345&sni=cdn.example.com' +
      '&extra=%7B%22x-padding-bytes%22%3A%22100-1000%22%7D' +
      '#XHTTP%20Padding'
    );
    expect(xhttpSafe).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpSafe!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    const xhttpOpts = res.config!['xhttp-opts'] as Record<string, any>;
    expect(xhttpOpts).toBeDefined();
    // 关键断言：直接在顶层，不在 extra 子层
    expect(xhttpOpts['x-padding-bytes']).toBe('100-1000');
    expect(xhttpOpts['extra']).toBeUndefined();
  });

  test('10b. VLESS XHTTP: session-placement (camelCase) mapped to session-placement (P0-1)', () => {
    const xhttpSession = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=%7B%22sessionPlacement%22%3A%22path%22%7D' +
      '#XHTTP%20Session%20Placement'
    );
    expect(xhttpSession).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpSession!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    const xhttpOpts = res.config!['xhttp-opts'] as Record<string, any>;
    expect(xhttpOpts['session-placement']).toBe('path');
    expect(xhttpOpts['extra']).toBeUndefined();
  });

  test('10c. VLESS XHTTP: unknown extra fields are NOT silently dropped (recorded as lossy & warnings) (P0-2)', () => {
    const xhttpUnknownExtra = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=%7B%22someUnknownField%22%3A%22customVal%22%7D' +
      '#XHTTP%20Unknown%20Extra'
    );
    expect(xhttpUnknownExtra).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpUnknownExtra!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.lossy).toBe(true);
    expect(res.unsupportedParams).toContain('xhttp-opts.extra.someUnknownField');
    expect(res.warnings.some(w => w.field === 'xhttp-opts.extra.someUnknownField')).toBe(true);
  });

  // ── P0-3: splithttp → normalize to xhttp ─────────────────────────────────

  test('10d. VLESS splithttp normalized to network: xhttp (P0-3)', () => {
    const splitNode = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=splithttp&security=tls&sni=cdn.example.com&path=%2Fpath' +
      '#SplitHTTP%20Node'
    );
    expect(splitNode).not.toBeNull();
    const res = adaptNodeToMihomo(splitNode!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    // Must be 'xhttp', never 'splithttp'
    expect(res.config!.network).toBe('xhttp');
    expect(res.config!['xhttp-opts']).toBeDefined();
  });

  // ── P0-2: HTTP vs H2 strict split ─────────────────────────────────────────

  test('11. VLESS H2 maps to h2-opts (not http-opts) (P0-2)', () => {
    const h2Node = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@cdn.example.com:443' +
      '?type=h2&security=tls&sni=cdn.example.com&path=%2Fh2path' +
      '#H2%20Node'
    );
    expect(h2Node).not.toBeNull();
    const res = adaptNodeToMihomo(h2Node!);
    expect(res.emitted).toBe(true);
    expect(res.config!['h2-opts']).toBeDefined();
    expect(res.config!['http-opts']).toBeUndefined();
    expect(res.config!['h2-opts'].path).toBe('/h2path');
  });

  test('12. VLESS HTTP maps to http-opts (not h2-opts) (P0-2)', () => {
    const httpNode = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@cdn.example.com:443' +
      '?type=http&security=tls&sni=cdn.example.com&path=%2Fapi' +
      '#HTTP%20Node'
    );
    expect(httpNode).not.toBeNull();
    const res = adaptNodeToMihomo(httpNode!);
    expect(res.emitted).toBe(true);
    expect(res.config!['http-opts']).toBeDefined();
    expect(res.config!['h2-opts']).toBeUndefined();
  });

  // ── P0-4: VMess mKCP full parameters ──────────────────────────────────────

  test('13. VMess mKCP: full options (mtu, tti, write-buffer, read-buffer, capacities, headerType) (P0-4)', () => {
    const mkcpVmess = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'HK mKCP Full', add: '1.2.3.4', port: 12345,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a', aid: 0,
      net: 'mkcp', type: 'wechat-video', tls: '',
      seed: 'my-kcp-seed',
      mtu: 1350,
      tti: 50,
      'uplink-capacity': 100,
      'downlink-capacity': 200,
      congestion: true,
      'write-buffer': 2,
      'read-buffer': 2
    })).toString('base64');
    const node = parseSingleNode(mkcpVmess);
    expect(node).not.toBeNull();
    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.config!.network).toBe('mkcp');

    const mkcpOpts = res.config!['mkcp-opts'] as Record<string, any>;
    expect(mkcpOpts).toBeDefined();
    expect(mkcpOpts.mtu).toBe(1350);
    expect(mkcpOpts.tti).toBe(50);
    expect(mkcpOpts['uplink-capacity']).toBe(100);
    expect(mkcpOpts['downlink-capacity']).toBe(200);
    expect(mkcpOpts.congestion).toBe(true);
    expect(mkcpOpts['write-buffer']).toBe(2);
    expect(mkcpOpts['read-buffer']).toBe(2);
    expect(mkcpOpts.seed).toBe('my-kcp-seed');
    expect(mkcpOpts.header?.type).toBe('wechat-video');
  });

  test('13b. VMess kcp normalized to mkcp network (P0-4)', () => {
    const kcpVmess = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'JP KCP', add: '1.2.3.4', port: 9999,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a', aid: 0,
      net: 'kcp', type: 'dtls', tls: '', seed: 'my-seed'
    })).toString('base64');
    const node = parseSingleNode(kcpVmess);
    expect(node).not.toBeNull();
    const res = adaptNodeToMihomo(node!);
    expect(res.emitted).toBe(true);
    expect(res.config!.network).toBe('mkcp');
    const mkcpOpts = res.config!['mkcp-opts'] as Record<string, any>;
    expect(mkcpOpts.seed).toBe('my-seed');
    expect(mkcpOpts.header?.type).toBe('dtls');
  });

  // ── P0-5: MeKya full official structure ───────────────────────────────────

  test('14. VMess MeKya: full official mekya-opts fields and kcp sub-object (P0-5)', () => {
    const mekyaVmess = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'SG MeKya Full', add: '1.2.3.4', port: 9999,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a', aid: 0,
      net: 'mekya', type: 'wechat-video', tls: '',
      seed: 'mekya-seed',
      url: 'https://mekya.example.com/stream',
      'max-write-delay': 500,
      'max-request-size': 65536,
      'polling-interval-initial': 1000,
      'h2-pool-size': 4
    })).toString('base64');
    const node = parseSingleNode(mekyaVmess);
    expect(node).not.toBeNull();
    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.config!.network).toBe('mekya');

    const mekyaOpts = res.config!['mekya-opts'] as Record<string, any>;
    expect(mekyaOpts).toBeDefined();
    expect(mekyaOpts.url).toBe('https://mekya.example.com/stream');
    expect(mekyaOpts['max-write-delay']).toBe(500);
    expect(mekyaOpts['max-request-size']).toBe(65536);
    expect(mekyaOpts['polling-interval-initial']).toBe(1000);
    expect(mekyaOpts['h2-pool-size']).toBe(4);
    expect(mekyaOpts.kcp).toBeDefined();
    expect(mekyaOpts.kcp.seed).toBe('mekya-seed');
    expect(mekyaOpts.kcp.header?.type).toBe('wechat-video');
    expect(mekyaOpts.seed).toBeUndefined();
    expect(mekyaOpts.header).toBeUndefined();
  });

  // ── P1: TLS=false should NOT emit servername / TLS options ────────────────

  test('15. VLESS and VMess when TLS=false do NOT emit servername or TLS options (P1)', () => {
    const plainVless = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:80?type=ws&path=%2F#Plain%20VLESS'
    );
    expect(plainVless).not.toBeNull();
    const resVless = adaptNodeToMihomo(plainVless!);
    expect(resVless.emitted).toBe(true);
    expect(resVless.config!.tls).toBeUndefined();
    expect(resVless.config!.servername).toBeUndefined();
    expect(resVless.config!['client-fingerprint']).toBeUndefined();
    expect(resVless.config!['skip-cert-verify']).toBeUndefined();
    expect(resVless.config!['reality-opts']).toBeUndefined();

    const plainVmess = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'Plain VMess', add: '1.2.3.4', port: 80,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a', aid: 0,
      net: 'ws', type: 'none', tls: ''
    })).toString('base64');
    const nodeVmess = parseSingleNode(plainVmess);
    expect(nodeVmess).not.toBeNull();
    const resVmess = adaptNodeToMihomo(nodeVmess!);
    expect(resVmess.emitted).toBe(true);
    expect(resVmess.config!.tls).toBeUndefined();
    expect(resVmess.config!.servername).toBeUndefined();
    expect(resVmess.config!['client-fingerprint']).toBeUndefined();
    expect(resVmess.config!['skip-cert-verify']).toBeUndefined();
  });
});
