import { describe, expect, test } from 'bun:test';
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
});
