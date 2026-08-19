// src/parsers/shadowsocks.ts
import { ShadowsocksNode } from '../types';
import { parseRawQuery, parseStrictEndpoint, QueryParamReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parsePlugin(pluginParam: string): { plugin: string; pluginOpts: Record<string, any> } {
  if (!pluginParam) return { plugin: '', pluginOpts: {} };

  const parts = pluginParam.split(';');
  const plugin = parts[0]?.trim() || '';
  const pluginOpts: Record<string, any> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]?.trim();
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      const key = part.substring(0, eqIdx).trim();
      const rawVal = part.substring(eqIdx + 1).trim();
      pluginOpts[key] = tryDecodeURIComponent(rawVal);
    } else {
      pluginOpts[part] = true;
    }
  }

  return { plugin, pluginOpts };
}

export function parseShadowsocks(urlStr: string): ShadowsocksNode | null {
  try {
    let raw = urlStr.replace(/^ss:\/\//i, '').trim();
    let name = 'Shadowsocks Node';

    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      name = tryDecodeURIComponent(raw.substring(hashIndex + 1)).trim() || 'Shadowsocks Node';
      raw = raw.substring(0, hashIndex);
    }

    let queryPart = '';
    const questionIndex = raw.indexOf('?');
    if (questionIndex !== -1) {
      queryPart = raw.substring(questionIndex + 1);
      raw = raw.substring(0, questionIndex);
    }

    const rawQuery = parseRawQuery(queryPart);
    const q = new QueryParamReader(rawQuery.entries);

    let method = '';
    let password = '';
    let serverPortStr = '';

    if (raw.includes('@')) {
      const atIndex = raw.lastIndexOf('@');
      const userPart = raw.substring(0, atIndex);
      serverPortStr = raw.substring(atIndex + 1);

      let decodedUser = safeBase64Decode(userPart);
      if (!decodedUser || !decodedUser.includes(':')) {
        decodedUser = tryDecodeURIComponent(userPart);
      }

      if (decodedUser && decodedUser.includes(':')) {
        const uParts = decodedUser.split(':');
        method = uParts[0] || '';
        password = uParts.slice(1).join(':');
      }
    } else {
      const decoded = safeBase64Decode(raw);
      if (!decoded) return null;

      const atIndex = decoded.lastIndexOf('@');
      if (atIndex === -1) return null;

      const userPart = decoded.substring(0, atIndex);
      serverPortStr = decoded.substring(atIndex + 1);

      const uParts = userPart.split(':');
      method = uParts[0] || '';
      password = uParts.slice(1).join(':');
    }

    const ep = parseStrictEndpoint(serverPortStr, 8388);
    const server = ep.server;
    const port = ep.port;

    if (!server || !port || !method || !password) return null;

    const pluginParam = q.get('plugin');
    let pluginName: string | undefined;
    let pluginOpts: Record<string, any> | undefined;
    if (pluginParam) {
      const parsed = parsePlugin(pluginParam);
      pluginName = parsed.plugin;
      pluginOpts = parsed.pluginOpts;
    }

    const isSS2022 = method.startsWith('2022-');

    const udpOverTcp = q.getBool('udp-over-tcp', 'udp_over_tcp', 'uot', 'udpovertcp');
    const uotVer = q.getInt('udp-over-tcp-version', 'udp_over_tcp_version', 'uot-version', 'uot_version', 'uotversion');
    const clientFingerprint = q.get('client-fingerprint', 'client_fingerprint', 'clientfingerprint', 'fp', 'fingerprint');
    const smuxBool = q.getBool('smux');
    const smux = smuxBool !== undefined ? { enabled: smuxBool } : undefined;

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
      protocol: 'shadowsocks',
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
        cipher: method,
        password,
        isSS2022,
        plugin: pluginName,
        pluginOpts,
        udpOverTcp,
        udpOverTcpVersion: uotVer,
        clientFingerprint,
        smux,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
