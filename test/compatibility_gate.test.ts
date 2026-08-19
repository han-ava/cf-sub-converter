// test/compatibility_gate.test.ts
import { describe, expect, test } from 'bun:test';
import { parseSingleNode } from '../src/parser';
import { adaptNodeToMihomo } from '../src/adapters/mihomo';
import { toClashMeta } from '../src/generator';
import { FIXTURES } from './fixtures/nodes';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';
import app from '../src/index';

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

  // ── P0-1: XHTTP extra Xray 真实结构转换与 downloadSettings 语义转换 ─────────

  test('9. VLESS XHTTP: Xray real downloadSettings & xmux streamSettings conversion (P0-1/2)', () => {
    const xrayGoldenNode = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        xmux: {
          maxConcurrency: '16-32'
        },
        downloadSettings: {
          address: '1.2.3.4',
          port: 443,
          network: 'xhttp',
          security: 'tls',
          tlsSettings: {
            serverName: 'example.com',
            fingerprint: 'chrome'
          },
          xhttpSettings: {
            path: '/down',
            host: 'example.com'
          }
        }
      })) +
      '#XHTTP%20Xray%20Golden'
    );
    expect(xrayGoldenNode).not.toBeNull();
    const res = adaptNodeToMihomo(xrayGoldenNode!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    const xhttpOpts = res.config!['xhttp-opts'] as Record<string, any>;
    expect(xhttpOpts).toBeDefined();

    // 关键断言：xmux 映射为 reuse-settings
    expect(xhttpOpts['reuse-settings']).toEqual({
      'max-concurrency': '16-32'
    });

    // 关键断言：downloadSettings 语义转换为 Mihomo 官方扁平结构
    expect(xhttpOpts['download-settings']).toEqual({
      server: '1.2.3.4',
      port: 443,
      tls: true,
      servername: 'example.com',
      'client-fingerprint': 'chrome',
      path: '/down',
      host: 'example.com'
    });

    // 禁止出现 Xray 原始嵌套键
    expect(xhttpOpts['download-settings'].address).toBeUndefined();
    expect(xhttpOpts['download-settings'].network).toBeUndefined();
    expect(xhttpOpts['download-settings']['tls-settings']).toBeUndefined();
    expect(xhttpOpts['download-settings'].tlsSettings).toBeUndefined();
    expect(xhttpOpts['download-settings']['xhttp-settings']).toBeUndefined();
    expect(xhttpOpts['download-settings'].xhttpSettings).toBeUndefined();
    expect(xhttpOpts['extra']).toBeUndefined();
  });

  test('9b. VLESS XHTTP: downloadSettings with Reality and nested xmux (P0-1/2)', () => {
    const xhttpRealityDownload = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        downloadSettings: {
          address: 'download.example.com',
          port: 8443,
          security: 'reality',
          tlsSettings: {
            serverName: 'dl.example.com',
            alpn: ['h2'],
            allowInsecure: true,
            realitySettings: {
              publicKey: 'pubkey123',
              shortId: 'sid123',
              spiderX: '/spx'
            }
          },
          xhttpSettings: {
            path: '/dl-stream',
            noGRPCHeader: true,
            xPaddingBytes: '10-20',
            extra: {
              xmux: {
                maxConcurrency: 8
              }
            }
          }
        }
      })) +
      '#XHTTP%20Reality%20Download'
    );
    expect(xhttpRealityDownload).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpRealityDownload!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    const xhttpOpts = res.config!['xhttp-opts'] as Record<string, any>;
    expect(xhttpOpts).toBeDefined();

    expect(xhttpOpts['download-settings']).toEqual({
      server: 'download.example.com',
      port: 8443,
      tls: true,
      servername: 'dl.example.com',
      alpn: ['h2'],
      'skip-cert-verify': true,
      'reality-opts': {
        'public-key': 'pubkey123',
        'short-id': 'sid123',
        'spider-x': '/spx'
      },
      path: '/dl-stream',
      'no-grpc-header': true,
      'x-padding-bytes': '10-20',
      'reuse-settings': {
        'max-concurrency': 8
      }
    });
  });

  test('9c. VLESS XHTTP: Reality uplink -> TLS/none downlink isolates reality-opts (P0-1A)', () => {
    // 节点主连接是 Reality，但 downloadSettings 声明 security: tls
    const realityToTlsNode = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=reality&pbk=abcdefghijklmnopqrstuvwxyz012345&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        downloadSettings: {
          address: 'dl.example.com',
          port: 443,
          security: 'tls',
          tlsSettings: {
            serverName: 'dl.example.com'
          }
        }
      })) +
      '#Reality%20to%20TLS'
    );
    expect(realityToTlsNode).not.toBeNull();
    const res = adaptNodeToMihomo(realityToTlsNode!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    // 主连接有 reality-opts
    expect(res.config!['reality-opts']).toBeDefined();
    // download-settings 必须显式没有 reality-opts
    const dlSettings = res.config!['xhttp-opts']['download-settings'];
    expect(dlSettings).toBeDefined();
    expect(dlSettings.tls).toBe(true);
    expect(dlSettings['reality-opts']).toBeUndefined();
  });

  test('9d. VLESS XHTTP: downloadSettings with unsupported transport (e.g. grpc) triggers fatal (P0-1C)', () => {
    const badTransportDlNode = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        downloadSettings: {
          address: 'dl.example.com',
          port: 443,
          network: 'grpc'
        }
      })) +
      '#Bad%20Transport%20Download'
    );
    expect(badTransportDlNode).not.toBeNull();
    const res = adaptNodeToMihomo(badTransportDlNode!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.skipReason).toContain('独立下行传输协议');
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

  test('10b. VLESS XHTTP: Xray sessionID* and uplinkHTTPMethod mapped correctly (P0-1)', () => {
    const xhttpXrayFields = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        sessionIDPlacement: 'path',
        sessionIDKey: 'skey',
        sessionIDTable: 'stable',
        sessionIDLength: 16,
        uplinkHTTPMethod: 'POST'
      })) +
      '#XHTTP%20Xray%20Fields'
    );
    expect(xhttpXrayFields).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpXrayFields!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    const xhttpOpts = res.config!['xhttp-opts'] as Record<string, any>;
    expect(xhttpOpts['session-placement']).toBe('path');
    expect(xhttpOpts['session-key']).toBe('skey');
    expect(xhttpOpts['session-table']).toBe('stable');
    expect(xhttpOpts['session-length']).toBe(16);
    expect(xhttpOpts['uplink-http-method']).toBe('POST');
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

  test('10e. VLESS XHTTP: unknown field in downloadSettings.xhttpSettings.extra is NOT silently dropped (P0-1B)', () => {
    const xhttpDlExtraUnknown = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=' + encodeURIComponent(JSON.stringify({
        downloadSettings: {
          address: 'dl.example.com',
          port: 443,
          xhttpSettings: {
            path: '/dl',
            extra: {
              unknownDlSettingKey: 'val'
            }
          }
        }
      })) +
      '#XHTTP%20DL%20Extra%20Unknown'
    );
    expect(xhttpDlExtraUnknown).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpDlExtraUnknown!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.lossy).toBe(true);
    expect(res.unsupportedParams).toContain('xhttp-opts.download-settings.xhttpSettings.extra.unknownDlSettingKey');
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
      mtu: 1400,
      tti: 20,
      'uplink-capacity': 50,
      'downlink-capacity': 100,
      congestion: true,
      'write-buffer': 4,
      'read-buffer': 4,
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
    expect(mekyaOpts.kcp.mtu).toBe(1400);
    expect(mekyaOpts.kcp.tti).toBe(20);
    expect(mekyaOpts.kcp['uplink-capacity']).toBe(50);
    expect(mekyaOpts.kcp['downlink-capacity']).toBe(100);
    expect(mekyaOpts.kcp.congestion).toBe(true);
    expect(mekyaOpts.kcp['write-buffer']).toBe(4);
    expect(mekyaOpts.kcp['read-buffer']).toBe(4);
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
    expect(resVmess.config!.tls).toBeUndefined();
    expect(resVmess.config!.servername).toBeUndefined();
    expect(resVmess.config!['client-fingerprint']).toBeUndefined();
    expect(resVmess.config!['skip-cert-verify']).toBeUndefined();
  });

  // ── 自动检测 known-but-unmapped ──────────────────────────────────────────

  test('16. Automated detection flags known-but-unmapped parsed fields without silent drop', () => {
    // 构造一个在 protocolData 中存在未建模字段的节点
    const customVlessNode: any = {
      name: 'Custom VLESS',
      protocol: 'vless',
      server: '1.2.3.4',
      port: 443,
      source: { format: 'vless-uri', raw: 'vless://...' },
      protocolData: {
        uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
        security: 'tls',
        unmodeledFieldFoo: 'bar', // 未在 HANDLED_VLESS_PROTOCOL_KEYS 建模
        extras: {}
      },
      udp: true
    };
    const res = adaptNodeToMihomo(customVlessNode);
    expect(res.emitted).toBe(true);
    expect(res.lossy).toBe(true);
    expect(res.unsupportedParams).toContain('unmodeledFieldFoo');
    expect(res.warnings.some(w => w.field === 'unmodeledFieldFoo' && w.message.includes('known-but-unmapped'))).toBe(true);
  });

  // ── Warning Inspector 聚合诊断接口测试 ────────────────────────────────────

  test('17. /api/preview returns warningAggregations with counts sorted descending', async () => {
    const rawNodesStr = [
      // 2 个包含 x-padding-bytes 未知 extra 的 VLESS 节点
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.1.1.1:443?type=xhttp&security=tls&sni=a.com&extra=%7B%22customExtraA%22%3A1%7D#Node1',
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.1.1.2:443?type=xhttp&security=tls&sni=a.com&extra=%7B%22customExtraA%22%3A2%7D#Node2',
      // 1 个包含 customExtraB 的 VLESS 节点
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.1.1.3:443?type=xhttp&security=tls&sni=a.com&extra=%7B%22customExtraB%22%3A3%7D#Node3',
      // 1 个完美的 Hysteria 2 节点
      FIXTURES.hysteria2
    ].join('\n');

    const req = new Request('http://localhost/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rawNodesStr, token: 'test-secret-token' })
    });

    const env = { AUTH_TOKEN: 'test-secret-token' };
    const res = await app.fetch(req, env as any, {} as any);
    expect(res.status).toBe(200);

    const json: any = await res.json();
    expect(json.ok).toBe(true);
    expect(json.warningCount).toBe(3);
    expect(json.warningAggregations).toBeDefined();
    expect(Array.isArray(json.warningAggregations)).toBe(true);

    // 验证聚合与排序：customExtraA (2 个节点) 排在 customExtraB (1 个节点) 前面
    const aggA = json.warningAggregations.find((a: any) => a.param.includes('customExtraA'));
    const aggB = json.warningAggregations.find((a: any) => a.param.includes('customExtraB'));
    expect(aggA).toBeDefined();
    expect(aggA.count).toBe(2);
    expect(aggA.protocol).toBe('VLESS');
    expect(aggB).toBeDefined();
    expect(aggB.count).toBe(1);
    expect(json.warningAggregations[0].count).toBeGreaterThanOrEqual(json.warningAggregations[1].count);
  });

  // ── HY2 pinSHA256 官方证书指纹映射测试 ─────────────────────────────────────

  test('18. Hysteria 2 pinSHA256 maps cleanly to Mihomo fingerprint (perfect, no warnings, no client-fingerprint)', () => {
    const hy2PinUri = 'hysteria2://my_pass_123@hy2.example.com:443?sni=hy2.example.com&pinSHA256=f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f#HY2%20PinSHA256';
    const node = parseSingleNode(hy2PinUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.certificateFingerprint).toBe('f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.warnings.length).toBe(0);
    expect(res.unsupportedParams.length).toBe(0);
    expect(res.config!.fingerprint).toBe('f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f');
    expect(res.config!['client-fingerprint']).toBeUndefined();

    // 格式化测试（带 sha256: 前缀与冒号）
    const hy2FormattedPin = 'hysteria2://my_pass_123@hy2.example.com:443?sni=hy2.example.com&pin-sha256=sha256:F4:51:AD:6B:D9:40:4F:F8:1F:DE:26:2C:C8:BD:F9:B9:DA:1E:4A:35:7E:DE:C4:C1:75:55:C6:F8:BF:1C:3E:2F#HY2%20Formatted';
    const nodeFmt = parseSingleNode(hy2FormattedPin);
    const resFmt = adaptNodeToMihomo(nodeFmt!);
    expect(resFmt.lossy).toBe(false);
    expect(resFmt.config!.fingerprint).toBe('f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f');
  });

  // ── VLESS servername 别名映射与 Host 分离测试 ──────────────────────────────

  test('19. VLESS servername alias maps to Mihomo servername (perfect, host strictly separated)', () => {
    const vlessServernameUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&servername=www.tue.nl&type=ws&host=cdn.example.com#VLESS%20Servername%20Alias';
    const node = parseSingleNode(vlessServernameUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.sni).toBe('www.tue.nl');
    expect(node!.protocolData.transport?.headers?.Host).toBe('cdn.example.com');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.warnings.length).toBe(0);
    expect(res.unsupportedParams.length).toBe(0);
    expect(res.config!.servername).toBe('www.tue.nl');
    expect(res.config!['ws-opts']).toEqual({
      path: '/',
      headers: { Host: 'cdn.example.com' }
    });

    // 验证 host 不再作为 SNI 的回退（当未配置 sni/servername 时，SNI 回退为 server 1.2.3.4）
    const vlessNoSniUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&type=ws&host=cdn.example.com#No%20SNI';
    const nodeNoSni = parseSingleNode(vlessNoSniUri);
    expect(nodeNoSni!.protocolData.sni).toBe('1.2.3.4');
    const resNoSni = adaptNodeToMihomo(nodeNoSni!);
    expect(resNoSni.config!.servername).toBe('1.2.3.4');
  });
});
