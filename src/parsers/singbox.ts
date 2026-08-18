// src/parsers/singbox.ts
import { NodeEnvelope } from '../types';

export function parseSingboxOutbound(ob: Record<string, any>): NodeEnvelope | null {
  if (!ob || typeof ob !== 'object' || (!ob.tag && !ob.name) || !ob.server || (!ob.server_port && !ob.port)) {
    return null;
  }

  const name = String(ob.tag || ob.name);
  const server = String(ob.server);
  const port = Number(ob.server_port || ob.port);
  const type = String(ob.type || 'ss').toLowerCase();

  // 严格原样保存，严禁任何 tryDecodeURIComponent
  const protocolData = { ...ob };

  return {
    name,
    protocol: type,
    server,
    port,
    source: {
      format: 'singbox',
      raw: ''
    },
    protocolData,
    udp: true
  } as NodeEnvelope;
}
