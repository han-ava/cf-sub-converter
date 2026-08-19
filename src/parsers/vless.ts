// src/parsers/vless.ts
import { VlessNode } from '../types';
import { parseRawQuery, parseStrictEndpoint, QueryParamReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parseVless(urlStr: string): VlessNode | null {
  try {
    let raw = urlStr.replace(/^vless:\/\//i, '').trim();
    let name = 'VLESS Node';
    let isAuthorityBase64 = false;

    // 1. 处理 URI Hash (#节点名称)
    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'VLESS Node';
      raw = raw.substring(0, hashIndex);
    }

    // 2. 分离 Authority 与 Query 参数
    const questionIndex = raw.indexOf('?');
    let authorityPart = questionIndex !== -1 ? raw.substring(0, questionIndex) : raw;
    let queryPart = questionIndex !== -1 ? raw.substring(questionIndex + 1) : '';

    // 3. 兼容 Authority 进行 Base64 编码的情况 (如 vless://BASE64(auto:UUID@server:port)?query)
    // 或者整段 raw 进行 Base64 编码的情况 (如 vless://BASE64(UUID@server:port?query#name))
    if (!authorityPart.includes('@')) {
      const decoded = safeBase64Decode(authorityPart);
      if (decoded && decoded.includes('@')) {
        let inner = decoded.trim();
        const innerHashIdx = inner.indexOf('#');
        if (innerHashIdx !== -1) {
          if (name === 'VLESS Node' || !name) {
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

    let userInfo = tryDecodeURIComponent(authorityPart.substring(0, atIndex)).trim();
    const serverPortStr = authorityPart.substring(atIndex + 1).trim();

    // 4. 去除可能存在的 auto: / none: 等前缀 (如 auto:UUID -> UUID)
    if (/^(?:auto|none|zero):/i.test(userInfo)) {
      userInfo = userInfo.replace(/^(?:auto|none|zero):/i, '').trim();
      isAuthorityBase64 = true;
    }
    const uuid = userInfo;

    const ep = parseStrictEndpoint(serverPortStr, 443);
    const server = ep.server;
    const port = ep.port;

    if (!server || !uuid) return null;

    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);

    // 5. 兼容从 Query 参数中读取节点名称 (如 remark=..., remarks=..., title=..., name=...)
    if (name === 'VLESS Node' || !name) {
      const nameFromQuery = q.get('remark', 'remarks', 'title', 'name');
      if (nameFromQuery) {
        name = tryDecodeURIComponent(nameFromQuery).trim() || name;
      }
    }
    q.markRecognized('remark', 'remarks', 'title', 'name');

    const type = (q.get('type', 'net', 'network', 'transport') || 'tcp').toLowerCase().trim();

    // 6. 安全传输与 Reality 识别规范化 (兼容 security=..., tls=1/0/true/false/tls/reality, xtls=..., pbk=...)
    const rawSecurity = q.get('security');
    const rawTls = q.get('tls');
    const rawXtls = q.get('xtls');

    let security = 'none';
    const secCandidate = (rawSecurity || rawTls || '').toLowerCase().trim();
    if (secCandidate === 'reality') {
      security = 'reality';
    } else if (secCandidate === 'tls' || secCandidate === '1' || secCandidate === 'true' || secCandidate === 'xtls') {
      security = 'tls';
    } else if (secCandidate === 'none' || secCandidate === '0' || secCandidate === 'false') {
      security = 'none';
    } else if (secCandidate) {
      const parsedSec = q.getEnum(['tls', 'reality', 'none'], 'security', 'tls');
      if (parsedSec) security = parsedSec;
    }

    if (rawXtls && security === 'none') {
      security = 'tls';
    }

    // 标记已识别旧式/非标准安全参数，防止进入 invalidParams
    q.markRecognized('tls', 'xtls', 'security');

    const rawFlow = q.get('flow');
    let flow: string | undefined = undefined;
    if (rawFlow) {
      flow = q.getEnum(['xtls-rprx-vision', 'xtls-rprx-vision-udp443', 'none'], 'flow');
      if (flow === 'none') flow = undefined;
    }

    const rawPacketEncoding = q.get('packetEncoding', 'packet-encoding', 'packet_encoding', 'packetencoding', 'packet_addr', 'packetaddr', 'packet-addr');
    let packetEncoding: string | undefined = undefined;
    if (rawPacketEncoding) {
      packetEncoding = q.getEnum(['packetaddr', 'xudp'], 'packetEncoding', 'packet-encoding', 'packet_encoding', 'packetencoding', 'packet_addr', 'packetaddr', 'packet-addr');
    }
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
    const isTls = security === 'tls' || isReality;

    const path = q.get('path', 'ws-path', 'ws_path', 'wspath') || (type === 'ws' || type === 'xhttp' ? '/' : undefined);
    const host = q.get('host', 'ws-host', 'ws_host', 'wshost', 'obfs-host', 'obfs_host', 'obfshost');
    const serviceName = q.get('serviceName', 'servicename', 'service-name', 'service_name', 'grpc-service-name', 'grpc_service_name', 'grpcservicename') || (type === 'grpc' ? q.get('path', 'ws-path', 'ws_path', 'wspath') : undefined);
    const mode = q.get('mode', 'grpc-mode', 'grpc_mode', 'grpcmode');
    const extra = q.get('extra');
    const headerType = q.get('headerType', 'headertype', 'header-type', 'header_type');
    const authority = q.get('authority');

    const extras = q.getUnusedExtras();
    const invalidParams = q.getInvalidParams();
    if (ep.error) {
      invalidParams.push({
        key: 'port',
        value: ep.rawPort || '',
        reason: ep.error
      });
    }

    const transport: VlessNode['protocolData']['transport'] = {
      type,
      path,
      headers: host ? { Host: host } : undefined,
      serviceName,
      mode,
      extra,
      headerType,
      authority
    };

    const finalRaw = isAuthorityBase64
      ? `vless://${uuid}@${ep.server}:${ep.port}${queryPart ? '?' + queryPart : ''}#${encodeURIComponent(name)}`
      : urlStr;

    return {
      name,
      protocol: 'vless',
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
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}

