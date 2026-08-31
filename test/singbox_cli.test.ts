import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toSingBox } from '../src/generator';
import { parseContent, parseSingleNode } from '../src/parser';

const singBoxBin = process.env.SING_BOX_BIN ?? 'sing-box';

describe('Sing-box CLI validation', () => {
  test('official CLI is available', () => {
    const result = spawnSync(singBoxBin, ['version'], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sing-box version');
  });

  test('generated default config passes the official syntax check', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-check-'));
    const configPath = join(workDir, 'config.json');

    try {
      writeFileSync(configPath, toSingBox([]), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('generated Apple client config with TUN passes the official syntax check', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-tun-check-'));
    const configPath = join(workDir, 'config.json');

    try {
      writeFileSync(configPath, toSingBox([], undefined, { includeTun: true }), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('generated node tags cannot collide with built-in outbounds', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-tags-'));
    const configPath = join(workDir, 'config.json');
    const node = parseSingleNode(
      'vless://00000000-0000-4000-8000-000000000001@example.com:443?security=tls#direct'
    )!;

    try {
      const config = JSON.parse(toSingBox([node]));
      const tags = config.outbounds.map((outbound: { tag: string }) => outbound.tag);
      expect(new Set(tags).size).toBe(tags.length);
      expect(tags).toContain('direct 02');

      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('renames native outbound tags and rewrites their detour references', async () => {
    const nodes = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'socks', tag: 'direct', server: '127.0.0.1', server_port: 1080 },
        { type: 'http', tag: 'chained', server: '127.0.0.1', server_port: 8080, detour: 'direct' }
      ]
    }));
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-native-detour-'));
    const configPath = join(workDir, 'config.json');

    try {
      const config = JSON.parse(toSingBox(nodes));
      expect(config.outbounds.find((outbound: { tag: string }) => outbound.tag === 'direct 02')).toBeDefined();
      expect(config.outbounds.find((outbound: { tag: string }) => outbound.tag === 'chained')).toMatchObject({
        detour: 'direct 02'
      });

      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('does not let a cross-format node hijack the built-in direct detour', async () => {
    const crossFormat = parseSingleNode(
      'ss://' + btoa('chacha20-ietf-poly1305:secret') + '@1.1.1.1:8388#direct'
    )!;
    const native = await parseContent(JSON.stringify({
      outbounds: [{
        type: 'socks', tag: 'native-chain', server: '127.0.0.1', server_port: 1080,
        detour: 'direct'
      }]
    }));
    const config = JSON.parse(toSingBox([crossFormat, ...native]));

    expect(config.outbounds.find((outbound: { tag: string }) => outbound.tag === 'direct 02')).toMatchObject({
      type: 'shadowsocks'
    });
    expect(config.outbounds.find((outbound: { tag: string }) => outbound.tag === 'native-chain')).toMatchObject({
      detour: 'direct'
    });
  });

  test('generated routing and DNS configuration reaches a stable running state', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-run-'));
    const sourceRuleSetPath = join(workDir, 'rules.json');
    const binaryRuleSetPath = join(workDir, 'rules.srs');
    const configPath = join(workDir, 'config.json');

    try {
      writeFileSync(sourceRuleSetPath, JSON.stringify({
        version: 3,
        rules: [{ domain_suffix: ['example.invalid'] }]
      }), 'utf8');

      const compileResult = spawnSync(
        singBoxBin,
        ['rule-set', 'compile', '--disable-color', '-o', binaryRuleSetPath, sourceRuleSetPath],
        { encoding: 'utf8' }
      );
      expect(compileResult.stderr).toBe('');
      expect(compileResult.status).toBe(0);

      const config = JSON.parse(toSingBox([]));
      config.inbounds[0].listen_port = 0;
      config.route.rule_set = config.route.rule_set.map((ruleSet: { tag: string }) => ({
        tag: ruleSet.tag,
        type: 'local',
        format: 'binary',
        path: binaryRuleSetPath
      }));
      writeFileSync(configPath, JSON.stringify(config), 'utf8');

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
