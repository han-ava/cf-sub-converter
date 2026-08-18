// src/parsers/ssr.ts
import { ShadowsocksRNode } from '../types';
import { parseRawQuery, safeBase64Decode, tryDecodeURIComponent } from '../utils';

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
    const port = parseInt(parts[1] || '0', 10);
    const protocol = parts[2] || 'origin';
    const cipher = parts[3] || '';
    const obfs = parts[4] || 'plain';
    const password = safeBase64Decode(parts.slice(5).join(':'));

    if (!server || !port || !cipher || !password) return null;

    let name = 'ShadowsocksR Node';
    let obfsParam = '';
    let protoParam = '';
    const rawQuery = parseRawQuery(queryPart);

    if (queryPart) {
      const qParams = new URLSearchParams(queryPart);
      const remarks = qParams.get('remarks');
      if (remarks) {
        name = safeBase64Decode(remarks) || tryDecodeURIComponent(remarks);
      }
      obfsParam = safeBase64Decode(qParams.get('obfsparam') || '') || qParams.get('obfsparam') || '';
      protoParam = safeBase64Decode(qParams.get('protoparam') || '') || qParams.get('protoparam') || '';
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
      rawQuery,
      protocolData: {
        cipher,
        password,
        protocol,
        obfs,
        obfsParam,
        protoParam,
        extras: {}
      },
      udp: true
    };
  } catch {
    return null;
  }
}
