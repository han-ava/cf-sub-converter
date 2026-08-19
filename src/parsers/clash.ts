// src/parsers/clash.ts
import { NodeEnvelope } from '../types';

export function parseClashProxy(p: Record<string, any>): NodeEnvelope | null {
  if (!p || typeof p !== 'object') {
    return null;
  }

  if (p.name === undefined || p.name === null || p.name === '') {
    return null;
  }

  if (!p.server || p.port === undefined || p.port === null || p.port === '') {
    return null;
  }

  const port = Number(p.port);
  if (isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }

  const name = String(p.name);
  const server = String(p.server);
  const type = String(p.type || 'ss').toLowerCase();

  // 严格原样保存，严禁任何 tryDecodeURIComponent
  const protocolData = { ...p };

  return {
    name,
    protocol: type,
    server,
    port,
    source: {
      format: 'clash',
      raw: ''
    },
    protocolData,
    udp: p.udp !== false
  } as NodeEnvelope;
}
