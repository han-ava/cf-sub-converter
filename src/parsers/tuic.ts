// src/parsers/tuic.ts
import { TuicNode } from '../types';
import { parseRawQuery, parseStrictEndpoint, QueryParamReader, tryDecodeURIComponent } from '../utils';

export function parseTuic(urlStr: string): TuicNode | null {
  try {
    let raw = urlStr.replace(/^tuic:\/\//i, '').trim();
    let name = 'TUIC Node';

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'TUIC Node';
      raw = raw.substring(0, hashIndex);
    }

    const atIndex = raw.indexOf('@');
    if (atIndex === -1) return null;

    const userPart = raw.substring(0, atIndex);
    const rest = raw.substring(atIndex + 1);

    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;
    const queryPart = questionIndex !== -1 ? rest.substring(questionIndex + 1) : '';

    const ep = parseStrictEndpoint(serverPortStr, 443);
    const server = ep.server;
    const port = ep.port;

    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);
    const versionValue = q.getEnum(['4', '5'], 'version');
    const version = versionValue ? Number(versionValue) as 4 | 5 : undefined;

    let uuid: string | undefined;
    let password: string | undefined;
    let token: string | undefined;

    if (userPart.includes(':')) {
      const colonIdx = userPart.indexOf(':');
      uuid = tryDecodeURIComponent(userPart.substring(0, colonIdx));
      password = tryDecodeURIComponent(userPart.substring(colonIdx + 1));
    } else if (userPart) {
      const decodedUser = tryDecodeURIComponent(userPart);
      const qPass = q.get('password', 'pass');
      const qUuid = q.get('uuid');
      const qToken = q.get('token');

      if (version === 4 || qToken) {
        token = qToken || decodedUser;
      } else if (qPass) {
        uuid = decodedUser;
        password = qPass;
      } else if (qUuid || version === 5) {
        uuid = decodedUser || qUuid;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedUser)) {
        uuid = decodedUser;
      } else {
        token = decodedUser;
      }
    }

    if (!token) token = q.get('token');
    if (!uuid) uuid = q.get('uuid');
    if (!password) password = q.get('password', 'pass');

    if (!server || (!token && !uuid && !password)) return null;

    const sni = q.get('sni', 'peer', 'servername', 'serverName', 'server-name', 'server_name') || server;
    const ip = q.get('ip');
    const heartbeatInterval = q.get('heartbeat-interval', 'heartbeat_interval', 'heartbeat', 'heartbeatinterval');
    const reduceRtt = q.getBool('reduce-rtt', 'reduce_rtt', 'reducertt', 'zero-rtt-handshake', 'zero_rtt_handshake', 'zeroRttHandshake', 'zerortthandshake', '0rtt', 'zero-rtt', 'zero_rtt');
    const requestTimeout = q.get('request-timeout', 'request_timeout', 'requesttimeout');
    const disableSni = q.getBool('disable-sni', 'disable_sni', 'disablesni');
    const fastOpen = q.getBool('fast-open', 'fast_open', 'fastopen');
    const maxOpenStreams = q.getInt('max-open-streams', 'max_open_streams', 'maxopenstreams');
    const maxUdpRelayPacketSize = q.getInt('max-udp-relay-packet-size', 'max_udp_relay_packet_size', 'maxudprelaypacketsize');
    const congestionController = q.getEnum(['bbr', 'cubic', 'new_reno'], 'congestion_controller', 'congestion-controller', 'congestionController', 'congestioncontroller', 'congestion_control', 'congestion-control', 'congestionControl', 'congestioncontrol', 'cc') || 'bbr';
    const udpRelayMode = q.getEnum(['native', 'quic'], 'udp_relay_mode', 'udp-relay-mode', 'udpRelayMode', 'udprelaymode', 'udp-relay', 'udp_relay', 'udprelay');
    const udpOverStream = q.getBool('udp-over-stream', 'udp_over_stream', 'udpOverStream', 'udpoverstream');
    const alpnStr = q.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const insecure = q.getBool('allow_insecure', 'allowinsecure', 'allowInsecure', 'insecure', 'skip-cert-verify', 'skip_cert_verify', 'skipcertverify');

    const extras = q.getUnusedExtras();
    const invalidParams = q.getInvalidParams();
    if (ep.error) {
      invalidParams.push({
        key: 'port',
        value: ep.rawPort || '',
        reason: ep.error
      });
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
      rawQuery: {
        ...rawQuery,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined
      },
      protocolData: {
        uuid,
        password,
        token,
        version,
        ip,
        heartbeatInterval,
        reduceRtt,
        requestTimeout,
        disableSni,
        fastOpen,
        maxOpenStreams,
        maxUdpRelayPacketSize,
        congestionController,
        udpRelayMode,
        udpOverStream,
        alpn: alpn || ['h3'],
        sni,
        skipCertVerify: insecure,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
