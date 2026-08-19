// src/parsers/hysteria2.ts
import { Hysteria2Node } from '../types';
import { parseHy2HopInterval, parseRawQuery, parseStrictEndpoint, QueryParamReader, tryDecodeURIComponent } from '../utils';

export function parseHysteria2(urlStr: string): Hysteria2Node | null {
  try {
    let raw = urlStr.replace(/^(?:hysteria2|hy2):\/\//i, '').trim();
    let name = 'Hysteria 2 Node';

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'Hysteria 2 Node';
      raw = raw.substring(0, hashIndex);
    }

    const atIndex = raw.indexOf('@');
    if (atIndex === -1) return null;

    const password = tryDecodeURIComponent(raw.substring(0, atIndex));
    const rest = raw.substring(atIndex + 1);

    const questionIndex = rest.indexOf('?');
    const serverPortStr = questionIndex !== -1 ? rest.substring(0, questionIndex) : rest;
    const queryPart = questionIndex !== -1 ? rest.substring(questionIndex + 1) : '';

    const ep = parseStrictEndpoint(serverPortStr, 443);
    const server = ep.server;
    const port = ep.port;

    if (!server || !password) return null;

    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);

    const sni = q.get('sni', 'peer', 'servername', 'serverName', 'server-name', 'server_name') || server;
    const obfs = q.getEnum(['salamander', 'gecko'], 'obfs', 'obfs-type', 'obfs_type', 'obfstype');
    const obfsPassword = q.get('obfs-password', 'obfs_password', 'obfspassword', 'obfs-pass', 'obfs_pass', 'obfspass', 'obfs-param', 'obfs_param', 'obfsparam');
    const obfsMinPacketSize = q.getInt('obfs-min-packet-size', 'obfs_min_packet_size', 'obfsminpacketsize', 'obfs-min-size', 'obfs_min_size', 'obfsminsize');
    const obfsMaxPacketSize = q.getInt('obfs-max-packet-size', 'obfs_max_packet_size', 'obfsmaxpacketsize', 'obfs-max-size', 'obfs_max_size', 'obfsmaxsize');
    const ports = q.get('ports', 'mport', 'mports');
    const rawHopInterval = q.get('hop-interval', 'hop_interval', 'hopinterval');
    let hopInterval: number | string | undefined = undefined;
    if (rawHopInterval !== undefined) {
      const parsedHop = parseHy2HopInterval(rawHopInterval);
      if (parsedHop.invalid) {
        q.getInt('hop-interval');
      } else {
        hopInterval = parsedHop.val;
      }
    }
    const up = q.get('up', 'up_mbps', 'upmbps', 'upMbps', 'upload');
    const down = q.get('down', 'down_mbps', 'downmbps', 'downMbps', 'download');
    const alpnStr = q.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const certificateFingerprint = q.get('pinSHA256', 'pinsha256', 'pin-sha256', 'pin_sha256', 'fingerprint');
    const insecure = q.getBool('insecure', 'allowInsecure', 'allowinsecure', 'allow_insecure', 'skip-cert-verify', 'skip_cert_verify', 'skipcertverify');
    const nameCertVerify = q.get('name-cert-verify', 'name_cert_verify', 'namecertverify');
    const handshakeTimeout = q.get('handshake-timeout', 'handshake_timeout', 'handshaketimeout');

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
      protocol: 'hysteria2',
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
        password,
        sni,
        skipCertVerify: insecure,
        ports,
        hopInterval,
        up,
        down,
        obfs,
        obfsPassword,
        obfsMinPacketSize,
        obfsMaxPacketSize,
        alpn,
        certificateFingerprint: certificateFingerprint ? String(certificateFingerprint).trim() : undefined,
        fingerprint: certificateFingerprint ? String(certificateFingerprint).trim() : undefined,
        nameCertVerify,
        handshakeTimeout,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
