// src/parsers/clash.ts
import { NodeEnvelope } from '../types';

export function parseClashProxy(p: Record<string, any>): NodeEnvelope | null {
  if (!p || typeof p !== 'object' || !p.name || !p.server || !p.port) {
    return null;
  }

  const name = String(p.name);
  const server = String(p.server);
  const port = Number(p.port);
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
