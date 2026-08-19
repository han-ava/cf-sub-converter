// src/parsers/vless.ts
import { VlessNode } from '../types';
import { parseRawQuery, queryEntriesToRecord, tryDecodeURIComponent } from '../utils';

export function parseVless(urlStr: string): VlessNode | null {
  try {
    const raw = urlStr.replace('vless://', '').trim();
    let name = 'VLESS Node';
    let content = raw;

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'VLESS Node';
      content = raw.substring(0, hashIndex);
    }

    const atIndex = content.indexOf('@');
    if (atIndex === -1) return null;

    const uuid = tryDecodeURIComponent(content.substring(0, atIndex));
    const rest = content.substring(atIndex + 1);

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

    if (!server || !uuid) return null;

    const rawQuery = parseRawQuery(queryPart);
    const qMap = queryEntriesToRecord(rawQuery.entries);

    const type = (qMap.type || 'tcp').toLowerCase();
    const security = (qMap.security || 'none').toLowerCase();
    const flow = qMap.flow || undefined;
    const packetEncoding = qMap.packetEncoding || qMap['packet-encoding'] || qMap.packet_encoding || undefined;
    const encryption = qMap.encryption || undefined;
    const sni = qMap.sni || qMap.servername || qMap.serverName || qMap.peer || server;
    const fp = qMap.fp || qMap.fingerprint || qMap['client-fingerprint'] || undefined;
    const alpnStr = qMap.alpn;
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const allowInsecure = qMap.allowInsecure === '1' || qMap.insecure === '1' || qMap.allow_insecure === '1' || qMap['skip-cert-verify'] === 'true';

    const pbk = qMap.pbk || qMap['public-key'] || qMap.publicKey;
    const sid = qMap.sid || qMap['short-id'] || qMap.shortId;
    const spx = qMap.spx || qMap['spider-x'] || qMap.spiderX;

    const isReality = security === 'reality' || !!pbk;
    const isTls = security === 'tls' || security === 'reality' || !!pbk;

    const path = qMap.path || (type === 'ws' || type === 'xhttp' ? '/' : undefined);
    const host = qMap.host || undefined;
    const serviceName = qMap.serviceName || qMap['service-name'] || qMap['grpc-service-name'] || (type === 'grpc' ? qMap.path : undefined);
    const mode = qMap.mode || undefined;
    const extra = qMap.extra || undefined;

    const recognizedKeys = new Set([
      'type', 'security', 'flow', 'packetencoding', 'packet-encoding', 'packet_encoding',
      'encryption', 'sni', 'servername', 'server-name', 'server_name', 'peer', 'host',
      'fp', 'fingerprint', 'client-fingerprint',
      'alpn', 'allowinsecure', 'insecure', 'allow_insecure', 'skip-cert-verify',
      'pbk', 'public-key', 'publickey', 'sid', 'short-id', 'shortid', 'spx', 'spider-x', 'spiderx',
      'path', 'servicename', 'service-name', 'grpc-service-name', 'mode', 'extra', 'headertype', 'header-type'
    ]);

    const extras: Record<string, unknown> = {};
    for (const entry of rawQuery.entries) {
      if (!recognizedKeys.has(entry.key.toLowerCase())) {
        extras[entry.key] = entry.value;
      }
    }

    const transport: VlessNode['protocolData']['transport'] = {
      type,
      path,
      headers: host ? { Host: host } : undefined,
      serviceName,
      mode,
      extra
    };

    return {
      name,
      protocol: 'vless',
      server,
      port,
      source: {
        format: 'uri',
        raw: urlStr
      },
      rawQuery,
      protocolData: {
        uuid,
        flow,
        encryption,
        packetEncoding,
        security: isReality ? 'reality' : (isTls ? 'tls' : 'none'),
        sni: isTls ? sni : undefined,
        alpn,
        fingerprint: fp,
        skipCertVerify: allowInsecure,
        realityOpts: isReality && pbk ? {
          publicKey: pbk,
          shortId: sid || '',
          spiderX: spx || ''
        } : undefined,
        transport,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
