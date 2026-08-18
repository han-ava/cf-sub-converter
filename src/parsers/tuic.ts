// src/parsers/tuic.ts
import { TuicNode } from '../types';
import { parseRawQuery, queryEntriesToRecord, tryDecodeURIComponent } from '../utils';

export function parseTuic(urlStr: string): TuicNode | null {
  try {
    let raw = urlStr.replace('tuic://', '').trim();
    let name = 'TUIC Node';

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'TUIC Node';
      raw = raw.substring(0, hashIndex);
    }

    const atIndex = raw.indexOf('@');
    if (atIndex === -1) return null;

    const userPass = raw.substring(0, atIndex).split(':');
    const uuid = tryDecodeURIComponent(userPass[0] || '');
    const password = tryDecodeURIComponent(userPass[1] || '');

    const rest = raw.substring(atIndex + 1);
    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;
    const queryPart = questionIndex !== -1 ? rest.substring(questionIndex + 1) : '';

    let server = '';
    let port = 443;

    if (serverPortStr.startsWith('[')) {
      const closingBracket = serverPortStr.indexOf(']');
      if (closingBracket !== -1) {
        server = serverPortStr.substring(1, closingBracket);
        const portPart = serverPortStr.substring(closingBracket + 1);
        port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 443;
      }
    } else {
      const parts = serverPortStr.split(':');
      server = parts[0] || '';
      port = parseInt(parts[1] || '443', 10) || 443;
    }

    if (!server || (!uuid && !password)) return null;

    const rawQuery = parseRawQuery(queryPart);
    const qMap = queryEntriesToRecord(rawQuery.entries);

    const sni = qMap.sni || server;
    const congestionControl = qMap.congestion_control || qMap['congestion-controller'] || qMap.congestionControl || 'bbr';
    const udpRelayMode = qMap.udp_relay_mode || qMap['udp-relay-mode'] || qMap.udpRelayMode || 'native';
    const alpnStr = qMap.alpn;
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const insecure = qMap.allow_insecure === '1' || qMap.insecure === '1' || qMap['skip-cert-verify'] === 'true';
    const zeroRttHandshake = qMap.zero_rtt_handshake === '1' || qMap['zero-rtt-handshake'] === 'true';
    const heartbeat = qMap.heartbeat;

    const recognizedKeys = new Set([
      'sni', 'congestion_control', 'congestion-controller', 'congestioncontrol',
      'udp_relay_mode', 'udp-relay-mode', 'udprelaymode',
      'alpn', 'allow_insecure', 'insecure', 'skip-cert-verify',
      'zero_rtt_handshake', 'zero-rtt-handshake', 'heartbeat'
    ]);

    const extras: Record<string, unknown> = {};
    for (const entry of rawQuery.entries) {
      if (!recognizedKeys.has(entry.key.toLowerCase())) {
        extras[entry.key] = entry.value;
      }
    }

    return {
      name,
      protocol: 'tuic',
      server,
      port,
      source: {
        format: 'uri',
        raw: urlStr
      },
      rawQuery,
      protocolData: {
        uuid,
        password,
        sni,
        alpn: alpn || ['h3'],
        congestionControl,
        udpRelayMode,
        skipCertVerify: insecure,
        zeroRttHandshake,
        heartbeat,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
