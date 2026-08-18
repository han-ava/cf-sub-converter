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
    expect(res.skipReason).toContain('传输层协议');
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

  // ── P0-1: XHTTP extra whitelist gate ──────────────────────────────────────

  test('9. VLESS XHTTP with critical unmappable extra field triggers fatal (P0-1)', () => {
    const xhttpCritical = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=tls&sni=cdn.example.com' +
      '&extra=%7B%22downloadSettings%22%3A%7B%22type%22%3A%22splithttp%22%7D%7D' +
      '#XHTTP%20Critical%20Extra'
    );
    expect(xhttpCritical).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpCritical!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.skipReason).toContain('downloadSettings');
  });

  test('10. VLESS XHTTP with only whitelisted extra fields emits successfully (P0-1)', () => {
    const xhttpSafe = parseSingleNode(
      'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443' +
      '?type=xhttp&security=reality' +
      '&pbk=abcdefghijklmnopqrstuvwxyz012345&sni=cdn.example.com' +
      '&extra=%7B%22x-padding-bytes%22%3A%22100-1000%22%7D' +
      '#XHTTP%20Safe%20Extra'
    );
    expect(xhttpSafe).not.toBeNull();
    const res = adaptNodeToMihomo(xhttpSafe!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
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

  // ── P0-3: mKCP / MeKya pass-through ──────────────────────────────────────

  test('13. VMess mKCP passes Compatibility Gate and emits network: mkcp (P0-3)', () => {
    const mkcpVmess = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'Japan mKCP', add: '1.2.3.4', port: 12345,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a', aid: 0,
      net: 'mkcp', type: 'none', tls: ''
    })).toString('base64');
    const node = parseSingleNode(mkcpVmess);
    expect(node).not.toBeNull();
    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.config!.network).toBe('mkcp');
  });

  test('14. VMess MeKya passes Compatibility Gate (P0-3)', () => {
    const mekyaVmess = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2', ps: 'Singapore MeKya', add: '1.2.3.4', port: 9999,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a', aid: 0,
      net: 'mekya', type: 'none', tls: ''
    })).toString('base64');
    const node = parseSingleNode(mekyaVmess);
    expect(node).not.toBeNull();
    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.config!.network).toBe('mekya');
  });
});
