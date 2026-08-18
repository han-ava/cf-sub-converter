// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';
import { parseALPN } from '../../utils';

const SUPPORTED_VLESS_TRANSPORTS = new Set([
  'tcp', 'ws', 'grpc', 'http', 'h2', 'xhttp', 'splithttp'
]);

/**
 * XHTTP extra 顶层标量字段：camelCase → 官方 kebab-case 完整映射表
 * 来源：https://wiki.metacubex.one/en/config/proxies/transport/
 */
const EXTRA_SCALAR_FIELD_MAP: Record<string, string> = {
  'no-grpc-header':          'no-grpc-header',
  'noGRPCHeader':            'no-grpc-header',
  'nogrpcheader':            'no-grpc-header',
  'x-padding-bytes':         'x-padding-bytes',
  'xPaddingBytes':           'x-padding-bytes',
  'x-padding-obfs-mode':     'x-padding-obfs-mode',
  'xPaddingObfsMode':        'x-padding-obfs-mode',
  'x-padding-key':           'x-padding-key',
  'xPaddingKey':             'x-padding-key',
  'x-padding-header':        'x-padding-header',
  'xPaddingHeader':          'x-padding-header',
  'x-padding-placement':     'x-padding-placement',
  'xPaddingPlacement':       'x-padding-placement',
  'x-padding-method':        'x-padding-method',
  'xPaddingMethod':          'x-padding-method',
  'uplink-http-method':      'uplink-http-method',
  'uplinkHttpMethod':        'uplink-http-method',
  'session-placement':       'session-placement',
  'sessionPlacement':        'session-placement',
  'session-key':             'session-key',
  'sessionKey':              'session-key',
  'session-table':           'session-table',
  'sessionTable':            'session-table',
  'session-length':          'session-length',
  'sessionLength':           'session-length',
  'seq-placement':           'seq-placement',
  'seqPlacement':            'seq-placement',
  'seq-key':                 'seq-key',
  'seqKey':                  'seq-key',
  'uplink-data-placement':   'uplink-data-placement',
  'uplinkDataPlacement':     'uplink-data-placement',
  'uplink-data-key':         'uplink-data-key',
  'uplinkDataKey':           'uplink-data-key',
  'uplink-chunk-size':       'uplink-chunk-size',
  'uplinkChunkSize':         'uplink-chunk-size',
  'sc-max-each-post-bytes':  'sc-max-each-post-bytes',
  'scMaxEachPostBytes':      'sc-max-each-post-bytes',
  'sc-min-posts-interval-ms':'sc-min-posts-interval-ms',
  'scMinPostsIntervalMs':    'sc-min-posts-interval-ms',
};

const REUSE_SETTINGS_FIELD_MAP: Record<string, string> = {
  'max-concurrency':         'max-concurrency',
  'maxConcurrency':          'max-concurrency',
  'max-connections':         'max-connections',
  'maxConnections':          'max-connections',
  'c-max-reuse-times':       'c-max-reuse-times',
  'cMaxReuseTimes':          'c-max-reuse-times',
  'h-max-request-times':     'h-max-request-times',
  'hMaxRequestTimes':        'h-max-request-times',
  'h-max-reusable-secs':     'h-max-reusable-secs',
  'hMaxReusableSecs':        'h-max-reusable-secs',
  'h-keep-alive-period':     'h-keep-alive-period',
  'hKeepAlivePeriod':        'h-keep-alive-period',
};

function mapReuseSettings(raw: unknown): { mapped: Record<string, unknown>; unmapped: string[] } {
  if (!raw || typeof raw !== 'object') return { mapped: {}, unmapped: [] };
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const targetKey = REUSE_SETTINGS_FIELD_MAP[k];
    if (targetKey) {
      mapped[targetKey] = v;
    } else {
      unmapped.push(`reuse-settings.${k}`);
    }
  }
  return { mapped, unmapped };
}

const DOWNLOAD_SETTINGS_FIELD_MAP: Record<string, string> = {
  'address':                 'address',
  'port':                    'port',
  'network':                 'network',
  'path':                    'path',
  'host':                    'host',
  'headers':                 'headers',
  'mode':                    'mode',
  'no-grpc-header':          'no-grpc-header',
  'noGRPCHeader':            'no-grpc-header',
  'x-padding-bytes':         'x-padding-bytes',
  'xPaddingBytes':           'x-padding-bytes',
  'tls-settings':            'tls-settings',
  'tlsSettings':             'tls-settings',
  'reuse-settings':          'reuse-settings',
  'reuseSettings':           'reuse-settings',
};

function mapDownloadSettings(raw: unknown): { mapped: Record<string, unknown>; unmapped: string[] } {
  if (!raw || typeof raw !== 'object') return { mapped: {}, unmapped: [] };
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const targetKey = DOWNLOAD_SETTINGS_FIELD_MAP[k];
    if (targetKey === 'reuse-settings') {
      const { mapped: subMapped, unmapped: subUnmapped } = mapReuseSettings(v);
      if (Object.keys(subMapped).length > 0) mapped['reuse-settings'] = subMapped;
      unmapped.push(...subUnmapped.map(u => `download-settings.${u}`));
    } else if (targetKey === 'tls-settings') {
      if (typeof v === 'object' && v !== null) {
        const tlsMapped: Record<string, unknown> = {};
        for (const [tk, tv] of Object.entries(v as Record<string, unknown>)) {
          if (tk === 'serverName' || tk === 'server-name' || tk === 'sni') {
            tlsMapped['server-name'] = tv;
          } else if (tk === 'alpn') {
            tlsMapped['alpn'] = tv;
          } else if (tk === 'fingerprint' || tk === 'fp') {
            tlsMapped['fingerprint'] = tv;
          } else if (tk === 'insecure' || tk === 'allowInsecure' || tk === 'skipCertVerify') {
            tlsMapped['insecure'] = tv;
          } else if (tk === 'realitySettings' || tk === 'reality-settings') {
            if (typeof tv === 'object' && tv !== null) {
              const rMapped: Record<string, unknown> = {};
              for (const [rk, rv] of Object.entries(tv as Record<string, unknown>)) {
                if (rk === 'publicKey' || rk === 'public-key' || rk === 'pbk') rMapped['public-key'] = rv;
                else if (rk === 'shortId' || rk === 'short-id' || rk === 'sid') rMapped['short-id'] = rv;
                else if (rk === 'spiderX' || rk === 'spider-x' || rk === 'spx') rMapped['spider-x'] = rv;
                else unmapped.push(`download-settings.tls-settings.reality-settings.${rk}`);
              }
              tlsMapped['reality-settings'] = rMapped;
            }
          } else {
            unmapped.push(`download-settings.tls-settings.${tk}`);
          }
        }
        mapped['tls-settings'] = tlsMapped;
      } else {
        mapped['tls-settings'] = v;
      }
    } else if (targetKey) {
      mapped[targetKey] = v;
    } else {
      unmapped.push(`download-settings.${k}`);
    }
  }

  return { mapped, unmapped };
}

/**
 * XHTTP extra 解析：把 extra JSON 递归展平到 xhttp-opts，并收集未知/未识别字段
 */
function applyXhttpExtra(
  rawExtra: string | object,
  opts: Record<string, unknown>,
  nodeName: string
): { fatal?: true; skipReason?: string; unmapped: string[] } {

  let extraObj: Record<string, unknown> | null = null;

  if (typeof rawExtra === 'string') {
    const trimmed = rawExtra.trim();
    if (!trimmed.startsWith('{')) {
      return { unmapped: [`xhttp-opts.extra (非 JSON 格式: "${trimmed.slice(0, 40)}")`] };
    }
    try {
      extraObj = JSON.parse(trimmed);
    } catch {
      return {
        fatal: true,
        skipReason: `节点 [${nodeName}] XHTTP extra 字段 JSON 解析失败，无法安全转换`,
        unmapped: ['xhttp-opts.extra']
      };
    }
  } else if (typeof rawExtra === 'object' && rawExtra !== null) {
    extraObj = rawExtra as Record<string, unknown>;
  }

  if (!extraObj) return { unmapped: [] };

  const unmapped: string[] = [];

  for (const [k, v] of Object.entries(extraObj)) {
    if (k === 'reuseSettings' || k === 'reuse-settings') {
      const { mapped, unmapped: subUnmapped } = mapReuseSettings(v);
      if (Object.keys(mapped).length > 0) opts['reuse-settings'] = mapped;
      unmapped.push(...subUnmapped.map(u => `xhttp-opts.${u}`));
    } else if (k === 'downloadSettings' || k === 'download-settings') {
      const { mapped, unmapped: subUnmapped } = mapDownloadSettings(v);
      if (Object.keys(mapped).length > 0) opts['download-settings'] = mapped;
      unmapped.push(...subUnmapped.map(u => `xhttp-opts.${u}`));
    } else {
      const mappedKey = EXTRA_SCALAR_FIELD_MAP[k];
      if (mappedKey) {
        opts[mappedKey] = v;
      } else {
        unmapped.push(`xhttp-opts.extra.${k}`);
      }
    }
  }

  return { unmapped };
}

export function adaptVlessToMihomo(node: VlessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Gate: 必需凭据
  if (!p.uuid || !p.uuid.trim()) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VLESS UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: '缺少必需的 VLESS UUID' }],
      unsupportedParams: ['uuid'] };
  }

  const isReality = p.security === 'reality' || !!p.realityOpts;
  const isTls = p.security === 'tls' || isReality;

  // Gate: Reality 必须携带 pbk
  if (isReality && (!p.realityOpts?.publicKey || !p.realityOpts.publicKey.trim())) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 声明了 Reality 但缺少必需的 pbk (Public Key)`,
      warnings: [{ level: 'fatal', field: 'reality-opts.public-key', message: '缺少必需的 Reality pbk' }],
      unsupportedParams: ['reality-opts.public-key'] };
  }

  const rawTransportType = (p.transport?.type || 'tcp').toLowerCase();

  // Gate: 不支持的传输层
  if (!SUPPORTED_VLESS_TRANSPORTS.has(rawTransportType)) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `Mihomo 不支持的 VLESS 传输协议: [${rawTransportType}]`,
      warnings: [{ level: 'fatal', field: 'transport.type', message: `不支持的传输协议: [${rawTransportType}]` }],
      unsupportedParams: ['transport.type'] };
  }

  // P0-3: splithttp 规范化为 xhttp
  const transportType = rawTransportType === 'splithttp' ? 'xhttp' : rawTransportType;

  const config: Record<string, any> = {
    name: node.name,
    type: 'vless',
    server: node.server,
    port: node.port,
    uuid: p.uuid.trim(),
    network: transportType,
    udp: node.udp !== false
  };

  if (p.flow) config.flow = p.flow;
  if (p.packetEncoding) config['packet-encoding'] = p.packetEncoding;
  if (p.encryption) config.encryption = p.encryption;

  // P1: 仅在 TLS/Reality 为真时输出 TLS 相关字段，避免 tls=false 产生假 servername
  if (isTls) {
    config.tls = true;
    config.servername = p.sni || node.server;
    if (p.fingerprint) config['client-fingerprint'] = p.fingerprint;
    const alpn = parseALPN(p.alpn);
    if (alpn && alpn.length > 0) config.alpn = alpn;
    if (p.skipCertVerify) config['skip-cert-verify'] = true;

    if (isReality && p.realityOpts?.publicKey) {
      config['reality-opts'] = {
        'public-key': p.realityOpts.publicKey.trim(),
        'short-id': p.realityOpts.shortId || '',
        'spider-x': p.realityOpts.spiderX || ''
      };
    }
  }

  const t = p.transport;
  if (t) {
    const net = transportType;
    if (net === 'ws') {
      config['ws-opts'] = { path: t.path || '/', headers: t.headers || {} };
    } else if (net === 'grpc') {
      config['grpc-opts'] = { 'grpc-service-name': t.serviceName || '' };
    } else if (net === 'xhttp') {
      const xhttpOpts: Record<string, unknown> = {};
      if (t.path) xhttpOpts.path = t.path;
      if (t.headers?.Host) xhttpOpts.host = t.headers.Host;
      if (t.mode) xhttpOpts.mode = t.mode;

      if (t.extra) {
        const extraRes = applyXhttpExtra(t.extra, xhttpOpts, node.name);
        if (extraRes.fatal) {
          return { fatal: true, lossy: true, emitted: false,
            skipReason: extraRes.skipReason || 'XHTTP extra 无法安全解析',
            warnings: [{ level: 'fatal', field: 'xhttp-opts.extra', message: extraRes.skipReason || 'XHTTP extra 无法安全解析' }],
            unsupportedParams: ['xhttp-opts.extra'] };
        }
        // P0: 未知/未映射 extra 字段不允许静默丢弃，记录 warning + unsupportedParams (lossy=true)
        if (extraRes.unmapped && extraRes.unmapped.length > 0) {
          for (const item of extraRes.unmapped) {
            unsupportedParams.push(item);
            warnings.push({
              level: 'warn',
              field: item,
              message: `XHTTP extra 中包含未映射字段 [${item}]，可能影响连接行为`
            });
          }
        }
      }

      if (Object.keys(xhttpOpts).length > 0) config['xhttp-opts'] = xhttpOpts;
    } else if (net === 'http') {
      config['http-opts'] = {
        path: [t.path || '/'],
        headers: t.headers?.Host ? { Host: [t.headers.Host] } : undefined
      };
    } else if (net === 'h2') {
      config['h2-opts'] = {
        host: t.headers?.Host ? [t.headers.Host] : [node.server],
        path: t.path || '/'
      };
    }
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({ level: 'warn', field: k,
        message: `参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射` });
    }
  }

  return { config, fatal: false, lossy: unsupportedParams.length > 0, emitted: true, warnings, unsupportedParams };
}
