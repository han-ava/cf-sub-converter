// src/parsers/vmess.ts
import { VmessNode } from '../types';
import { JsonFieldReader, safeBase64Decode, tryDecodeURIComponent } from '../utils';

export function parseVmess(urlStr: string): VmessNode | null {
  try {
    const raw = urlStr.replace(/^vmess:\/\//i, '').trim();
    const decoded = safeBase64Decode(raw);
    if (!decoded) return null;

    const vmess = JSON.parse(decoded);
    if (!vmess || typeof vmess !== 'object') return null;

    const r = new JsonFieldReader(vmess);

    const name = r.getString('ps') ? tryDecodeURIComponent(r.getString('ps')!).trim() : 'VMess Node';
    const server = r.getString('add', 'server') || '';
    const port = r.getStrictInt('port');
    const uuid = r.getString('id', 'uuid') || '';

    // Mark version metadata as recognized
    r.markRecognized('v', 'version');

    const alterId = r.getStrictInt('aid', 'alterId', 'alter_id') ?? 0;
    const cipher = r.getEnum(['auto', 'aes-128-gcm', 'chacha20-poly1305', 'none', 'zero'], 'scy', 'cipher', 'security') || 'auto';
    const net = (r.getString('net', 'network', 'transport') || 'tcp').toLowerCase();

    const rawTls = r.getRaw('tls');
    let tls = false;
    if (rawTls !== undefined && rawTls !== null && rawTls !== '') {
      if (typeof rawTls === 'boolean') {
        tls = rawTls;
      } else {
        const tlsStr = String(rawTls).toLowerCase().trim();
        if (tlsStr === 'tls' || tlsStr === 'true' || tlsStr === '1') {
          tls = true;
        } else if (tlsStr === 'none' || tlsStr === 'false' || tlsStr === '0') {
          tls = false;
        } else {
          r.getStrictBool('tls'); // 触发 invalidFields 收集
        }
      }
    }
    r.markRecognized('tls');

    const sni = r.getString('sni', 'peer', 'servername', 'serverName', 'server-name', 'server_name') || server;
    const fp = r.getString('fp', 'fingerprint', 'client-fingerprint');
    const rawAlpn = r.getRaw('alpn');
    let alpn: string[] | undefined;
    if (Array.isArray(rawAlpn)) {
      alpn = rawAlpn.map(String).map(s => s.trim()).filter(Boolean);
    } else if (typeof rawAlpn === 'string' && rawAlpn) {
      alpn = rawAlpn.split(',').map(s => s.trim()).filter(Boolean);
    }
    r.markRecognized('alpn');

    const allowInsecure = tls ? r.getStrictBool('insecure', 'allowInsecure', 'allow_insecure', 'skip-cert-verify', 'skip_cert_verify') : undefined;
    const packetEncoding = r.getString('packetEncoding', 'packet-encoding', 'packet_encoding');
    const globalPadding = r.getStrictBool('globalPadding', 'global-padding', 'global_padding');
    const authenticatedLength = r.getStrictBool('authenticatedLength', 'authenticated-length', 'authenticated_length');

    const isKcpOrMekya = net === 'mkcp' || net === 'kcp' || net === 'mekya';
    const rawType = r.getString('type');
    const headerType = isKcpOrMekya ? (rawType && rawType !== 'none' ? rawType : undefined) : undefined;

    const path = r.getString('path');
    const host = r.getString('host');
    const serviceName = r.getString('serviceName', 'servicename', 'service-name', 'service_name');

    // mKCP / MeKya fields
    const seed = isKcpOrMekya ? r.getString('seed') : undefined;
    const congestion = isKcpOrMekya ? r.getStrictBool('congestion') : undefined;
    const uplinkCapacity = isKcpOrMekya ? r.getStrictInt('uplink-capacity', 'uplinkCapacity', 'uplink_capacity') : undefined;
    const downlinkCapacity = isKcpOrMekya ? r.getStrictInt('downlink-capacity', 'downlinkCapacity', 'downlink_capacity') : undefined;
    const mtu = isKcpOrMekya ? r.getStrictInt('mtu') : undefined;
    const tti = isKcpOrMekya ? r.getStrictInt('tti') : undefined;
    const writeBuffer = isKcpOrMekya ? r.getStrictInt('write-buffer', 'writeBuffer', 'write_buffer') : undefined;
    const readBuffer = isKcpOrMekya ? r.getStrictInt('read-buffer', 'readBuffer', 'read_buffer', 'read-buff', 'read_buff') : undefined;

    // MeKya fields
    const url = net === 'mekya' ? r.getString('url') : undefined;
    const maxWriteDelay = net === 'mekya' ? r.getStrictInt('max-write-delay', 'maxWriteDelay', 'max_write_delay') : undefined;
    const maxRequestSize = net === 'mekya' ? r.getStrictInt('max-request-size', 'maxRequestSize', 'max_request_size') : undefined;
    const pollingIntervalInitial = net === 'mekya' ? r.getStrictInt('polling-interval-initial', 'pollingIntervalInitial', 'polling_interval_initial') : undefined;
    const h2PoolSize = net === 'mekya' ? r.getStrictInt('h2-pool-size', 'h2PoolSize', 'h2_pool_size') : undefined;

    if (!isKcpOrMekya) {
      r.markRecognized('seed', 'congestion', 'uplink-capacity', 'uplinkCapacity', 'downlink-capacity', 'downlinkCapacity', 'mtu', 'tti', 'write-buffer', 'writeBuffer', 'read-buffer', 'readBuffer', 'read-buff');
    }
    if (net !== 'mekya') {
      r.markRecognized('url', 'max-write-delay', 'maxWriteDelay', 'max-request-size', 'maxRequestSize', 'polling-interval-initial', 'pollingIntervalInitial', 'h2-pool-size', 'h2PoolSize');
    }

    const invalidParams = r.getInvalidFields();
    const extras = r.getUnusedExtras();

    if (!server || !uuid) return null;

    const transport: VmessNode['protocolData']['transport'] = {
      type: net,
      path: path || (net === 'ws' ? '/' : undefined),
      headers: host && net === 'ws' ? { Host: host } : undefined,
      serviceName: net === 'grpc' ? (path || serviceName) : undefined,
      httpHost: (net === 'http' || net === 'h2') && host
        ? host.split(',').map((s: string) => s.trim())
        : undefined,
      httpPath: (net === 'http' || net === 'h2') && path ? [path] : undefined,
      headerType,
      seed,
      congestion,
      uplinkCapacity,
      downlinkCapacity,
      mtu,
      tti,
      writeBuffer,
      readBuffer,
      url,
      maxWriteDelay,
      maxRequestSize,
      pollingIntervalInitial,
      h2PoolSize
    };

    return {
      name,
      protocol: 'vmess',
      server,
      port: port || 443,
      source: { format: 'vmess-json', raw: urlStr },
      protocolData: {
        uuid,
        alterId,
        cipher,
        security: cipher,
        tls,
        sni: tls ? sni : undefined,
        alpn,
        fingerprint: tls ? fp : undefined,
        skipCertVerify: allowInsecure,
        packetEncoding,
        globalPadding,
        authenticatedLength,
        transport,
        rawJson: vmess,
        invalidParams: invalidParams.length > 0 ? invalidParams : undefined,
        extras
      },
      udp: true
    };
  } catch {
    return null;
  }
}
