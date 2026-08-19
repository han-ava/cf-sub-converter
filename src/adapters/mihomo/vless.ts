// src/adapters/mihomo/vless.ts
import { AdapterResult, ConversionWarning, VlessNode } from '../../types';
import { parseALPN, detectUnmappedFields, processInvalidParams, JsonFieldReader } from '../../utils';

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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { mapped: {}, unmapped: [] };
  const r = new JsonFieldReader(raw as Record<string, unknown>);
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];

  const maxConcurrency = r.getIntOrRange('max-concurrency', 'maxConcurrency');
  if (maxConcurrency !== undefined) mapped['max-concurrency'] = maxConcurrency;

  const maxConnections = r.getIntOrRange('max-connections', 'maxConnections');
  if (maxConnections !== undefined) mapped['max-connections'] = maxConnections;

  const cMaxReuse = r.getIntOrRange('c-max-reuse-times', 'cMaxReuseTimes');
  if (cMaxReuse !== undefined) mapped['c-max-reuse-times'] = cMaxReuse;

  const hMaxReq = r.getIntOrRange('h-max-request-times', 'hMaxRequestTimes');
  if (hMaxReq !== undefined) mapped['h-max-request-times'] = hMaxReq;

  const hMaxReusable = r.getIntOrRange('h-max-reusable-secs', 'hMaxReusableSecs');
  if (hMaxReusable !== undefined) mapped['h-max-reusable-secs'] = hMaxReusable;

  const hKeepAlive = r.getStrictInt('h-keep-alive-period', 'hKeepAlivePeriod');
  if (hKeepAlive !== undefined) mapped['h-keep-alive-period'] = hKeepAlive;

  for (const inv of r.getInvalidFields()) {
    unmapped.push(`reuse-settings.${inv.key} (非法值: "${inv.value}")`);
  }
  for (const extraKey of Object.keys(r.getUnusedExtras())) {
    unmapped.push(`reuse-settings.${extraKey}`);
  }
  return { mapped, unmapped };
}

const XHTTP_VALID_MODES = ['auto', 'stream-one', 'stream-up', 'packet-up'];
const XHTTP_VALID_UPLINK_METHODS = ['POST', 'PUT', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'DELETE'];
const XHTTP_VALID_PLACEMENTS = ['header', 'cookie', 'query'];
const XHTTP_VALID_DATA_PLACEMENTS = ['body', 'header', 'cookie', 'query'];
const XHTTP_VALID_PADDING_PLACEMENTS = ['queryInHeader', 'cookie', 'header', 'query'];

/**
 * XHTTP 连接关键字段门禁表 (Critical Field Gate)
 * 当用户明确提供了这些关键字段，但值无法合法映射时，必须升级为 Fatal 拦截，禁止静默丢弃或删除后回退默认/继承值
 */
function isXhttpCriticalField(fieldKey: string): boolean {
  const norm = fieldKey.toLowerCase().replace(/[-_]/g, '');
  return (
    norm === 'mode' ||
    norm === 'sessionplacement' ||
    norm === 'sessionidplacement' ||
    norm === 'seqplacement' ||
    norm === 'seqidplacement' ||
    norm === 'uplinkdataplacement'
  );
}

/**
 * 结构化读取 XHTTP 所有专属配置并执行类型与枚举校验
 */
function mapXhttpFields(
  r: JsonFieldReader,
  prefix: string,
  ignoreKeys: string[] = []
): { mapped: Record<string, unknown>; unmapped: string[]; fatal?: true; skipReason?: string } {
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];

  // mode
  const mode = r.getEnum(XHTTP_VALID_MODES, 'mode');
  if (mode) mapped.mode = mode;

  // path & host
  const path = r.getString('path');
  if (path) mapped.path = path;

  const host = r.getString('host');
  if (host) mapped.host = host;

  // headers
  const headers = r.getRaw('headers');
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    mapped.headers = headers;
    r.markRecognized('headers');
  }

  // no-grpc-header
  const noGrpc = r.getStrictBool('no-grpc-header', 'noGRPCHeader', 'nogrpcheader');
  if (noGrpc !== undefined) mapped['no-grpc-header'] = noGrpc;

  // x-padding-bytes (支持单个非负整数或范围如 100-1000)
  const xPadding = r.getIntOrRange('x-padding-bytes', 'xPaddingBytes', 'xpaddingbytes');
  if (xPadding !== undefined) mapped['x-padding-bytes'] = xPadding;

  // x-padding options
  const xPadObfs = r.getStrictBool('x-padding-obfs-mode', 'xPaddingObfsMode');
  if (xPadObfs !== undefined) mapped['x-padding-obfs-mode'] = xPadObfs;

  const xPadKey = r.getString('x-padding-key', 'xPaddingKey');
  if (xPadKey) mapped['x-padding-key'] = xPadKey;

  const xPadHeader = r.getString('x-padding-header', 'xPaddingHeader');
  if (xPadHeader) mapped['x-padding-header'] = xPadHeader;

  const xPadPlacement = r.getEnum(XHTTP_VALID_PADDING_PLACEMENTS, 'x-padding-placement', 'xPaddingPlacement');
  if (xPadPlacement) mapped['x-padding-placement'] = xPadPlacement;

  const xPadMethod = r.getString('x-padding-method', 'xPaddingMethod');
  if (xPadMethod) mapped['x-padding-method'] = xPadMethod;

  // uplink-http-method
  const uplinkMethod = r.getEnum(XHTTP_VALID_UPLINK_METHODS, 'uplink-http-method', 'uplinkHTTPMethod', 'uplinkHttpMethod');
  if (uplinkMethod) mapped['uplink-http-method'] = uplinkMethod;

  // session options
  const sessionPlacement = r.getEnum(XHTTP_VALID_PLACEMENTS, 'session-placement', 'sessionPlacement', 'sessionIDPlacement', 'sessionIdPlacement', 'sessionidplacement');
  if (sessionPlacement) mapped['session-placement'] = sessionPlacement;

  const sessionKey = r.getString('session-key', 'sessionKey', 'sessionIDKey', 'sessionIdKey', 'sessionidkey');
  if (sessionKey) mapped['session-key'] = sessionKey;

  const sessionTable = r.getString('session-table', 'sessionTable', 'sessionIDTable', 'sessionIdTable', 'sessionidtable');
  if (sessionTable) mapped['session-table'] = sessionTable;

  // session-length (支持单个非负整数或范围如 16-32)
  const sessionLength = r.getIntOrRange('session-length', 'sessionLength', 'sessionIDLength', 'sessionIdLength', 'sessionidlength');
  if (sessionLength !== undefined) mapped['session-length'] = sessionLength;

  // seq options
  const seqPlacement = r.getEnum(XHTTP_VALID_PLACEMENTS, 'seq-placement', 'seqPlacement', 'seqIDPlacement', 'seqIdPlacement');
  if (seqPlacement) mapped['seq-placement'] = seqPlacement;

  const seqKey = r.getString('seq-key', 'seqKey', 'seqIDKey', 'seqIdKey');
  if (seqKey) mapped['seq-key'] = seqKey;

  // uplink-data options
  const uplinkDataPlacement = r.getEnum(XHTTP_VALID_DATA_PLACEMENTS, 'uplink-data-placement', 'uplinkDataPlacement');
  if (uplinkDataPlacement) mapped['uplink-data-placement'] = uplinkDataPlacement;

  const uplinkDataKey = r.getString('uplink-data-key', 'uplinkDataKey');
  if (uplinkDataKey) mapped['uplink-data-key'] = uplinkDataKey;

  const uplinkChunkSize = r.getStrictInt('uplink-chunk-size', 'uplinkChunkSize');
  if (uplinkChunkSize !== undefined) mapped['uplink-chunk-size'] = uplinkChunkSize;

  // sc options
  const scMaxEachPost = r.getStrictInt('sc-max-each-post-bytes', 'scMaxEachPostBytes');
  if (scMaxEachPost !== undefined) mapped['sc-max-each-post-bytes'] = scMaxEachPost;

  const scMinPostsInterval = r.getStrictInt('sc-min-posts-interval-ms', 'scMinPostsIntervalMs');
  if (scMinPostsInterval !== undefined) mapped['sc-min-posts-interval-ms'] = scMinPostsInterval;

  // 校验关键参数非法 -> 触发 Fatal
  for (const inv of r.getInvalidFields()) {
    if (isXhttpCriticalField(inv.key)) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `XHTTP 关键参数 [${prefix}.${inv.key}] 非法: ${inv.reason}`,
        unmapped: []
      };
    }
    unmapped.push(`${prefix}.${inv.key} (非法值: "${inv.value}")`);
  }

  // 收集未识别 extras
  for (const extraKey of Object.keys(r.getUnusedExtras(ignoreKeys))) {
    unmapped.push(`${prefix}.${extraKey}`);
  }

  return { mapped, unmapped };
}

interface DownloadSettingsContext {
  uplinkSecurity?: string;
  uplinkIsReality?: boolean;
  uplinkIsTls?: boolean;
}

/**
 * Xray StreamSettings downloadSettings -> Mihomo download-settings 专属语义转换器
 * 遵循 Mihomo 官方规范：download-settings 未显式声明的字段会继承上行配置。
 * 当上行为 Reality 且下行为 TLS/none 时，必须显式清空 reality-opts ({ public-key: "" })。
 * 当下行显式指定 security: none 时，必须显式输出 tls: false 防止继承上行 TLS。
 * 禁止输出 Xray 专属命名：address / network / tlsSettings / realitySettings / xhttpSettings / xmux
 * 转换为 Mihomo 官方字段：server / port / tls / servername / client-fingerprint / reality-opts / path / host / reuse-settings
 */
function mapXrayDownloadSettingsToMihomo(
  raw: unknown,
  nodeName: string,
  context?: DownloadSettingsContext
): { mapped: Record<string, unknown>; fatal?: true; skipReason?: string; unmapped: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { mapped: {}, unmapped: [] };
  const r = new JsonFieldReader(raw as Record<string, unknown>);
  const mapped: Record<string, unknown> = {};
  const unmapped: string[] = [];

  // 1. address / server -> server (Critical Gate)
  const rawServer = r.getRaw('server', 'address');
  if (rawServer !== undefined && rawServer !== null && rawServer !== '') {
    const server = r.getString('server', 'address');
    if (!server || typeof rawServer !== 'string' || !rawServer.trim()) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `节点 [${nodeName}] downloadSettings 关键参数 [server] 不能为空或格式非法: [${rawServer}]`,
        unmapped: []
      };
    }
    mapped.server = server;
  }

  // 2. port -> port (strict int 1-65535, Critical Gate)
  const rawPort = r.getRaw('port');
  if (rawPort !== undefined && rawPort !== null && rawPort !== '') {
    const port = r.getStrictInt('port');
    if (port === undefined || port < 1 || port > 65535) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `节点 [${nodeName}] downloadSettings 关键参数 [port] 非法: [${rawPort}] (期望 1-65535 整数)`,
        unmapped: []
      };
    }
    mapped.port = port;
  }

  // 3. security / tls (Critical Gate: 处理上行继承与清空语义)
  const rawSec = r.getRaw('security');
  let sec: string | undefined;
  if (rawSec !== undefined && rawSec !== null && rawSec !== '') {
    sec = r.getEnum(['tls', 'reality', 'none'], 'security');
    if (sec === undefined) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `节点 [${nodeName}] downloadSettings 关键参数 [security] 非法: [${rawSec}] 不是合法的安全协议 (仅支持 tls / reality / none)`,
        unmapped: []
      };
    }
    if (sec === 'tls') {
      mapped.tls = true;
      if (context?.uplinkIsReality) {
        mapped['reality-opts'] = { 'public-key': '' };
      }
    } else if (sec === 'reality') {
      mapped.tls = true;
    } else if (sec === 'none') {
      mapped.tls = false;
      if (context?.uplinkIsReality) {
        mapped['reality-opts'] = { 'public-key': '' };
      }
    }
  }

  const rawDirectTls = r.getRaw('tls');
  if (rawDirectTls !== undefined && rawDirectTls !== null && rawDirectTls !== '') {
    const directTls = r.getStrictBool('tls');
    if (directTls === undefined) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `节点 [${nodeName}] downloadSettings 关键参数 [tls] 不是合法的布尔值: [${rawDirectTls}]`,
        unmapped: []
      };
    }
    if (directTls === true) {
      mapped.tls = true;
      if (context?.uplinkIsReality && sec !== 'reality') {
        mapped['reality-opts'] = { 'public-key': '' };
      }
    } else if (directTls === false) {
      mapped.tls = false;
      if (context?.uplinkIsReality) {
        mapped['reality-opts'] = { 'public-key': '' };
      }
    }
  }

  // 4. network -> 校验下行传输协议 (Critical Gate)
  const rawNet = r.getRaw('network');
  if (rawNet !== undefined && rawNet !== null && rawNet !== '') {
    const net = r.getEnum(['xhttp', 'splithttp', 'tcp', ''], 'network');
    if (net === undefined) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `节点 [${nodeName}] downloadSettings 声明了 Mihomo 无法支持的独立下行传输协议: [${rawNet}]`,
        unmapped: []
      };
    }
  }

  // 5. tlsSettings / tls-settings
  const tlsSettingsRaw = r.getRaw('tlsSettings', 'tls-settings');
  if (tlsSettingsRaw && typeof tlsSettingsRaw === 'object' && !Array.isArray(tlsSettingsRaw)) {
    mapped.tls = true;
    const tr = new JsonFieldReader(tlsSettingsRaw as Record<string, unknown>);
    const sni = tr.getString('serverName', 'server-name', 'sni', 'servername');
    if (sni) mapped.servername = sni;

    const fp = tr.getString('fingerprint', 'fp', 'client-fingerprint', 'clientFingerprint');
    if (fp) mapped['client-fingerprint'] = fp;

    const alpnRaw = tr.getRaw('alpn');
    if (alpnRaw !== undefined) {
      const alpn = parseALPN(alpnRaw as string | string[]);
      if (alpn && alpn.length > 0) mapped.alpn = alpn;
    }

    const skipCert = tr.getStrictBool('allowInsecure', 'insecure', 'skipCertVerify', 'skip-cert-verify');
    if (skipCert) mapped['skip-cert-verify'] = true;

    const realitySub = tr.getRaw('realitySettings', 'reality-settings', 'realityOpts', 'reality-opts');
    if (realitySub && typeof realitySub === 'object' && !Array.isArray(realitySub)) {
      const rr = new JsonFieldReader(realitySub as Record<string, unknown>);
      const pbk = rr.getString('publicKey', 'public-key', 'pbk');
      const sid = rr.getString('shortId', 'short-id', 'sid');
      const spx = rr.getString('spiderX', 'spider-x', 'spx');

      if (!pbk) {
        return {
          mapped: {},
          fatal: true,
          skipReason: `节点 [${nodeName}] downloadSettings 中的 Reality 缺少必需的 publicKey (pbk)`,
          unmapped: []
        };
      }
      const rMapped: Record<string, string> = { 'public-key': pbk.trim() };
      if (sid !== undefined) rMapped['short-id'] = sid;
      if (spx !== undefined) rMapped['spider-x'] = spx;
      mapped['reality-opts'] = rMapped;

      for (const inv of rr.getInvalidFields()) {
        unmapped.push(`download-settings.tlsSettings.realitySettings.${inv.key} (非法值: "${inv.value}")`);
      }
      for (const extraKey of Object.keys(rr.getUnusedExtras())) {
        unmapped.push(`download-settings.tlsSettings.realitySettings.${extraKey}`);
      }
    } else if (context?.uplinkIsReality && sec !== 'reality') {
      mapped['reality-opts'] = { 'public-key': '' };
    }

    for (const inv of tr.getInvalidFields()) {
      unmapped.push(`download-settings.tlsSettings.${inv.key} (非法值: "${inv.value}")`);
    }
    for (const extraKey of Object.keys(tr.getUnusedExtras(['realitysettings', 'reality-settings', 'realityopts', 'reality-opts']))) {
      unmapped.push(`download-settings.tlsSettings.${extraKey}`);
    }
  }

  // 6. realitySettings / reality-settings (顶层)
  const realitySettingsRaw = r.getRaw('realitySettings', 'reality-settings', 'realityOpts', 'reality-opts');
  if (realitySettingsRaw && typeof realitySettingsRaw === 'object' && !Array.isArray(realitySettingsRaw)) {
    mapped.tls = true;
    const rr = new JsonFieldReader(realitySettingsRaw as Record<string, unknown>);
    const pbk = rr.getString('publicKey', 'public-key', 'pbk');
    const sid = rr.getString('shortId', 'short-id', 'sid');
    const spx = rr.getString('spiderX', 'spider-x', 'spx');

    if (!pbk) {
      return {
        mapped: {},
        fatal: true,
        skipReason: `节点 [${nodeName}] downloadSettings 中的 Reality 缺少必需的 publicKey (pbk)`,
        unmapped: []
      };
    }
    const rMapped: Record<string, string> = { 'public-key': pbk.trim() };
    if (sid !== undefined) rMapped['short-id'] = sid;
    if (spx !== undefined) rMapped['spider-x'] = spx;
    mapped['reality-opts'] = rMapped;

    for (const inv of rr.getInvalidFields()) {
      unmapped.push(`download-settings.realitySettings.${inv.key} (非法值: "${inv.value}")`);
    }
    for (const extraKey of Object.keys(rr.getUnusedExtras())) {
      unmapped.push(`download-settings.realitySettings.${extraKey}`);
    }
  }

  // 7. xhttpSettings / xhttp-settings
  const xhttpSettingsRaw = r.getRaw('xhttpSettings', 'xhttp-settings');
  if (xhttpSettingsRaw && typeof xhttpSettingsRaw === 'object' && !Array.isArray(xhttpSettingsRaw)) {
    const xr = new JsonFieldReader(xhttpSettingsRaw as Record<string, unknown>);
    const extraVal = xr.getRaw('extra');
    if (extraVal) {
      if (typeof extraVal === 'object' && extraVal !== null && !Array.isArray(extraVal)) {
        const er = new JsonFieldReader(extraVal as Record<string, unknown>);
        const reuseVal = er.getRaw('xmux', 'reuseSettings', 'reuse-settings');
        if (reuseVal) {
          const { mapped: subReuse, unmapped: subU } = mapReuseSettings(reuseVal);
          if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
          unmapped.push(...subU.map(u => `download-settings.xhttpSettings.extra.${u}`));
        }
        const { mapped: subXhttp, unmapped: subU, fatal, skipReason } = mapXhttpFields(er, 'download-settings.xhttpSettings.extra', ['xmux', 'reusesettings', 'reuse-settings']);
        if (fatal) {
          return { mapped: {}, fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: [] };
        }
        Object.assign(mapped, subXhttp);
        unmapped.push(...subU);
      } else if (typeof extraVal === 'string') {
        try {
          const parsedExtra = JSON.parse(extraVal);
          if (typeof parsedExtra === 'object' && parsedExtra !== null && !Array.isArray(parsedExtra)) {
            const er = new JsonFieldReader(parsedExtra as Record<string, unknown>);
            const reuseVal = er.getRaw('xmux', 'reuseSettings', 'reuse-settings');
            if (reuseVal) {
              const { mapped: subReuse, unmapped: subU } = mapReuseSettings(reuseVal);
              if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
              unmapped.push(...subU.map(u => `download-settings.xhttpSettings.extra.${u}`));
            }
            const { mapped: subXhttp, unmapped: subU, fatal, skipReason } = mapXhttpFields(er, 'download-settings.xhttpSettings.extra', ['xmux', 'reusesettings', 'reuse-settings']);
            if (fatal) {
              return { mapped: {}, fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: [] };
            }
            Object.assign(mapped, subXhttp);
            unmapped.push(...subU);
          }
        } catch {
          unmapped.push(`download-settings.xhttpSettings.extra (非 JSON 字符串: "${extraVal}")`);
        }
      }
    }

    const { mapped: subXhttp, unmapped: subU, fatal, skipReason } = mapXhttpFields(xr, 'download-settings.xhttpSettings', ['extra']);
    if (fatal) {
      return { mapped: {}, fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: [] };
    }
    Object.assign(mapped, subXhttp);
    unmapped.push(...subU);
  }

  // 8. xmux / reuseSettings / reuse-settings (顶层)
  const reuseRaw = r.getRaw('xmux', 'reuseSettings', 'reuse-settings');
  if (reuseRaw) {
    const { mapped: subReuse, unmapped: subU } = mapReuseSettings(reuseRaw);
    if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
    unmapped.push(...subU.map(u => `download-settings.${u}`));
  }

  // 9. downloadSettings.extra 直接嵌套
  const directExtra = r.getRaw('extra');
  if (directExtra && typeof directExtra === 'object' && directExtra !== null && !Array.isArray(directExtra)) {
    const er = new JsonFieldReader(directExtra as Record<string, unknown>);
    const reuseVal = er.getRaw('xmux', 'reuseSettings', 'reuse-settings');
    if (reuseVal) {
      const { mapped: subReuse, unmapped: subU } = mapReuseSettings(reuseVal);
      if (Object.keys(subReuse).length > 0) mapped['reuse-settings'] = subReuse;
      unmapped.push(...subU.map(u => `download-settings.extra.${u}`));
    }
    const { mapped: subXhttp, unmapped: subU, fatal, skipReason } = mapXhttpFields(er, 'download-settings.extra', ['xmux', 'reusesettings', 'reuse-settings']);
    if (fatal) {
      return { mapped: {}, fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: [] };
    }
    Object.assign(mapped, subXhttp);
    unmapped.push(...subU);
  }

  // 10. Mihomo 顶层 TLS 字段直接读取
  const topSni = r.getString('servername', 'serverName', 'sni');
  if (topSni) mapped.servername = topSni;

  const topFp = r.getString('client-fingerprint', 'clientFingerprint', 'fingerprint', 'fp');
  if (topFp) mapped['client-fingerprint'] = topFp;

  const topSkipCert = r.getStrictBool('skip-cert-verify', 'skipCertVerify', 'allowInsecure', 'insecure');
  if (topSkipCert) mapped['skip-cert-verify'] = true;

  // 11. Mihomo 顶层 XHTTP 标量字段直接读取
  const { mapped: topXhttp, unmapped: topXhttpU, fatal, skipReason } = mapXhttpFields(r, 'download-settings', [
    'server', 'address', 'port', 'security', 'tls', 'network',
    'tlssettings', 'tls-settings', 'realitysettings', 'reality-settings', 'realityopts', 'reality-opts',
    'xhttpsettings', 'xhttp-settings', 'xmux', 'reusesettings', 'reuse-settings', 'extra',
    'servername', 'serverName', 'sni', 'client-fingerprint', 'clientFingerprint', 'fingerprint', 'fp',
    'skip-cert-verify', 'skipCertVerify', 'allowInsecure', 'insecure'
  ]);
  if (fatal) {
    return { mapped: {}, fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: [] };
  }
  Object.assign(mapped, topXhttp);
  unmapped.push(...topXhttpU);

  return { mapped, unmapped };
}

/**
 * XHTTP extra 解析：把 extra JSON 递归展平到 xhttp-opts，并收集未知/未识别字段
 */
function applyXhttpExtra(
  rawExtra: string | object,
  opts: Record<string, unknown>,
  nodeName: string,
  context?: DownloadSettingsContext
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
  } else if (typeof rawExtra === 'object' && rawExtra !== null && !Array.isArray(rawExtra)) {
    extraObj = rawExtra as Record<string, unknown>;
  }

  if (!extraObj) return { unmapped: [] };

  const unmapped: string[] = [];
  const er = new JsonFieldReader(extraObj);

  // 1. xmux / reuseSettings / reuse-settings -> reuse-settings
  const reuseVal = er.getRaw('xmux', 'reuseSettings', 'reuse-settings');
  if (reuseVal) {
    const { mapped, unmapped: subUnmapped } = mapReuseSettings(reuseVal);
    if (Object.keys(mapped).length > 0) opts['reuse-settings'] = mapped;
    unmapped.push(...subUnmapped.map(u => `xhttp-opts.${u}`));
  }

  // 2. downloadSettings / download-settings -> 专有 StreamSettings 转换
  const dlVal = er.getRaw('downloadSettings', 'download-settings');
  if (dlVal) {
    const dlRes = mapXrayDownloadSettingsToMihomo(dlVal, nodeName, context);
    if (dlRes.fatal) {
      return { fatal: true, skipReason: dlRes.skipReason, unmapped: ['xhttp-opts.download-settings'] };
    }
    if (Object.keys(dlRes.mapped).length > 0) opts['download-settings'] = dlRes.mapped;
    unmapped.push(...dlRes.unmapped.map(u => `xhttp-opts.${u}`));
  }

  // 3. xhttpSettings / xhttp-settings
  const xhttpVal = er.getRaw('xhttpSettings', 'xhttp-settings');
  if (xhttpVal && typeof xhttpVal === 'object' && !Array.isArray(xhttpVal)) {
    const xr = new JsonFieldReader(xhttpVal as Record<string, unknown>);
    const { mapped: subXhttp, unmapped: subU, fatal, skipReason } = mapXhttpFields(xr, 'xhttp-opts.xhttpSettings');
    if (fatal) {
      return { fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: ['xhttp-opts.xhttpSettings'] };
    }
    Object.assign(opts, subXhttp);
    unmapped.push(...subU);
  }

  // 4. 顶层标量字段
  const { mapped: scalarXhttp, unmapped: scalarU, fatal, skipReason } = mapXhttpFields(er, 'xhttp-opts.extra', [
    'xmux', 'reusesettings', 'reuse-settings',
    'downloadsettings', 'download-settings',
    'xhttpsettings', 'xhttp-settings'
  ]);
  if (fatal) {
    return { fatal: true, skipReason: `节点 [${nodeName}] ${skipReason}`, unmapped: ['xhttp-opts.extra'] };
  }
  Object.assign(opts, scalarXhttp);
  unmapped.push(...scalarU);

  return { unmapped };
}

const HANDLED_VLESS_PROTOCOL_KEYS = new Set([
  'uuid', 'flow', 'encryption', 'packetEncoding', 'security', 'sni', 'alpn',
  'fingerprint', 'skipCertVerify', 'realityOpts', 'transport', 'invalidParams', 'extras'
]);
const HANDLED_VLESS_TRANSPORT_KEYS = new Set([
  'type', 'path', 'headers', 'serviceName', 'mode', 'extra', 'headerType', 'authority'
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

  if (p.flow) {
    if (p.flow === 'xtls-rprx-vision-udp443' || p.flow === 'xtls-rprx-vision') {
      config.flow = 'xtls-rprx-vision';
    } else {
      unsupportedParams.push('flow');
      warnings.push({
        level: 'warn',
        field: 'flow',
        message: `VLESS flow [${p.flow}] 在 Mihomo 中不受支持，已忽略`
      });
    }
  }
  if (p.packetEncoding) {
    if (p.packetEncoding === 'packetaddr' || p.packetEncoding === 'xudp') {
      config['packet-encoding'] = p.packetEncoding;
    } else {
      unsupportedParams.push('packet-encoding');
      warnings.push({
        level: 'warn',
        field: 'packet-encoding',
        message: `VLESS packet-encoding [${p.packetEncoding}] 在 Mihomo 中不受支持 (仅支持 packetaddr / xudp)`
      });
    }
  }
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
      if (t.mode) {
        const matchedMode = XHTTP_VALID_MODES.find(m => m.toLowerCase() === t.mode?.toLowerCase());
        if (matchedMode) {
          xhttpOpts.mode = matchedMode;
        } else {
          return {
            fatal: true,
            lossy: true,
            emitted: false,
            skipReason: `节点 [${node.name}] XHTTP 关键参数 [mode] 非法: "${t.mode}" 不是合法的枚举值 (允许值: ${XHTTP_VALID_MODES.join(', ')})`,
            warnings: [{
              level: 'fatal',
              field: 'transport.mode',
              message: `XHTTP mode [${t.mode}] 不是合法的枚举值 (允许值: ${XHTTP_VALID_MODES.join(', ')})`
            }],
            unsupportedParams: ['transport.mode']
          };
        }
      }

      if (t.extra) {
        const extraRes = applyXhttpExtra(t.extra, xhttpOpts, node.name, {
          uplinkSecurity: p.security,
          uplinkIsReality: isReality,
          uplinkIsTls: isTls
        });
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
