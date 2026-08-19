// src/parsers/ssr.ts
import { ShadowsocksRNode } from '../types';
import { parseRawQuery, QueryParamReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parseShadowsocksR(urlStr: string): ShadowsocksRNode | null {
  try {
    const raw = urlStr.replace('ssr://', '').trim();
    const decoded = safeBase64Decode(raw);
    if (!decoded) return null;

    const slashIndex = decoded.indexOf('/?');
    const mainPart = slashIndex !== -1 ? decoded.substring(0, slashIndex) : decoded;
    const queryPart = slashIndex !== -1 ? decoded.substring(slashIndex + 2) : '';

    const parts = mainPart.split(':');
    if (parts.length < 6) return null;

    const server = parts[0] || '';
    const rawPort = parts[1] || '';
    let port = 0;
    let portError: string | undefined;
    if (!/^\d+$/.test(rawPort.trim())) {
      portError = `端口 [${rawPort}] 不是合法的纯数字整数`;
      port = 8388;
    } else {
      port = parseInt(rawPort.trim(), 10);
      if (port < 1 || port > 65535) {
        portError = `端口 [${port}] 超出合法范围 (1-65535)`;
      }
    }
    const protocol = parts[2] || 'origin';
    const cipher = parts[3] || '';
    const obfs = parts[4] || 'plain';
    const password = safeBase64Decode(parts.slice(5).join(':'));

    if (!server || !cipher || !password) return null;

    let name = 'ShadowsocksR Node';
    let obfsParam = '';
    let protoParam = '';
    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);

    if (rawQuery.entries.length > 0) {
      const remarks = q.get('remarks');
      if (remarks) {
        name = safeBase64Decode(remarks) || tryDecodeURIComponent(remarks);
      }
      const rawObfs = q.get('obfsparam', 'obfs_param', 'obfs-param', 'obfsParam');
      if (rawObfs) {
        obfsParam = safeBase64Decode(rawObfs) || rawObfs;
      }
      const rawProto = q.get('protoparam', 'proto_param', 'proto-param', 'protoParam');
      if (rawProto) {
        protoParam = safeBase64Decode(rawProto) || rawProto;
      }
    }

    const extras = q.getUnusedExtras();
    const invalidParams = q.getInvalidParams();
    if (portError) {
      invalidParams.push({
        key: 'port',
        value: rawPort,
        reason: portError
      });
    }

    return {
      name,
      protocol: 'ssr',
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
        cipher,
        password,
        protocol,
        obfs,
        obfsParam,
        protoParam,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
