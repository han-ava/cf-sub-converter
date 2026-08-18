// src/parsers/vmess.ts
import { VmessNode } from '../types';
import { safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parseVmess(urlStr: string): VmessNode | null {
  try {
    const raw = urlStr.replace('vmess://', '').trim();
    const decoded = safeBase64Decode(raw);
    if (!decoded) return null;

    const vmess = JSON.parse(decoded);
    if (!vmess || typeof vmess !== 'object') return null;

    const name = vmess.ps ? tryDecodeURIComponent(String(vmess.ps)).trim() : 'VMess Node';
    const server = String(vmess.add || '').trim();
    const port = typeof vmess.port === 'number' ? vmess.port : parseInt(String(vmess.port), 10);
    const uuid = String(vmess.id || '').trim();

    if (!server || !port || !uuid) return null;

    let alterId = 0;
    if (vmess.aid !== undefined && vmess.aid !== null && vmess.aid !== '') {
      const parsedAid = parseInt(String(vmess.aid), 10);
      if (!isNaN(parsedAid)) {
        alterId = parsedAid;
      }
    }

    const net = (vmess.net || 'tcp').toLowerCase();
    const tls = vmess.tls === 'tls' || vmess.tls === true || vmess.tls === '1';
    const sni = vmess.sni || vmess.host || server;
    const fp = vmess.fp || undefined;
    const alpnStr = vmess.alpn;
    const alpn = alpnStr ? (Array.isArray(alpnStr) ? alpnStr : String(alpnStr).split(',').map(s => s.trim())) : undefined;
    const allowInsecure = tls && (vmess.insecure === '1' || vmess.insecure === 1 || vmess.insecure === true || vmess.allowInsecure === true || vmess.skipCertVerify === true);

    const transport: VmessNode['protocolData']['transport'] = {
      type: net,
      path: vmess.path || (net === 'ws' ? '/' : undefined),
      headers: vmess.host ? { Host: vmess.host } : undefined,
      serviceName: net === 'grpc' ? vmess.path : undefined,
      httpHost: (net === 'http' || net === 'h2') && vmess.host ? (typeof vmess.host === 'string' ? vmess.host.split(',').map((s: string) => s.trim()) : vmess.host) : undefined,
      httpPath: (net === 'http' || net === 'h2') && vmess.path ? [vmess.path] : undefined
    };

    const extras: Record<string, unknown> = {};
    const knownKeys = new Set(['v', 'ps', 'add', 'port', 'id', 'aid', 'scy', 'net', 'type', 'host', 'path', 'tls', 'sni', 'alpn', 'fp', 'insecure', 'allowInsecure', 'skipCertVerify', 'packetEncoding', 'globalPadding', 'authenticatedLength']);
    for (const [k, v] of Object.entries(vmess)) {
      if (!knownKeys.has(k)) {
        extras[k] = v;
      }
    }

    return {
      name,
      protocol: 'vmess',
      server,
      port,
      source: {
        format: 'vmess-json',
        raw: urlStr
      },
      protocolData: {
        uuid,
        alterId,
        cipher: vmess.scy || 'auto',
        security: vmess.scy || 'auto',
        tls,
        sni: tls ? sni : undefined,
        alpn,
        fingerprint: tls ? fp : undefined,
        skipCertVerify: allowInsecure,
        packetEncoding: vmess.packetEncoding || vmess['packet-encoding'],
        globalPadding: vmess['global-padding'] ?? vmess.globalPadding,
        authenticatedLength: vmess['authenticated-length'] ?? vmess.authenticatedLength,
        transport,
        rawJson: vmess,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
