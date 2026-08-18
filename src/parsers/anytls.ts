// src/parsers/anytls.ts
import { AnyTLSNode } from '../types';
import { parseRawQuery, queryEntriesToRecord, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parseAnyTLS(urlStr: string): AnyTLSNode | null {
  try {
    let raw = urlStr.replace(/^anytls:\/\//i, '').trim();
    let name = 'AnyTLS Node';

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'AnyTLS Node';
      raw = raw.substring(0, hashIndex);
    }

    let queryPart = '';
    const questionIndex = raw.indexOf('?');
    if (questionIndex !== -1) {
      queryPart = raw.substring(questionIndex + 1);
      raw = raw.substring(0, questionIndex);
    }

    const rawQuery = parseRawQuery(queryPart);
    const qMap = queryEntriesToRecord(rawQuery.entries);

    let password = '';
    let server = '';
    let port = 443;

    if (raw.includes('@')) {
      const atIndex = raw.indexOf('@');
      password = tryDecodeURIComponent(raw.substring(0, atIndex));
      const rest = raw.substring(atIndex + 1);

      if (rest.startsWith('[')) {
        const closingBracket = rest.indexOf(']');
        if (closingBracket !== -1) {
          server = rest.substring(1, closingBracket);
          const portPart = rest.substring(closingBracket + 1);
          port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 443;
        }
      } else {
        const parts = rest.split(':');
        server = parts[0] || '';
        port = parseInt(parts[1] || '443', 10) || 443;
      }
    } else {
      const decoded = safeBase64Decode(raw);
      if (decoded && decoded.includes('@')) {
        const atIndex = decoded.indexOf('@');
        password = decoded.substring(0, atIndex);
        const rest = decoded.substring(atIndex + 1);

        if (rest.startsWith('[')) {
          const closingBracket = rest.indexOf(']');
          if (closingBracket !== -1) {
            server = rest.substring(1, closingBracket);
            const portPart = rest.substring(closingBracket + 1);
            port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 443;
          }
        } else {
          const parts = rest.split(':');
          server = parts[0] || '';
          port = parseInt(parts[1] || '443', 10) || 443;
        }
      }
    }

    if (!server || !password) return null;

    const sni = qMap.sni || qMap.peer || server;
    const alpnStr = qMap.alpn;
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const fp = qMap.fp || qMap.fingerprint || qMap['client-fingerprint'];
    const insecure = qMap.insecure === '1' || qMap.insecure === 'true' || qMap.allowInsecure === '1' || qMap['skip-cert-verify'] === 'true';
    const nameCertVerify = qMap['name-cert-verify'] || qMap.name_cert_verify;
    const clientMetadata = qMap['client-metadata'] || qMap.client_metadata;
    const idleCheckInterval = qMap['idle-session-check-interval'] || qMap.idle_session_check_interval;
    const idleTimeout = qMap['idle-session-timeout'] || qMap.idle_session_timeout;
    const minIdleSession = qMap['min-idle-session'] || qMap.min_idle_session;

    const recognizedKeys = new Set([
      'sni', 'peer', 'alpn', 'fp', 'fingerprint', 'client-fingerprint',
      'insecure', 'allowinsecure', 'skip-cert-verify', 'name-cert-verify', 'name_cert_verify',
      'client-metadata', 'client_metadata', 'idle-session-check-interval', 'idle_session_check_interval',
      'idle-session-timeout', 'idle_session_timeout', 'min-idle-session', 'min_idle_session'
    ]);

    const extras: Record<string, unknown> = {};
    for (const entry of rawQuery.entries) {
      if (!recognizedKeys.has(entry.key.toLowerCase())) {
        extras[entry.key] = entry.value;
      }
    }

    return {
      name,
      protocol: 'anytls',
      server,
      port,
      source: {
        format: 'uri',
        raw: urlStr
      },
      rawQuery,
      protocolData: {
        password,
        sni,
        insecure,
        alpn,
        fingerprint: fp,
        nameCertVerify,
        clientMetadata,
        idleSessionCheckInterval: idleCheckInterval,
        idleSessionTimeout: idleTimeout,
        minIdleSession,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
