import { describe, expect, test } from 'bun:test';
import { adaptNodeToTarget, CANONICAL_TARGETS, normalizeTarget } from '../src/adapters/target';
import { parseSingleNode } from '../src/parser';

const VLESS_GRPC_URI =
  'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=grpc&security=tls&serviceName=test-service#VLESS%20gRPC';
const VLESS_KCP_URI =
  'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=kcp&security=tls#VLESS%20KCP';
const SSR_URI =
  'ssr://' + Buffer.from('1.2.3.4:8388:origin:aes-128-cfb:plain:bXlwYXNz/?remarks=U1NSX05vZGU').toString('base64');

describe('target-aware compatibility adapter', () => {
  test('normalizes canonical targets and supported aliases', () => {
    expect(CANONICAL_TARGETS).toEqual([
      'mihomo',
      'singbox',
      'shadowrocket',
      'base64',
      'shadowrocket-conf',
      'raw',
      'surge'
    ]);
    expect(normalizeTarget('clash')).toBe('mihomo');
    expect(normalizeTarget(' META ')).toBe('mihomo');
    expect(normalizeTarget('sing-box')).toBe('singbox');
    expect(normalizeTarget('rocket')).toBe('shadowrocket');
    expect(normalizeTarget('surge')).toBe('surge');
  });

  test('leaves auto to the caller and rejects unknown values', () => {
    expect(normalizeTarget('auto')).toBeNull();
    expect(normalizeTarget('unknown-client')).toBeNull();
    expect(normalizeTarget(undefined)).toBeNull();
  });

  test('emits VLESS gRPC for Mihomo but rejects it for Surge', () => {
    const node = parseSingleNode(VLESS_GRPC_URI)!;

    const mihomo = adaptNodeToTarget(node, 'mihomo');
    expect(mihomo.emitted).toBe(true);
    expect(mihomo.fatal).toBe(false);

    const surge = adaptNodeToTarget(node, 'surge');
    expect(surge.emitted).toBe(false);
    expect(surge.fatal).toBe(true);
    expect(surge.skipReason).toContain('vless');
  });

  test('rejects VLESS KCP for Mihomo while preserving its source URI for raw output', () => {
    const node = parseSingleNode(VLESS_KCP_URI)!;

    const mihomo = adaptNodeToTarget(node, 'mihomo');
    expect(mihomo.emitted).toBe(false);
    expect(mihomo.fatal).toBe(true);

    const raw = adaptNodeToTarget(node, 'raw');
    expect(raw.emitted).toBe(true);
    expect(raw.fatal).toBe(false);
    expect(raw.lossy).toBe(false);
    expect(raw.warnings).toEqual([]);

    const shadowrocket = adaptNodeToTarget(node, 'shadowrocket');
    expect(shadowrocket.emitted).toBe(true);
    expect(shadowrocket.fatal).toBe(false);
    expect(shadowrocket.lossy).toBe(true);
    expect(shadowrocket.warnings[0]?.field).toBe('client-compatibility-unverified');
  });

  test('rejects SSR for Sing-box and Shadowrocket config output', () => {
    const node = parseSingleNode(SSR_URI)!;

    for (const target of ['singbox', 'shadowrocket-conf'] as const) {
      const result = adaptNodeToTarget(node, target);
      expect(result.emitted).toBe(false);
      expect(result.fatal).toBe(true);
      expect(result.skipReason).toContain('ssr');
    }
  });

  test('keeps target support decisions explicit across every canonical target', () => {
    const node = parseSingleNode(SSR_URI)!;
    const expected: Record<(typeof CANONICAL_TARGETS)[number], boolean> = {
      mihomo: true,
      singbox: false,
      shadowrocket: true,
      base64: true,
      'shadowrocket-conf': false,
      raw: true,
      surge: false
    };

    for (const target of CANONICAL_TARGETS) {
      expect(adaptNodeToTarget(node, target).emitted).toBe(expected[target]);
    }
  });

  test('warns when a structured source must be rebuilt as a raw link', () => {
    const vmessUri = 'vmess://' + Buffer.from(JSON.stringify({
      v: '2',
      ps: 'Structured VMess',
      add: 'vmess.example.com',
      port: 443,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
      aid: 0,
      net: 'ws',
      path: '/ws',
      tls: 'tls'
    })).toString('base64');
    const node = parseSingleNode(vmessUri)!;

    const result = adaptNodeToTarget(node, 'base64');
    expect(node.source.format).toBe('vmess-json');
    expect(result.emitted).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.lossy).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('warns for supported non-native Sing-box conversion', () => {
    const node = parseSingleNode(VLESS_GRPC_URI)!;
    const result = adaptNodeToTarget(node, 'singbox');

    expect(result.emitted).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.lossy).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('turns an unsupported raw serializer protocol into a fatal result', () => {
    const node = {
      name: 'Unsupported WireGuard',
      protocol: 'wireguard',
      server: '1.2.3.4',
      port: 51820,
      source: { format: 'clash', raw: '' },
      protocolData: {}
    } as any;

    const result = adaptNodeToTarget(node, 'raw');
    expect(result.emitted).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.skipReason).toContain('wireguard');
  });
});
