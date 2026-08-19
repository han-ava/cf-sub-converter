// src/parsers/hysteria2.ts
import { Hysteria2Node } from '../types';
import { parseRawQuery, queryEntriesToRecord, tryDecodeURIComponent } from '../utils';

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

    if (!server || !password) return null;

    const rawQuery = parseRawQuery(queryPart);
    const qMap = queryEntriesToRecord(rawQuery.entries);

    const sni = qMap.sni || qMap.peer || server;
    const obfs = qMap.obfs;
    const obfsPassword = qMap['obfs-password'] || qMap.obfs_password || qMap.obfspassword;
    const obfsMinPacketSize = qMap['obfs-min-packet-size'] || qMap.obfs_min_packet_size;
    const obfsMaxPacketSize = qMap['obfs-max-packet-size'] || qMap.obfs_max_packet_size;
    const ports = qMap.ports || qMap.mport;
    const hopInterval = qMap['hop-interval'] || qMap.hop_interval;
    const up = qMap.up || qMap.up_mbps || qMap.upMbps;
    const down = qMap.down || qMap.down_mbps || qMap.downMbps;
    const alpnStr = qMap.alpn;
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const certificateFingerprint = qMap.pinSHA256 || qMap.pinsha256 || qMap['pin-sha256'] || qMap.fingerprint;
    const insecure = qMap.insecure === '1' || qMap.allowInsecure === '1' || qMap['skip-cert-verify'] === 'true';
    const nameCertVerify = qMap['name-cert-verify'] || qMap.name_cert_verify;
    const handshakeTimeout = qMap['handshake-timeout'] || qMap.handshake_timeout;

    const recognizedKeys = new Set([
      'sni', 'peer', 'obfs', 'obfs-password', 'obfs_password', 'obfspassword',
      'obfs-min-packet-size', 'obfs_min_packet_size', 'obfs-max-packet-size', 'obfs_max_packet_size',
      'ports', 'mport', 'hop-interval', 'hop_interval', 'up', 'up_mbps', 'upmbps',
      'down', 'down_mbps', 'downmbps', 'alpn', 'fp', 'fingerprint', 'client-fingerprint',
      'pinsha256', 'pin-sha256', 'pin_sha256',
      'insecure', 'allowinsecure', 'skip-cert-verify', 'name-cert-verify', 'name_cert_verify',
      'handshake-timeout', 'handshake_timeout'
    ]);

    const extras: Record<string, unknown> = {};
    for (const entry of rawQuery.entries) {
      if (!recognizedKeys.has(entry.key.toLowerCase())) {
        extras[entry.key] = entry.value;
      }
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
      rawQuery,
      protocolData: {
        password,
        sni,
        skipCertVerify: insecure,
        ports,
        hopInterval: hopInterval ? parseInt(hopInterval, 10) : undefined,
        up,
        down,
        obfs,
        obfsPassword,
        obfsMinPacketSize: obfsMinPacketSize ? parseInt(obfsMinPacketSize, 10) : undefined,
        obfsMaxPacketSize: obfsMaxPacketSize ? parseInt(obfsMaxPacketSize, 10) : undefined,
        alpn,
        certificateFingerprint: certificateFingerprint ? String(certificateFingerprint).trim() : undefined,
        fingerprint: certificateFingerprint ? String(certificateFingerprint).trim() : undefined,
        nameCertVerify,
        handshakeTimeout,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
