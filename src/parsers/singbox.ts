// src/parsers/singbox.ts
import { NodeEnvelope } from '../types';

export function parseSingboxOutbound(
  ob: Record<string, any>,
  configId?: string,
  nativeOutboundTags?: string[]
): NodeEnvelope | null {
  if (!ob || typeof ob !== 'object' || !ob.server) {
    return null;
  }

  const type = String(ob.type || 'ss').toLowerCase();
  const rawPort = ob.server_port ?? ob.port;
  if ((rawPort === undefined || rawPort === null || rawPort === '') && type !== 'ssh') {
    return null;
  }
  const server = String(ob.server);
  const port = type === 'ssh' && (!rawPort || Number(rawPort) === 0) ? 22 : Number(rawPort);
  const name = String(ob.tag || ob.name || `${type} ${server}:${port}`);

  // 严格原样保存，严禁任何 tryDecodeURIComponent
  const protocolData = { ...ob };

  return {
    name,
    protocol: type,
    server,
    port,
    source: {
      format: 'singbox',
      raw: '',
      configId,
      nativeOutboundTags: nativeOutboundTags
        ? [...nativeOutboundTags]
        : typeof ob.tag === 'string'
        ? [ob.tag]
        : undefined
    },
    protocolData,
    udp: true
  } as NodeEnvelope;
}
