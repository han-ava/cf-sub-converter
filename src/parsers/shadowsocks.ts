// src/parsers/shadowsocks.ts
import { ShadowsocksNode } from '../types';
import { parseRawQuery, QueryParamReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parsePlugin(pluginParam: string): { plugin: string; pluginOpts: Record<string, any> } {
  if (!pluginParam) return { plugin: '', pluginOpts: {} };

  const parts = pluginParam.split(';');
  const plugin = parts[0] || '';
  const pluginOpts: Record<string, any> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]?.trim();
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      const key = part.substring(0, eqIdx).trim();
      const val = part.substring(eqIdx + 1).trim();
      if (val === 'true') pluginOpts[key] = true;
      else if (val === 'false') pluginOpts[key] = false;
      else if (!isNaN(Number(val)) && val !== '') pluginOpts[key] = Number(val);
      else pluginOpts[key] = tryDecodeURIComponent(val);
    } else {
      pluginOpts[part] = true;
    }
  }

  return { plugin, pluginOpts };
}

export function parseShadowsocks(urlStr: string): ShadowsocksNode | null {
  try {
    let raw = urlStr.replace('ss://', '').trim();
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
    let server = '';
    let port = 0;

    if (raw.includes('@')) {
      const atIndex = raw.lastIndexOf('@');
      const userPart = raw.substring(0, atIndex);
      const serverPart = raw.substring(atIndex + 1);

      if (serverPart.startsWith('[')) {
        const closingBracket = serverPart.indexOf(']');
        if (closingBracket !== -1) {
          server = serverPart.substring(1, closingBracket);
          const portPart = serverPart.substring(closingBracket + 1);
          port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 0;
        }
      } else {
        const colonIndex = serverPart.lastIndexOf(':');
        if (colonIndex !== -1) {
          server = serverPart.substring(0, colonIndex);
          port = parseInt(serverPart.substring(colonIndex + 1), 10) || 0;
        }
      }

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
      const serverPart = decoded.substring(atIndex + 1);

      if (serverPart.startsWith('[')) {
        const closingBracket = serverPart.indexOf(']');
        if (closingBracket !== -1) {
          server = serverPart.substring(1, closingBracket);
          const portPart = serverPart.substring(closingBracket + 1);
          port = parseInt(portPart.startsWith(':') ? portPart.substring(1) : portPart, 10) || 0;
        }
      } else {
        const colonIndex = serverPart.lastIndexOf(':');
        if (colonIndex !== -1) {
          server = serverPart.substring(0, colonIndex);
          port = parseInt(serverPart.substring(colonIndex + 1), 10) || 0;
        }
      }

      const uParts = userPart.split(':');
      method = uParts[0] || '';
      password = uParts.slice(1).join(':');
    }

    if (!server || !port || !method || !password) return null;

    if (server.startsWith('[') && server.endsWith(']')) {
      server = server.slice(1, -1);
    }

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
    const smuxParam = q.get('smux');

    const extras = q.getUnusedExtras();

    return {
      name,
      protocol: 'shadowsocks',
      server,
      port,
      source: {
        format: 'uri',
        raw: urlStr
      },
      rawQuery,
      protocolData: {
        cipher: method,
        password,
        isSS2022,
        plugin: pluginName,
        pluginOpts,
        udpOverTcp,
        udpOverTcpVersion: uotVer,
        clientFingerprint,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
