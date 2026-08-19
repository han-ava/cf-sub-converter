// src/parsers/anytls.ts
import { AnyTLSNode } from '../types';
import { parseRawQuery, QueryParamReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

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
    const q = new QueryParamReader(rawQuery.entries);

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

    const sni = q.get('sni', 'peer', 'servername', 'serverName', 'server-name', 'server_name') || server;
    const alpnStr = q.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const fp = q.get('fp', 'fingerprint', 'client-fingerprint', 'client_fingerprint', 'clientfingerprint');
    const insecure = q.getBool('insecure', 'allowinsecure', 'allow_insecure', 'allowInsecure', 'skip-cert-verify', 'skip_cert_verify', 'skipcertverify');
    const nameCertVerify = q.get('name-cert-verify', 'name_cert_verify', 'namecertverify');
    const clientMetadata = q.get('client-metadata', 'client_metadata', 'clientmetadata');
    const idleCheckInterval = q.get('idle-session-check-interval', 'idle_session_check_interval', 'idlesessioncheckinterval');
    const idleTimeout = q.get('idle-session-timeout', 'idle_session_timeout', 'idlesessiontimeout');
    const minIdleSession = q.get('min-idle-session', 'min_idle_session', 'minidlesession');

    const extras = q.getUnusedExtras();

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
