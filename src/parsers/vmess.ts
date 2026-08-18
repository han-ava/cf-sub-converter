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
      if (!isNaN(parsedAid)) alterId = parsedAid;
    }

    const net = (vmess.net || 'tcp').toLowerCase();
    const tls = vmess.tls === 'tls' || vmess.tls === true || vmess.tls === '1';
    const sni = vmess.sni || vmess.host || server;
    const fp = vmess.fp || undefined;
    const alpnStr = vmess.alpn;
    const alpn = alpnStr ? (Array.isArray(alpnStr) ? alpnStr : String(alpnStr).split(',').map((s: string) => s.trim())) : undefined;
    const allowInsecure = tls && (vmess.insecure === '1' || vmess.insecure === 1 || vmess.insecure === true || vmess.allowInsecure === true || vmess.skipCertVerify === true);

    const isKcpOrMekya = net === 'mkcp' || net === 'kcp' || net === 'mekya';

    // VMess JSON "type" field is the header type for mKCP/MeKya; for other transports it means obfs type
    // For mKCP/MeKya: "type" → headerType (e.g. "wechat-video", "dtls", "utp", "srtp", "wireguard", "none")
    const headerType = isKcpOrMekya
      ? (vmess.type && vmess.type !== 'none' ? String(vmess.type) : undefined)
      : undefined;

    const transport: VmessNode['protocolData']['transport'] = {
      type: net,
      path: vmess.path || (net === 'ws' ? '/' : undefined),
      headers: vmess.host && net === 'ws' ? { Host: vmess.host } : undefined,
      serviceName: net === 'grpc' ? (vmess.path || vmess.serviceName) : undefined,
      httpHost: (net === 'http' || net === 'h2') && vmess.host
        ? (typeof vmess.host === 'string' ? vmess.host.split(',').map((s: string) => s.trim()) : vmess.host)
        : undefined,
      httpPath: (net === 'http' || net === 'h2') && vmess.path ? [vmess.path] : undefined,
      // mKCP / MeKya specific fields
      headerType,
      seed: isKcpOrMekya ? (vmess.seed || undefined) : undefined,
      congestion: isKcpOrMekya ? (vmess.congestion ?? undefined) : undefined,
      uplinkCapacity: isKcpOrMekya ? (typeof vmess['uplink-capacity'] === 'number' ? vmess['uplink-capacity'] : (typeof vmess.uplinkCapacity === 'number' ? vmess.uplinkCapacity : (vmess['uplink-capacity'] || vmess.uplinkCapacity ? parseInt(String(vmess['uplink-capacity'] || vmess.uplinkCapacity), 10) : undefined))) : undefined,
      downlinkCapacity: isKcpOrMekya ? (typeof vmess['downlink-capacity'] === 'number' ? vmess['downlink-capacity'] : (typeof vmess.downlinkCapacity === 'number' ? vmess.downlinkCapacity : (vmess['downlink-capacity'] || vmess.downlinkCapacity ? parseInt(String(vmess['downlink-capacity'] || vmess.downlinkCapacity), 10) : undefined))) : undefined,
      mtu: isKcpOrMekya ? (typeof vmess.mtu === 'number' ? vmess.mtu : (vmess.mtu ? parseInt(String(vmess.mtu), 10) : undefined)) : undefined,
      tti: isKcpOrMekya ? (typeof vmess.tti === 'number' ? vmess.tti : (vmess.tti ? parseInt(String(vmess.tti), 10) : undefined)) : undefined,
      writeBuffer: isKcpOrMekya ? (typeof vmess['write-buffer'] === 'number' ? vmess['write-buffer'] : (typeof vmess.writeBuffer === 'number' ? vmess.writeBuffer : (vmess['write-buffer'] || vmess.writeBuffer ? parseInt(String(vmess['write-buffer'] || vmess.writeBuffer), 10) : undefined))) : undefined,
      readBuffer: isKcpOrMekya ? (typeof vmess['read-buffer'] === 'number' ? vmess['read-buffer'] : (typeof vmess['read-buff'] === 'number' ? vmess['read-buff'] : (typeof vmess.readBuffer === 'number' ? vmess.readBuffer : (vmess['read-buffer'] || vmess['read-buff'] || vmess.readBuffer ? parseInt(String(vmess['read-buffer'] || vmess['read-buff'] || vmess.readBuffer), 10) : undefined)))) : undefined,
      // MeKya specific fields
      url: net === 'mekya' ? (vmess.url ? String(vmess.url) : undefined) : undefined,
      maxWriteDelay: net === 'mekya' ? (typeof vmess['max-write-delay'] === 'number' ? vmess['max-write-delay'] : (typeof vmess.maxWriteDelay === 'number' ? vmess.maxWriteDelay : (vmess['max-write-delay'] || vmess.maxWriteDelay ? parseInt(String(vmess['max-write-delay'] || vmess.maxWriteDelay), 10) : undefined))) : undefined,
      maxRequestSize: net === 'mekya' ? (typeof vmess['max-request-size'] === 'number' ? vmess['max-request-size'] : (typeof vmess.maxRequestSize === 'number' ? vmess.maxRequestSize : (vmess['max-request-size'] || vmess.maxRequestSize ? parseInt(String(vmess['max-request-size'] || vmess.maxRequestSize), 10) : undefined))) : undefined,
      pollingIntervalInitial: net === 'mekya' ? (typeof vmess['polling-interval-initial'] === 'number' ? vmess['polling-interval-initial'] : (typeof vmess.pollingIntervalInitial === 'number' ? vmess.pollingIntervalInitial : (vmess['polling-interval-initial'] || vmess.pollingIntervalInitial ? parseInt(String(vmess['polling-interval-initial'] || vmess.pollingIntervalInitial), 10) : undefined))) : undefined,
      h2PoolSize: net === 'mekya' ? (typeof vmess['h2-pool-size'] === 'number' ? vmess['h2-pool-size'] : (typeof vmess.h2PoolSize === 'number' ? vmess.h2PoolSize : (vmess['h2-pool-size'] || vmess.h2PoolSize ? parseInt(String(vmess['h2-pool-size'] || vmess.h2PoolSize), 10) : undefined))) : undefined,
    };

    // Known keys that are explicitly parsed — must include all transport-type-specific keys
    // so they don't accidentally end up in extras
    const knownKeys = new Set([
      'v', 'ps', 'add', 'port', 'id', 'aid', 'scy', 'net', 'type', 'host', 'path',
      'tls', 'sni', 'alpn', 'fp', 'insecure', 'allowInsecure', 'skipCertVerify',
      'packetEncoding', 'globalPadding', 'authenticatedLength',
      'packet-encoding', 'global-padding', 'authenticated-length',
      // mKCP / MeKya
      'seed', 'congestion', 'uplink-capacity', 'uplinkCapacity', 'downlink-capacity', 'downlinkCapacity',
      'mtu', 'tti', 'write-buffer', 'writeBuffer', 'read-buff', 'read-buffer', 'readBuffer',
      // MeKya
      'url', 'max-write-delay', 'maxWriteDelay', 'max-request-size', 'maxRequestSize',
      'polling-interval-initial', 'pollingIntervalInitial', 'h2-pool-size', 'h2PoolSize',
      'serviceName',
    ]);

    const extras: Record<string, unknown> = {};
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
      source: { format: 'vmess-json', raw: urlStr },
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
