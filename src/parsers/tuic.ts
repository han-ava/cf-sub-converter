// src/parsers/tuic.ts
import { TuicNode } from '../types';
import { parseRawQuery, QueryParamReader, tryDecodeURIComponent } from '../utils';

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
    const q = new QueryParamReader(rawQuery.entries);

    const sni = q.get('sni', 'peer', 'servername', 'serverName', 'server-name', 'server_name') || server;
    const congestionControl = q.get('congestion_control', 'congestion-control', 'congestion-controller', 'congestion_controller', 'congestionControl', 'congestioncontrol', 'cc') || 'bbr';
    const udpRelayMode = q.get('udp_relay_mode', 'udp-relay-mode', 'udpRelayMode', 'udprelaymode', 'udp-relay', 'udp_relay', 'udprelay') || 'native';
    const alpnStr = q.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const insecure = q.getBool('allow_insecure', 'allowinsecure', 'allowInsecure', 'insecure', 'skip-cert-verify', 'skip_cert_verify', 'skipcertverify');
    const zeroRttHandshake = q.getBool('zero_rtt_handshake', 'zero-rtt-handshake', 'zeroRttHandshake', 'zerortthandshake', '0rtt', 'zero-rtt', 'zero_rtt');
    const heartbeat = q.get('heartbeat', 'heartbeat_interval', 'heartbeat-interval', 'heartbeatinterval');

    const extras = q.getUnusedExtras();
    const invalidParams = q.getInvalidParams();

    return {
      name,
      protocol: 'tuic',
      server,
      port,
      source: {
        format: 'uri',
        raw: urlStr
      },
      rawQuery: {
        ...rawQuery,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined
      },
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
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
