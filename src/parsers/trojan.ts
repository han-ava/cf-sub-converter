// src/parsers/trojan.ts
import { TrojanNode } from '../types';
import { parseRawQuery, parseStrictEndpoint, QueryParamReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parseTrojan(urlStr: string): TrojanNode | null {
  try {
    let raw = urlStr.replace(/^trojan:\/\//i, '').trim();
    let name = 'Trojan Node';
    let isAuthorityBase64 = false;

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'Trojan Node';
      raw = raw.substring(0, hashIndex);
    }

    const questionIndex = raw.indexOf('?');
    let authorityPart = questionIndex !== -1 ? raw.substring(0, questionIndex) : raw;
    let queryPart = questionIndex !== -1 ? raw.substring(questionIndex + 1) : '';

    if (!authorityPart.includes('@')) {
      const decoded = safeBase64Decode(authorityPart);
      if (decoded && decoded.includes('@')) {
        let inner = decoded.trim();
        const innerHashIdx = inner.indexOf('#');
        if (innerHashIdx !== -1) {
          if (name === 'Trojan Node' || !name) {
            name = tryDecodeURIComponent(inner.substring(innerHashIdx + 1)).trim() || name;
          }
          inner = inner.substring(0, innerHashIdx);
        }
        const innerQIdx = inner.indexOf('?');
        if (innerQIdx !== -1) {
          authorityPart = inner.substring(0, innerQIdx);
          const innerQuery = inner.substring(innerQIdx + 1);
          queryPart = queryPart ? `${queryPart}&${innerQuery}` : innerQuery;
        } else {
          authorityPart = inner;
        }
        isAuthorityBase64 = true;
      }
    }

    const atIndex = authorityPart.lastIndexOf('@');
    if (atIndex === -1) return null;

    let password = tryDecodeURIComponent(authorityPart.substring(0, atIndex)).trim();
    const serverPortStr = authorityPart.substring(atIndex + 1).trim();

    if (/^(?:auto|none|zero):/i.test(password)) {
      password = password.replace(/^(?:auto|none|zero):/i, '').trim();
      isAuthorityBase64 = true;
    }

    const ep = parseStrictEndpoint(serverPortStr, 443);
    const server = ep.server;
    const port = ep.port;

    if (!server || !password) return null;

    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);

    if (name === 'Trojan Node' || !name) {
      const nameFromQuery = q.get('remark', 'remarks', 'title', 'name');
      if (nameFromQuery) {
        name = tryDecodeURIComponent(nameFromQuery).trim() || name;
      }
    }
    q.markRecognized('remark', 'remarks', 'title', 'name');

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

    const finalRaw = isAuthorityBase64
      ? `trojan://${encodeURIComponent(password)}@${ep.server}:${ep.port}${queryPart ? '?' + queryPart : ''}#${encodeURIComponent(name)}`
      : urlStr;

    return {
      name,
      protocol: 'trojan',
      server,
      port,
      source: {
        format: 'uri',
        raw: finalRaw
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

