// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';
import { parseALPN, detectUnmappedFields, processInvalidParams } from '../../utils';

const SUPPORTED_VLESS_TRANSPORTS = new Set([
  'tcp', 'ws', 'grpc', 'http', 'h2', 'xhttp', 'splithttp'
]);

/**
 * XHTTP extra 顶层标量字段：Xray 实际字段名 + 官方 kebab-case 完整映射表
 * 来源：Xray-core infra/conf/transport_method.go & Mihomo transport docs
 */
const EXTRA_SCALAR_FIELD_MAP: Record<string, string> = {
  // no-grpc-header
  'no-grpc-header':          'no-grpc-header',
  'noGRPCHeader':            'no-grpc-header',
  'nogrpcheader':            'no-grpc-header',
  // x-padding-bytes
  'x-padding-bytes':         'x-padding-bytes',
  'xPaddingBytes':           'x-padding-bytes',
  'xpaddingbytes':           'x-padding-bytes',
  // x-padding options
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
  // uplink-http-method (Xray 真实使用 uplinkHTTPMethod)
  'uplink-http-method':      'uplink-http-method',
  'uplinkHTTPMethod':        'uplink-http-method',
  'uplinkHttpMethod':        'uplink-http-method',
  // session-placement (Xray 真实使用 sessionIDPlacement)
  'session-placement':       'session-placement',
  'sessionPlacement':        'session-placement',
  'sessionIDPlacement':      'session-placement',
  'sessionIdPlacement':      'session-placement',
  'sessionidplacement':      'session-placement',
  // session-key (Xray 真实使用 sessionIDKey)
  'session-key':             'session-key',
  'sessionKey':              'session-key',
  'sessionIDKey':            'session-key',
  'sessionIdKey':            'session-key',
  'sessionidkey':            'session-key',
  // session-table (Xray 真实使用 sessionIDTable)
  'session-table':           'session-table',
  'sessionTable':            'session-table',
  'sessionIDTable':          'session-table',
  'sessionIdTable':          'session-table',
  'sessionidtable':          'session-table',
  // session-length (Xray 真实使用 sessionIDLength)
  'session-length':          'session-length',
  'sessionLength':           'session-length',
  'sessionIDLength':         'session-length',
  'sessionIdLength':         'session-length',
  'sessionidlength':         'session-length',
  // seq-placement
  'seq-placement':           'seq-placement',
  'seqPlacement':            'seq-placement',
  'seqIDPlacement':          'seq-placement',
  'seqIdPlacement':          'seq-placement',
  // seq-key
  'seq-key':                 'seq-key',
  'seqKey':                  'seq-key',
  'seqIDKey':                'seq-key',
  'seqIdKey':                'seq-key',
  // uplink-data options
  'uplink-data-placement':   'uplink-data-placement',
  'uplinkDataPlacement':     'uplink-data-placement',
  'uplink-data-key':         'uplink-data-key',
  'uplinkDataKey':           'uplink-data-key',
  'uplink-chunk-size':       'uplink-chunk-size',
  'uplinkChunkSize':         'uplink-chunk-size',
  // sc options
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

/**
 * Xray StreamSettings downloadSettings -> Mihomo download-settings 专属语义转换器
 * 禁止输出 Xray 专属命名：address / network / tlsSettings / realitySettings / xhttpSettings / xmux
 * 转换为 Mihomo 官方字段：server / port / tls / servername / client-fingerprint / reality-opts / path / host / reuse-settings
 */
function mapXrayDownloadSettingsToMihomo(
  raw: unknown,
  nodeName: string
): { mapped: Record<string, unknown>; fatal?: true; skipReason?: string; unmapped: string[] } {
  if (!raw || typeof raw !== 'object') return { mapped: {}, unmapped: [] };
  const input = raw as Record<string, unknown>;
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];

  for (const [k, v] of Object.entries(input)) {
    // 1. address -> server
    if (k === 'address' || k === 'server') {
      mapped.server = String(v);
    }
    // 2. port -> port
    else if (k === 'port') {
      mapped.port = typeof v === 'number' ? v : parseInt(String(v), 10);
    }
    // 3. security -> tls: true
    else if (k === 'security') {
      const sec = String(v).toLowerCase();
      if (sec === 'tls') {
        mapped.tls = true;
        // 显式清除继承的 reality-opts (Reality 上行 -> TLS 下行)
        delete mapped['reality-opts'];
      } else if (sec === 'reality') {
        mapped.tls = true;
      } else if (sec === 'none') {
        delete mapped.tls;
        delete mapped['reality-opts'];
      } else {
        unmapped.push(`download-settings.security.${v}`);
      }
    }
    else if (k === 'tls') {
      if (v) mapped.tls = true;
    }
    // 4. network -> 校验下行传输协议：如果是非 xhttp/splithttp/tcp 等 Mihomo 无法表达的独立传输，严格 fatal
    else if (k === 'network') {
      const net = String(v).toLowerCase();
      if (net === 'xhttp' || net === 'splithttp' || net === 'tcp' || net === '') {
        // 允许的下行传输类型
      } else {
        return {
          mapped: {},
          fatal: true,
          skipReason: `节点 [${nodeName}] downloadSettings 声明了 Mihomo 无法支持的独立下行传输协议: [${v}]`,
          unmapped: []
        };
      }
    }
    // 5. Xray tlsSettings 展开到顶层字段
    else if (k === 'tlsSettings' || k === 'tls-settings') {
      if (typeof v === 'object' && v !== null) {
        mapped.tls = true;
        const tlsObj = v as Record<string, unknown>;
        for (const [tk, tv] of Object.entries(tlsObj)) {
          if (tk === 'serverName' || tk === 'server-name' || tk === 'sni' || tk === 'servername') {
            mapped.servername = String(tv);
          } else if (tk === 'fingerprint' || tk === 'fp' || tk === 'client-fingerprint' || tk === 'clientFingerprint') {
            mapped['client-fingerprint'] = String(tv);
          } else if (tk === 'alpn') {
            const alpn = parseALPN(tv as string | string[]);
            if (alpn && alpn.length > 0) mapped.alpn = alpn;
          } else if (tk === 'allowInsecure' || tk === 'insecure' || tk === 'skipCertVerify' || tk === 'skip-cert-verify') {
            if (tv) mapped['skip-cert-verify'] = true;
          } else if (tk === 'realitySettings' || tk === 'reality-settings' || tk === 'realityOpts' || tk === 'reality-opts') {
            if (typeof tv === 'object' && tv !== null) {
              const rObj = tv as Record<string, unknown>;
              const rMapped: Record<string, string> = {};
              const pbk = rObj.publicKey || rObj['public-key'] || rObj.pbk;
              if (pbk) rMapped['public-key'] = String(pbk).trim();
              const sid = rObj.shortId || rObj['short-id'] || rObj.sid;
              if (sid !== undefined) rMapped['short-id'] = String(sid);
              const spx = rObj.spiderX || rObj['spider-x'] || rObj.spx;
              if (spx !== undefined) rMapped['spider-x'] = String(spx);

              if (!rMapped['public-key']) {
                return {
                  mapped: {},
                  fatal: true,
                  skipReason: `节点 [${nodeName}] downloadSettings 中的 Reality 缺少必需的 publicKey (pbk)`,
                  unmapped: []
                };
              }
              mapped['reality-opts'] = rMapped;
            }
          } else {
            unmapped.push(`download-settings.tlsSettings.${tk}`);
          }
        }
      }
    }
    // 6. Xray realitySettings 展开到 reality-opts
    else if (k === 'realitySettings' || k === 'reality-settings' || k === 'realityOpts' || k === 'reality-opts') {
      if (typeof v === 'object' && v !== null) {
        mapped.tls = true;
        const rObj = v as Record<string, unknown>;
        const rMapped: Record<string, string> = {};
        const pbk = rObj.publicKey || rObj['public-key'] || rObj.pbk;
        if (pbk) rMapped['public-key'] = String(pbk).trim();
        const sid = rObj.shortId || rObj['short-id'] || rObj.sid;
        if (sid !== undefined) rMapped['short-id'] = String(sid);
        const spx = rObj.spiderX || rObj['spider-x'] || rObj.spx;
        if (spx !== undefined) rMapped['spider-x'] = String(spx);

        if (!rMapped['public-key']) {
          return {
            mapped: {},
            fatal: true,
            skipReason: `节点 [${nodeName}] downloadSettings 中的 Reality 缺少必需的 publicKey (pbk)`,
            unmapped: []
          };
        }
        mapped['reality-opts'] = rMapped;
      }
    }
    // 7. Xray xhttpSettings 展开到顶层
    else if (k === 'xhttpSettings' || k === 'xhttp-settings') {
      if (typeof v === 'object' && v !== null) {
        const xObj = v as Record<string, unknown>;
        for (const [xk, xv] of Object.entries(xObj)) {
          if (xk === 'path') mapped.path = String(xv);
          else if (xk === 'host') mapped.host = String(xv);
          else if (xk === 'headers') mapped.headers = xv;
          else if (xk === 'mode') mapped.mode = String(xv);
          else if (xk === 'noGRPCHeader' || xk === 'no-grpc-header') mapped['no-grpc-header'] = xv;
          else if (xk === 'xPaddingBytes' || xk === 'x-padding-bytes') mapped['x-padding-bytes'] = xv;
          else if (xk === 'extra') {
            if (typeof xv === 'object' && xv !== null) {
              const extraSub = xv as Record<string, unknown>;
              for (const [esk, esv] of Object.entries(extraSub)) {
                if (esk === 'xmux' || esk === 'reuseSettings' || esk === 'reuse-settings') {
                  const { mapped: subReuse, unmapped: subU } = mapReuseSettings(esv);
                  if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
                  unmapped.push(...subU.map(u => `download-settings.xhttpSettings.extra.${u}`));
                } else {
                  const mappedKey = EXTRA_SCALAR_FIELD_MAP[esk];
                  if (mappedKey) {
                    mapped[mappedKey] = esv;
                  } else {
                    unmapped.push(`download-settings.xhttpSettings.extra.${esk}`);
                  }
                }
              }
            } else if (typeof xv === 'string') {
              try {
                const parsedExtra = JSON.parse(xv);
                if (typeof parsedExtra === 'object' && parsedExtra !== null) {
                  for (const [esk, esv] of Object.entries(parsedExtra)) {
                    if (esk === 'xmux' || esk === 'reuseSettings' || esk === 'reuse-settings') {
                      const { mapped: subReuse, unmapped: subU } = mapReuseSettings(esv);
                      if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
                      unmapped.push(...subU.map(u => `download-settings.xhttpSettings.extra.${u}`));
                    } else {
                      const mappedKey = EXTRA_SCALAR_FIELD_MAP[esk];
                      if (mappedKey) {
                        mapped[mappedKey] = esv;
                      } else {
                        unmapped.push(`download-settings.xhttpSettings.extra.${esk}`);
                      }
                    }
                  }
                }
              } catch {
                unmapped.push(`download-settings.xhttpSettings.extra (非 JSON 字符串: "${xv}")`);
              }
            }
          } else {
            unmapped.push(`download-settings.xhttpSettings.${xk}`);
          }
        }
      }
    }
    // 8. xmux / reuseSettings / reuse-settings -> reuse-settings
    else if (k === 'xmux' || k === 'reuseSettings' || k === 'reuse-settings') {
      const { mapped: subReuse, unmapped: subU } = mapReuseSettings(v);
      if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
      unmapped.push(...subU.map(u => `download-settings.${u}`));
    }
    // 9. downloadSettings.extra 直接嵌套
    else if (k === 'extra') {
      if (typeof v === 'object' && v !== null) {
        for (const [desk, desv] of Object.entries(v as Record<string, unknown>)) {
          if (desk === 'xmux' || desk === 'reuseSettings' || desk === 'reuse-settings') {
            const { mapped: subReuse, unmapped: subU } = mapReuseSettings(desv);
            if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
            unmapped.push(...subU.map(u => `download-settings.extra.${u}`));
          } else {
            const mappedKey = EXTRA_SCALAR_FIELD_MAP[desk];
            if (mappedKey) {
              mapped[mappedKey] = desv;
            } else {
              unmapped.push(`download-settings.extra.${desk}`);
            }
          }
        }
      }
    }
    // 10. Mihomo 原生已规范字段直接透传
    else if (k === 'servername' || k === 'serverName' || k === 'sni') {
      mapped.servername = String(v);
    } else if (k === 'client-fingerprint' || k === 'clientFingerprint' || k === 'fingerprint' || k === 'fp') {
      mapped['client-fingerprint'] = String(v);
    } else if (k === 'skip-cert-verify' || k === 'skipCertVerify' || k === 'allowInsecure' || k === 'insecure') {
      if (v) mapped['skip-cert-verify'] = true;
    } else if (k === 'path') {
      mapped.path = String(v);
    } else if (k === 'host') {
      mapped.host = String(v);
    } else if (k === 'headers') {
      mapped.headers = v;
    } else if (k === 'mode') {
      mapped.mode = String(v);
    } else if (k === 'no-grpc-header' || k === 'noGRPCHeader') {
      mapped['no-grpc-header'] = v;
    } else if (k === 'x-padding-bytes' || k === 'xPaddingBytes') {
      mapped['x-padding-bytes'] = v;
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
    // 1. xmux / reuseSettings / reuse-settings -> reuse-settings
    if (k === 'xmux' || k === 'reuseSettings' || k === 'reuse-settings') {
      const { mapped, unmapped: subUnmapped } = mapReuseSettings(v);
      if (Object.keys(mapped).length > 0) opts['reuse-settings'] = mapped;
      unmapped.push(...subUnmapped.map(u => `xhttp-opts.${u}`));
    }
    // 2. downloadSettings / download-settings -> 专有 StreamSettings 转换
    else if (k === 'downloadSettings' || k === 'download-settings') {
      const dlRes = mapXrayDownloadSettingsToMihomo(v, nodeName);
      if (dlRes.fatal) {
        return { fatal: true, skipReason: dlRes.skipReason, unmapped: ['xhttp-opts.download-settings'] };
      }
      if (Object.keys(dlRes.mapped).length > 0) opts['download-settings'] = dlRes.mapped;
      unmapped.push(...dlRes.unmapped.map(u => `xhttp-opts.${u}`));
    }
    // 3. 顶层标量字段
    else {
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

const HANDLED_VLESS_PROTOCOL_KEYS = new Set([
  'uuid', 'flow', 'encryption', 'packetEncoding', 'security', 'sni', 'alpn',
  'fingerprint', 'skipCertVerify', 'realityOpts', 'transport', 'invalidParams', 'extras'
]);
const HANDLED_VLESS_TRANSPORT_KEYS = new Set([
  'type', 'path', 'headers', 'serviceName', 'mode', 'extra'
]);
const HANDLED_VLESS_REALITY_KEYS = new Set([
  'publicKey', 'shortId', 'spiderX'
]);

export function adaptVlessToMihomo(node: VlessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需凭据
  if (!p.uuid || !p.uuid.trim()) {
    return { fatal: true, lossy: true, emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VLESS UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: '缺少必需的 VLESS UUID' }],
      unsupportedParams: ['uuid'] };
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['uuid', 'server', 'port', 'type', 'security', 'publickey', 'public-key', 'pbk']));
  if (invRes.fatal) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: invRes.fatalReason,
      warnings: invRes.warnings,
      unsupportedParams: invRes.unsupportedParams
    };
  }
  warnings.push(...invRes.warnings);
  unsupportedParams.push(...invRes.unsupportedParams);

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

  // 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
  const unmappedProto = detectUnmappedFields(p as Record<string, unknown>, HANDLED_VLESS_PROTOCOL_KEYS);
  const unmappedTrans = p.transport ? detectUnmappedFields(p.transport as Record<string, unknown>, HANDLED_VLESS_TRANSPORT_KEYS, 'transport') : [];
  const unmappedReality = p.realityOpts ? detectUnmappedFields(p.realityOpts as Record<string, unknown>, HANDLED_VLESS_REALITY_KEYS, 'realityOpts') : [];
  for (const item of [...unmappedProto, ...unmappedTrans, ...unmappedReality]) {
    unsupportedParams.push(item);
    warnings.push({
      level: 'warn',
      field: item,
      message: `参数 [${item}] 已被 Parser 解析，但当前适配器未对其建模映射 (known-but-unmapped)`
    });
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
