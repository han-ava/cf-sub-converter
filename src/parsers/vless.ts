// src/parsers/vless.ts
import { VlessNode } from '../types';
import { parseRawQuery, QueryParamReader, tryDecodeURIComponent } from '../utils';

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
    const q = new QueryParamReader(rawQuery.entries);

    const type = (q.get('type', 'net', 'network', 'transport') || 'tcp').toLowerCase();
    const security = (q.get('security', 'tls') || 'none').toLowerCase();
    const flow = q.get('flow');
    const packetEncoding = q.get('packetEncoding', 'packet-encoding', 'packet_encoding', 'packetencoding', 'packet_addr', 'packetaddr', 'packet-addr');
    const encryption = q.get('encryption');
    const sni = q.get('sni', 'servername', 'serverName', 'server-name', 'server_name', 'peer') || server;
    const fp = q.get('fp', 'fingerprint', 'client-fingerprint', 'client_fingerprint', 'clientfingerprint');
    const alpnStr = q.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const allowInsecure = q.getBool('allowInsecure', 'allowinsecure', 'allow_insecure', 'insecure', 'skip-cert-verify', 'skip_cert_verify', 'skipcertverify');

    const pbk = q.get('pbk', 'public-key', 'publicKey', 'public_key', 'publickey');
    const sid = q.get('sid', 'short-id', 'shortId', 'short_id', 'shortid');
    const spx = q.get('spx', 'spider-x', 'spiderX', 'spider_x', 'spiderx');

    const isReality = security === 'reality' || !!pbk;
    const isTls = security === 'tls' || security === 'reality' || !!pbk;

    const path = q.get('path', 'ws-path', 'ws_path', 'wspath') || (type === 'ws' || type === 'xhttp' ? '/' : undefined);
    const host = q.get('host', 'ws-host', 'ws_host', 'wshost', 'obfs-host', 'obfs_host', 'obfshost');
    const serviceName = q.get('serviceName', 'servicename', 'service-name', 'service_name', 'grpc-service-name', 'grpc_service_name', 'grpcservicename') || (type === 'grpc' ? q.get('path', 'ws-path', 'ws_path', 'wspath') : undefined);
    const mode = q.get('mode', 'grpc-mode', 'grpc_mode', 'grpcmode');
    const extra = q.get('extra');
    const headerType = q.get('headerType', 'headertype', 'header-type', 'header_type');
    const authority = q.get('authority');

    const extras = q.getUnusedExtras();

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
