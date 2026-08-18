// src/adapters/mihomo/vmess.ts
import { AdapterResult, ConversionWarning, VmessNode } from '../../types';
import { parseALPN } from '../../utils';

// Mihomo 官方支持的 VMess 传输协议（metacubex.one/en/config/proxies/vmess）
const SUPPORTED_VMESS_TRANSPORTS = new Set([
  'tcp', 'ws', 'grpc', 'http', 'h2', 'mkcp', 'kcp', 'mekya'
]);

export function adaptVmessToMihomo(node: VmessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Gate: 必需凭据
  if (!p.uuid || !p.uuid.trim()) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VMess UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: '缺少必需的 VMess UUID' }],
      unsupportedParams: ['uuid'] };
  }

  // Gate: 传输协议白名单
  const transportType = (p.transport?.type || 'tcp').toLowerCase();
  if (!SUPPORTED_VMESS_TRANSPORTS.has(transportType)) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `Mihomo 不支持的 VMess 传输协议: [${transportType}]`,
      warnings: [{ level: 'fatal', field: 'transport.type', message: `不支持的 VMess 传输类型: [${transportType}]` }],
      unsupportedParams: ['transport.type'] };
  }

  // mKCP: kcp 规范化为 mkcp
  const normalizedNet = (transportType === 'kcp') ? 'mkcp' : transportType;

  const config: Record<string, any> = {
    name: node.name,
    type: 'vmess',
    server: node.server,
    port: node.port,
    uuid: p.uuid.trim(),
    alterId: p.alterId !== undefined ? p.alterId : 0,
    cipher: p.cipher || 'auto',
    tls: !!p.tls,
    servername: p.sni || node.server,
    network: normalizedNet,
    udp: node.udp !== false
  };

  if (p.skipCertVerify) config['skip-cert-verify'] = true;
  if (p.fingerprint) config['client-fingerprint'] = p.fingerprint;

  const alpn = parseALPN(p.alpn);
  if (alpn && alpn.length > 0) config.alpn = alpn;
  if (p.packetEncoding) config['packet-encoding'] = p.packetEncoding;
  if (p.globalPadding !== undefined) config['global-padding'] = p.globalPadding;
  if (p.authenticatedLength !== undefined) config['authenticated-length'] = p.authenticatedLength;

  const t = p.transport;
  if (t) {
    const net = normalizedNet;

    if (net === 'ws') {
      config['ws-opts'] = { path: t.path || '/', headers: t.headers || {} };

    } else if (net === 'grpc') {
      config['grpc-opts'] = { 'grpc-service-name': t.serviceName || '' };

    } else if (net === 'http') {
      // HTTP 严格映射 http-opts
      config['http-opts'] = {
        path: t.httpPath || (t.path ? [t.path] : ['/']),
        headers: t.httpHost ? { Host: t.httpHost } : undefined
      };

    } else if (net === 'h2') {
      // H2 严格映射 h2-opts（区别于 http-opts）
      config['h2-opts'] = {
        host: t.httpHost || (t.headers?.Host ? [t.headers.Host] : [node.server]),
        path: t.path || t.httpPath?.[0] || '/'
      };

    } else if (net === 'mkcp') {
      // P0-4/P0-5: mkcp-opts 官方字段（metacubex.one/en/config/proxies/transport）
      // mkcp-opts: mtu / tti / uplink-capacity / downlink-capacity / congestion /
      //            write-buffer / read-buff / seed / header: { type }
      const mkcpOpts: Record<string, any> = {};
      if (t.congestion !== undefined) mkcpOpts.congestion = t.congestion;
      if (t.uplinkCapacity !== undefined) mkcpOpts['uplink-capacity'] = t.uplinkCapacity;
      if (t.downlinkCapacity !== undefined) mkcpOpts['downlink-capacity'] = t.downlinkCapacity;
      if (t.seed) mkcpOpts.seed = t.seed;
      if (t.headerType) mkcpOpts.header = { type: t.headerType };

      if (Object.keys(mkcpOpts).length > 0) config['mkcp-opts'] = mkcpOpts;

    } else if (net === 'mekya') {
      // P0-5: mekya-opts 官方结构（metacubex.one/en/config/proxies/transport）
      // mekya-opts: url / max-write-delay / max-request-size /
      //             polling-interval-initial / h2-pool-size / kcp: { ... }
      // MeKya 在 v2ray/xray 协议中无标准 URI 表示，VMess JSON 通常不包含这些字段。
      // Parser 能读到的仅有 seed / headerType（属于 kcp 子项）。
      const mekyaOpts: Record<string, any> = {};

      // kcp 子配置（seed / header 放在 kcp: {} 下）
      const kcpSub: Record<string, any> = {};
      if (t.seed) kcpSub.seed = t.seed;
      if (t.headerType) kcpSub.header = { type: t.headerType };
      if (Object.keys(kcpSub).length > 0) mekyaOpts.kcp = kcpSub;

      if (Object.keys(mekyaOpts).length > 0) config['mekya-opts'] = mekyaOpts;
    }
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({ level: 'warn', field: k,
        message: `参数 [${k}=${v}] 已保留在原始 VMess JSON 中，但 Mihomo 官方无对应字段映射` });
    }
  }

  return { config, fatal: false, lossy: unsupportedParams.length > 0, emitted: true, warnings, unsupportedParams };
}
