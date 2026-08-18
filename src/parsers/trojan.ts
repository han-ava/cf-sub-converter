// src/parsers/trojan.ts
import { TrojanNode } from '../types';
import { parseRawQuery, queryEntriesToRecord, tryDecodeURIComponent } from '../utils';

export function parseTrojan(urlStr: string): TrojanNode | null {
  try {
    let raw = urlStr.replace('trojan://', '').trim();
    let name = 'Trojan Node';

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'Trojan Node';
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

    const type = (qMap.type || 'tcp').toLowerCase();
    const sni = qMap.sni || qMap.peer || server;
    const alpnStr = qMap.alpn;
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const fp = qMap.fp || qMap.fingerprint || qMap['client-fingerprint'];
    const allowInsecure = qMap.allowInsecure === '1' || qMap.insecure === '1' || qMap.allow_insecure === '1' || qMap['skip-cert-verify'] === 'true';

    const path = qMap.path || (type === 'ws' ? '/' : undefined);
    const host = qMap.host || undefined;
    const serviceName = qMap.serviceName || qMap['service-name'] || qMap['grpc-service-name'] || undefined;

    const recognizedKeys = new Set([
      'type', 'sni', 'peer', 'alpn', 'fp', 'fingerprint', 'client-fingerprint',
      'allowinsecure', 'insecure', 'allow_insecure', 'skip-cert-verify',
      'path', 'host', 'servicename', 'service-name', 'grpc-service-name'
    ]);

    const extras: Record<string, unknown> = {};
    for (const entry of rawQuery.entries) {
      if (!recognizedKeys.has(entry.key.toLowerCase())) {
        extras[entry.key] = entry.value;
      }
    }

    const transport: TrojanNode['protocolData']['transport'] = {
      type,
      path,
      headers: host ? { Host: host } : undefined,
      serviceName
    };

    return {
      name,
      protocol: 'trojan',
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
        alpn,
        fingerprint: fp,
        skipCertVerify: allowInsecure,
        transport,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
