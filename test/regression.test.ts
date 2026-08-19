// test/regression.test.ts
import { describe, expect, test } from 'vitest';
import { parseContent, parseSingleNode } from '../src/parser';
import { adaptNodeToMihomo } from '../src/adapters/mihomo';
import { toClashMeta } from '../src/generator';
import { toRawLinks, toBase64 } from '../src/adapters/raw';
import { REGRESSION_FIXTURES } from './fixtures/regression';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

describe('Regression Fixtures Golden Tests', () => {
  test('1. SS2022 regression node produces valid Mihomo proxy without fatal', () => {
    const node = parseSingleNode(REGRESSION_FIXTURES.ss2022);
    expect(node).not.toBeNull();
    expect(node!.protocol).toBe('shadowsocks');
    expect(node!.protocolData.isSS2022).toBe(true);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config).toBeDefined();
    expect(res.config!.type).toBe('ss');
    expect(res.config!.cipher).toBe('2022-blake3-aes-128-gcm');
    expect(res.config!['udp-over-tcp']).toBe(true);
    expect(res.config!['udp-over-tcp-version']).toBe(2);
  });

  test('2. SS SIP002 with v2ray-plugin parses plugin and query params cleanly', () => {
    const node = parseSingleNode(REGRESSION_FIXTURES.ss_plugin);
    expect(node).not.toBeNull();
    expect(node!.protocolData.plugin).toBe('v2ray-plugin');
    expect(node!.protocolData.pluginOpts).toEqual({
      mode: 'websocket',
      host: 'cdn.domain.com',
      path: '/ws',
      tls: true
    });

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!.plugin).toBe('v2ray-plugin');
    expect(res.config!['plugin-opts']).toEqual({
      mode: 'websocket',
      host: 'cdn.domain.com',
      path: '/ws',
      tls: true
    });
  });

  test('3. VLESS Reality + Vision + xudp parses and maps to reality-opts', () => {
    const node = parseSingleNode(REGRESSION_FIXTURES.vless_reality);
    expect(node).not.toBeNull();
    expect(node!.protocol).toBe('vless');
    expect(node!.protocolData.flow).toBe('xtls-rprx-vision');
    expect(node!.protocolData.packetEncoding).toBe('xudp');
    expect(node!.protocolData.realityOpts?.publicKey).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!['reality-opts']).toBeDefined();
    expect(res.config!['reality-opts']['public-key']).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
    expect(res.config!['packet-encoding']).toBe('xudp');
  });

  test('4. VLESS XHTTP maps to xhttp-opts in Mihomo (extra non-JSON string dropped with warning)', () => {
    const node = parseSingleNode(REGRESSION_FIXTURES.vless_xhttp);
    expect(node).not.toBeNull();
    expect(node!.protocolData.transport?.type).toBe('xhttp');
    expect(node!.protocolData.transport?.path).toBe('/xhttp-path');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    // non-JSON extra string ("xhttp-extra") → warning + dropped, NOT placed in xhttp-opts
    expect(res.config!['xhttp-opts']).toEqual({
      path: '/xhttp-path',
      host: 'xhttp.example.com',
      mode: 'stream-up'
      // no extra sub-layer
    });
    // lossy=true because non-JSON extra was dropped
    expect(res.lossy).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  test('5. VMess retains original custom aid (aid=64) and packetEncoding', () => {
    const node = parseSingleNode(REGRESSION_FIXTURES.vmess_custom_aid);
    expect(node).not.toBeNull();
    expect(node!.protocolData.alterId).toBe(64);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!.alterId).toBe(64);
    expect(res.config!['packet-encoding']).toBe('packet');
    expect(res.config!['ws-opts']).toEqual({
      path: '/vmessws',
      headers: { Host: 'de.example.com' }
    });
  });

  test('6. Hysteria 2 multi-ports, salamander and gecko obfs map accurately', () => {
    // Salamander without gecko-specific packet sizes
    const node = parseSingleNode(REGRESSION_FIXTURES.hy2_provider);
    expect(node).not.toBeNull();
    expect(node!.protocolData.ports).toBe('20000-30000');
    expect(node!.protocolData.obfs).toBe('salamander');
    expect(node!.protocolData.obfsPassword).toBe('obfspass123');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!.ports).toBe('20000-30000');
    expect(res.config!.obfs).toBe('salamander');
    expect(res.config!['obfs-password']).toBe('obfspass123');
    expect(res.config!['obfs-min-packet-size']).toBeUndefined();
    expect(res.config!['obfs-max-packet-size']).toBeUndefined();

    // Gecko with packet sizes and hop-interval range
    const geckoNode = parseSingleNode(REGRESSION_FIXTURES.hy2_gecko);
    expect(geckoNode).not.toBeNull();
    expect(geckoNode!.protocolData.hopInterval).toBe('15-30');
    const geckoRes = adaptNodeToMihomo(geckoNode!);
    expect(geckoRes.fatal).toBe(false);
    expect(geckoRes.config!.obfs).toBe('gecko');
    expect(geckoRes.config!['obfs-min-packet-size']).toBe(64);
    expect(geckoRes.config!['obfs-max-packet-size']).toBe(1024);
    expect(geckoRes.config!['hop-interval']).toBe('15-30');
  });

  test('7. AnyTLS official URI spec maps cleanly without Reality', () => {
    const node = parseSingleNode(REGRESSION_FIXTURES.anytls_official);
    expect(node).not.toBeNull();
    expect(node!.protocolData.password).toBe('any_pass_999');
    expect(node!.protocolData.insecure).toBe(true);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!.type).toBe('anytls');
    expect(res.config!['skip-cert-verify']).toBe(true);
    expect(res.config!['reality-opts']).toBeUndefined();
  });

  test('8. Clash YAML with special characters password remains 100% byte-for-byte identical', async () => {
    const nodes = await parseContent(REGRESSION_FIXTURES.clash_special_pass);
    expect(nodes.length).toBe(1);

    const res = adaptNodeToMihomo(nodes[0]!);
    expect(res.config!.password).toBe('p@ss%2Fwith+symbols=456&special=true');
  });

  test('9. All regression nodes together pass mihomo -t -f validation', async () => {
    const uriNodes = [
      parseSingleNode(REGRESSION_FIXTURES.ss2022)!,
      parseSingleNode(REGRESSION_FIXTURES.ss_plugin)!,
      parseSingleNode(REGRESSION_FIXTURES.vless_reality)!,
      parseSingleNode(REGRESSION_FIXTURES.vless_xhttp)!,
      parseSingleNode(REGRESSION_FIXTURES.vmess_custom_aid)!,
      parseSingleNode(REGRESSION_FIXTURES.hy2_provider)!,
      parseSingleNode(REGRESSION_FIXTURES.anytls_official)!
    ];

    const clashNodes = await parseContent(REGRESSION_FIXTURES.clash_special_pass);
    const allNodes = [...uriNodes, ...clashNodes];

    const fullConfigYaml = toClashMeta(allNodes, undefined, 'minimal');
    const tempConfigPath = `/tmp/test_regression_mihomo_${Date.now()}.yaml`;

    try {
      writeFileSync(tempConfigPath, fullConfigYaml, 'utf-8');
      const proc = spawnSync('mihomo', ['-t', '-f', tempConfigPath], {
        encoding: 'utf-8'
      });

      console.log('Mihomo regression output:', proc.stdout || proc.stderr);
      expect(proc.status).toBe(0);
      expect((proc.stdout || proc.stderr).toLowerCase()).toContain('successful');
    } finally {
      try {
        unlinkSync(tempConfigPath);
      } catch {}
    }
  });

  test('10. RawQuery preservation for duplicate keys and parameter orders', () => {
    const complexUri = 'vless://test-uuid@1.1.1.1:443?a=1&a=2&foo=%2Fbar&x=a+b#Test%20Query%20Node';
    const node = parseSingleNode(complexUri);
    expect(node).not.toBeNull();
    expect(node!.rawQuery).toBeDefined();
    expect(node!.rawQuery!.raw).toBe('a=1&a=2&foo=%2Fbar&x=a+b');
    expect(node!.rawQuery!.entries.length).toBe(4);
    expect(node!.rawQuery!.entries[0]!.rawKey).toBe('a');
    expect(node!.rawQuery!.entries[0]!.rawValue).toBe('1');
    expect(node!.rawQuery!.entries[1]!.rawKey).toBe('a');
    expect(node!.rawQuery!.entries[1]!.rawValue).toBe('2');
    expect(node!.rawQuery!.entries[2]!.rawValue).toBe('%2Fbar');

    // toRawLinks produces exact raw URI with only # replaced
    const rawOut = toRawLinks([node!]);
    expect(rawOut).toBe(complexUri);
  });
});
