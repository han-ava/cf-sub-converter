import { describe, expect, spyOn, test } from 'bun:test';
import { fetchSubscriptionWithTimeout, isSafeSubscriptionUrl } from '../src/security';

describe('Subscription fetch security', () => {
  test('allows public HTTP(S) subscription URLs on non-standard ports', () => {
    expect(isSafeSubscriptionUrl('https://sub.example.com:2375/subscription')).toBe(true);
    expect(isSafeSubscriptionUrl('http://sub.example.com:65535/subscription')).toBe(true);
    expect(isSafeSubscriptionUrl('http://[::ffff:8.8.8.8]:2375/subscription')).toBe(true);
  });

  test('rejects private and loopback subscription targets', () => {
    const blockedUrls = [
      'http://localhost:8080/subscription',
      'http://localhost.:8080/subscription',
      'http://127.0.0.1:2375/subscription',
      'http://[::ffff:127.0.0.1]:8080/subscription',
      'http://10.0.0.1:8080/subscription',
      'http://172.16.0.1:8080/subscription',
      'http://192.168.1.1:8080/subscription',
      'http://169.254.169.254/subscription',
      'http://[::1]:8080/subscription',
    ];

    for (const url of blockedUrls) {
      expect(isSafeSubscriptionUrl(url)).toBe(false);
    }
  });

  test.serial('revalidates every redirect before issuing the next request', async () => {
    const requestedUrls: string[] = [];
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL) => {
        const requestedUrl = String(input);
        requestedUrls.push(requestedUrl);

        if (requestedUrls.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://redirect.example.com:2375/next' },
          });
        }

        if (requestedUrls.length === 2) {
          return new Response(null, {
            status: 307,
            headers: { Location: 'http://[::ffff:127.0.0.1]:8080/private' },
          });
        }

        throw new Error('private redirect target must not be fetched');
      },
    );

    try {
      await expect(
        fetchSubscriptionWithTimeout('https://origin.example.com:8443/start', undefined, false),
      ).rejects.toThrow('安全策略拦截');

      expect(requestedUrls).toEqual([
        'https://origin.example.com:8443/start',
        'https://redirect.example.com:2375/next',
      ]);
      expect(fetchSpy.mock.calls[0]?.[1]?.redirect).toBe('manual');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
