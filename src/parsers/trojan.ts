// src/parsers/trojan.ts
import { TrojanNode } from '../types';
import { parseRawQuery, parseStrictEndpoint, QueryParamReader, tryDecodeURIComponent } from '../utils';

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

    const ep = parseStrictEndpoint(serverPortStr, 443);
    const server = ep.server;
    const port = ep.port;

    if (!server || !password) return null;

    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);

    const type = (q.get('type', 'net', 'network', 'transport') || 'tcp').toLowerCase();
    const sni = q.get('sni', 'peer', 'servername', 'serverName', 'server-name', 'server_name') || server;
    const alpnStr = q.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const fp = q.get('fp', 'fingerprint', 'client-fingerprint', 'client_fingerprint', 'clientfingerprint');
    const allowInsecure = q.getBool('allowInsecure', 'allowinsecure', 'allow_insecure', 'insecure', 'skip-cert-verify', 'skip_cert_verify', 'skipcertverify');

    const path = q.get('path', 'ws-path', 'ws_path', 'wspath') || (type === 'ws' ? '/' : undefined);
    const host = q.get('host', 'ws-host', 'ws_host', 'wshost', 'obfs-host', 'obfs_host', 'obfshost');
    const serviceName = q.get('serviceName', 'servicename', 'service-name', 'service_name', 'grpc-service-name', 'grpc_service_name', 'grpcservicename') || (type === 'grpc' ? q.get('path', 'ws-path', 'ws_path', 'wspath') : undefined);

    const extras = q.getUnusedExtras();
    const invalidParams = q.getInvalidParams();
    if (ep.error) {
      invalidParams.push({
        key: 'port',
        value: ep.rawPort || '',
        reason: ep.error
      });
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
      rawQuery: {
        ...rawQuery,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined
      },
      protocolData: {
        password,
        sni,
        alpn,
        fingerprint: fp,
        skipCertVerify: allowInsecure,
        transport,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
