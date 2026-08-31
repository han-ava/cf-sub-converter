import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { sanitizeUrlForLog, UPSTREAM_USER_AGENT } from '../src/security';

describe('Logging security', () => {
  test('subscription URLs are reduced to scheme and host', () => {
    const sanitized = sanitizeUrlForLog(
      'https://user:password@sub.example.com/private/subscription-token?token=secret#fragment'
    );

    expect(sanitized).toBe('https://sub.example.com');
    expect(sanitized).not.toContain('password');
    expect(sanitized).not.toContain('subscription-token');
    expect(sanitized).not.toContain('secret');
  });

  test('invalid subscription URLs do not echo their input', () => {
    expect(sanitizeUrlForLog('not-a-url-with-secret')).toBe('[Invalid URL]');
  });

  test('upstream requests use one canonical Clash user agent', () => {
    expect(UPSTREAM_USER_AGENT).toBe('ClashMeta/1.19.0');
  });

  test('production Worker avoids success-path info logs', () => {
    const workerSources = [
      '../src/index.ts',
      '../src/generator.ts',
      '../src/adapters/raw/index.ts'
    ]
      .map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
      .join('\n');

    expect(workerSources).not.toMatch(/console\.(?:log|debug|info)\s*\(/);
    expect(workerSources).toContain('console.warn(');
    expect(workerSources).toContain('console.error(');
  });

  test('repeated source and node failures use aggregate log events', () => {
    const workerSources = [
      '../src/index.ts',
      '../src/generator.ts',
      '../src/adapters/raw/index.ts'
    ]
      .map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
      .join('\n');

    expect(workerSources).toContain('[SOURCE_ISSUES]');
    expect(workerSources).toContain('[CLASH_NODES_DROPPED]');
    expect(workerSources).toContain('[RAW_NODES_DROPPED]');
    expect(workerSources).not.toMatch(
      /\[(?:SOURCE_BASE64_DECODE_FAILED|SOURCE_PARSE_ERROR|SOURCE_PARSE_EMPTY|CLASH_NODE_DROPPED|RAW_NODE_ERROR|RAW_NODE_DROPPED)\]/
    );
  });
});
