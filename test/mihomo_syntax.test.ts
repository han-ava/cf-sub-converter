// test/mihomo_syntax.test.ts
import { describe, expect, test } from 'vitest';
import { parseSingleNode } from '../src/parser';
import { toClashMeta } from '../src/generator';
import { FIXTURES } from './fixtures/nodes';
import { writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';

describe('Mihomo CLI Syntax Validation Suite', () => {
  test('Full multi-protocol generated configuration passes mihomo -t -f syntax check', () => {
    const nodes = [
      parseSingleNode(FIXTURES.vless_reality)!,
      parseSingleNode(FIXTURES.vless_ws_ipv6)!,
      parseSingleNode(FIXTURES.vmess_standard)!,
      parseSingleNode(FIXTURES.vmess_grpc)!,
      parseSingleNode(FIXTURES.ss_sip002_plugin)!,
      parseSingleNode(FIXTURES.ss_ss2022)!,
      parseSingleNode(FIXTURES.hy2_full)!,
      parseSingleNode(FIXTURES.hy2_gecko)!,
      parseSingleNode(FIXTURES.anytls_standard)!,
      parseSingleNode(FIXTURES.trojan_ws)!,
      parseSingleNode(FIXTURES.tuic_standard)!
    ];

    expect(nodes.every(n => n !== null)).toBe(true);

    const fullConfigYaml = toClashMeta(nodes, undefined, 'minimal');
    const tempConfigPath = `/tmp/test_mihomo_config_${Date.now()}.yaml`;

    try {
      writeFileSync(tempConfigPath, fullConfigYaml, 'utf-8');

      // 执行 mihomo -t -f <config>
      const proc = spawnSync('mihomo', ['-t', '-f', tempConfigPath], {
        encoding: 'utf-8'
      });

      console.log('Mihomo output:', proc.stdout || proc.stderr);
      expect(proc.status).toBe(0);
      expect((proc.stdout || proc.stderr).toLowerCase()).toContain('successful');
    } finally {
      try {
        unlinkSync(tempConfigPath);
      } catch {}
    }
  });
});
