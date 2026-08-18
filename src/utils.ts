// src/utils.ts
import { NodeEnvelope, RawQuery, RawQueryEntry, ShadowsocksNode } from './types';

/**
 * 带有完整 UTF-8 支持的安全 Base64 解码
 */
export function safeBase64Decode(str: string): string {
  if (!str) return '';
  try {
    let clean = str.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (clean.length % 4) {
      clean += '=';
    }

    const binaryString = atob(clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try {
      return atob(str.trim());
    } catch {
      return '';
    }
  }
}

/**
 * 带有完整 UTF-8 支持的安全 Base64 编码
 */
export function safeBase64Encode(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  } catch {
    return btoa(str);
  }
}

/**
 * 严格 Base64 解码检查（严禁宽松容错，杜绝畸形或长度不符的 Base64 凭据）
 */
export function strictBase64Decode(value: string): Uint8Array | null {
  if (!value || typeof value !== 'string') return null;
  // 必须仅包含合法 Base64 字符且长度为 4 的整数倍
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return null;
  }
  try {
    const binaryString = atob(value);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // 严格回显校验（确保无多余脏字节或畸形 padding）
    let reEncoded = '';
    for (let i = 0; i < bytes.length; i++) {
      reEncoded += String.fromCharCode(bytes[i]!);
    }
    if (btoa(reEncoded) !== value) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * 遵循规范解析 ALPN：支持标准 JSON 数组与逗号分隔字符串，不做猜测式清洗
 */
export function parseALPN(raw?: string | string[]): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map(s => String(s).trim()).filter(Boolean);
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 1. 如果是标准 JSON 数组格式 (如 '["h2", "http/1.1"]')
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(s => String(s).trim()).filter(Boolean);
      }
    } catch {}
  }

  // 2. 逗号分隔格式 (如 'h2,http/1.1')
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 安全的 decodeURIComponent（仅用于 URI 语法组件解析）
 */
export function tryDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * 真正无损解析 Query：保留原始顺序、重复键、原始未转义形式
 */
export function parseRawQuery(rawQueryStr: string): RawQuery {
  const clean = rawQueryStr.startsWith('?') ? rawQueryStr.slice(1) : rawQueryStr;
  if (!clean) {
    return { raw: '', entries: [] };
  }

  const pairs = clean.split('&');
  const entries: RawQueryEntry[] = [];

  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    let rawKey = '';
    let rawValue = '';

    if (eqIdx !== -1) {
      rawKey = pair.substring(0, eqIdx);
      rawValue = pair.substring(eqIdx + 1);
    } else {
      rawKey = pair;
      rawValue = '';
    }

    entries.push({
      rawKey,
      rawValue,
      key: tryDecodeURIComponent(rawKey.replace(/\+/g, ' ')),
      value: tryDecodeURIComponent(rawValue.replace(/\+/g, ' '))
    });
  }

  return {
    raw: clean,
    entries
  };
}

/**
 * 将 RawQuery 转为 Record 供快速字典查找（重复键以最后一个为准）
 */
export function queryEntriesToRecord(entries?: RawQueryEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (!entries) return map;
  for (const e of entries) {
    map[e.key] = e.value;
  }
  return map;
}

/**
 * 无损重命名原始 URI：仅替换最后的 #节点名称，100% 保持所有原始协议参数
 */
export function renameRawUri(raw: string, name: string): string {
  const i = raw.indexOf('#');
  const base = i >= 0 ? raw.slice(0, i) : raw;
  return `${base}#${encodeURIComponent(name)}`;
}

/**
 * 构造符合 RFC 6266 / RFC 5987 标准的 Content-Disposition 响应头
 */
export function formatContentDisposition(filename: string, ext: string): string {
  const cleanName = filename.replace(/[^\w\u4e00-\u9fa5\-_.]/g, '').trim() || 'SubConverter';
  const asciiName = cleanName.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(cleanName);
  return `attachment; filename=${asciiName}.${ext}; filename*=UTF-8''${encodedName}.${ext}`;
}

export interface RegionInfo {
  code: string;
  flag: string;
  name: string;
  regex: RegExp;
}

export const REGIONS: RegionInfo[] = [
  { code: 'HK', flag: '🇭🇰', name: '香港', regex: /(?:香港|Hong\s*Kong|HK|HKG|HongKong|深港|沪港|广港|穗港|HKT|HKBN|HGC|WTT)/i },
  { code: 'TW', flag: '🇹🇼', name: '台湾', regex: /(?:台湾|臺灣|Taiwan|TW|TWN|Taipei|台中|台北|新北|HINET|APOL|Kbro)/i },
  { code: 'JP', flag: '🇯🇵', name: '日本', regex: /(?:日本|Japan|JP|JPN|Tokyo|Osaka|东京|大阪|埼玉|名古|广岛|软银|Softbank|KDDI|DOCOMO)/i },
  { code: 'SG', flag: '🇸🇬', name: '新加坡', regex: /(?:新加坡|Singapore|SG|SGP|狮城|星加坡)/i },
  { code: 'US', flag: '🇺🇸', name: '美国', regex: /(?:美国|美國|United\s*States|US|USA|America|洛杉矶|硅谷|西雅图|芝加哥|纽约|达拉斯|波特兰|旧金山|圣何塞|凤凰城|俄勒冈|弗吉尼亚|Fremont|Los\s*Angeles|San\s*Jose|Silicon\s*Valley|Seattle|Chicago|New\s*York)/i },
  { code: 'KR', flag: '🇰🇷', name: '韩国', regex: /(?:韩国|韓國|Korea|KR|KOR|Seoul|首尔|釜山|KT|SK|LG)/i },
  { code: 'GB', flag: '🇬🇧', name: '英国', regex: /(?:英国|英國|United\s*Kingdom|UK|GB|GBR|London|伦敦|曼彻斯特)/i },
  { code: 'DE', flag: '🇩🇪', name: '德国', regex: /(?:德国|德國|Germany|DE|DEU|Frankfurt|法兰克福|柏林|慕尼黑)/i },
  { code: 'FR', flag: '🇫🇷', name: '法国', regex: /(?:法国|法國|France|FR|FRA|Paris|巴黎)/i },
  { code: 'CA', flag: '🇨🇦', name: '加拿大', regex: /(?:加拿大|Canada|CA|CAN|Toronto|Vancouver|多伦多|温哥华|蒙特利尔)/i },
  { code: 'AU', flag: '🇦🇺', name: '澳大利亚', regex: /(?:澳大利亚|澳洲|Australia|AU|AUS|Sydney|Melbourne|悉尼|墨尔本|堪培拉)/i },
  { code: 'RU', flag: '🇷🇺', name: '俄罗斯', regex: /(?:俄罗斯|Russia|RU|RUS|Moscow|莫斯科|圣彼得堡|海参崴)/i },
  { code: 'IN', flag: '🇮🇳', name: '印度', regex: /(?:印度|India|IN|IND|Mumbai|孟买|新德里)/i },
  { code: 'MY', flag: '🇲🇾', name: '马来西亚', regex: /(?:马来西亚|马来|大马|Malaysia|MY|MYS|Kuala\s*Lumpur|吉隆坡)/i },
  { code: 'TH', flag: '🇹🇭', name: '泰国', regex: /(?:泰国|泰國|Thailand|TH|THA|Bangkok|曼谷)/i },
  { code: 'PH', flag: '🇵🇭', name: '菲律宾', regex: /(?:菲律宾|Philippines|PH|PHL|Manila|马尼拉)/i },
  { code: 'VN', flag: '🇻🇳', name: '越南', regex: /(?:越南|Vietnam|VN|VNM|Ho\s*Chi\s*Minh|胡志明|河内)/i },
  { code: 'ID', flag: '🇮🇩', name: '印尼', regex: /(?:印尼|印度尼西亚|Indonesia|ID|IDN|Jakarta|雅加达)/i },
  { code: 'TR', flag: '🇹🇷', name: '土耳其', regex: /(?:土耳其|Turkey|TR|TUR|Istanbul|伊斯坦布尔)/i },
  { code: 'AR', flag: '🇦🇷', name: '阿根廷', regex: /(?:阿根廷|Argentina|AR|ARG)/i },
  { code: 'BR', flag: '🇧🇷', name: '巴西', regex: /(?:巴西|Brazil|BR|BRA|Sao\s*Paulo|圣保罗)/i },
  { code: 'ZA', flag: '🇿🇦', name: '南非', regex: /(?:南非|South\s*Africa|ZA|ZAF|Johannesburg)/i },
  { code: 'NL', flag: '🇳🇱', name: '荷兰', regex: /(?:荷兰|荷蘭|Netherlands|NL|NLD|Amsterdam|阿姆斯特丹)/i },
  { code: 'CH', flag: '🇨🇭', name: '瑞士', regex: /(?:瑞士|Switzerland|CH|CHE|Zurich|苏黎世)/i },
  { code: 'SE', flag: '🇸🇪', name: '瑞典', regex: /(?:瑞典|Sweden|SE|SWE|Stockholm|斯德哥尔摩)/i },
  { code: 'IT', flag: '🇮🇹', name: '意大利', regex: /(?:意大利|Italy|IT|ITA|Milan|米兰|罗马)/i },
  { code: 'ES', flag: '🇪🇸', name: '西班牙', regex: /(?:西班牙|Spain|ES|ESP|Madrid|马德里)/i },
  { code: 'IE', flag: '🇮🇪', name: '爱尔兰', regex: /(?:爱尔兰|愛爾蘭|Ireland|IE|IRL|Dublin|都柏林)/i },
  { code: 'AE', flag: '🇦🇪', name: '阿联酋', regex: /(?:阿联酋|迪拜|UAE|AE|ARE|Dubai)/i },
  { code: 'CN', flag: '🇨🇳', name: '中国', regex: /(?:中国|中國|China|CN|CHN|回国|北京|上海|广州|深圳|杭州)/i },
];

/**
 * 识别节点地区并返回国旗
 */
export function getRegionByNodeName(name: string): RegionInfo | null {
  for (const region of REGIONS) {
    if (region.regex.test(name)) {
      return region;
    }
  }
  return null;
}

/**
 * 智能为节点名称添加国旗 Emoji 前缀
 */
export function addFlagToNodeName(name: string): string {
  const flagRegex = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/;
  if (flagRegex.test(name)) {
    return name;
  }

  const region = getRegionByNodeName(name);
  if (region) {
    return `${region.flag} ${name}`;
  }

  return `🌐 ${name}`;
}

/**
 * 节点深层唯一特征指纹
 */
export function getNodeFingerprint(node: NodeEnvelope): string {
  const p: any = node.protocolData || {};
  return [
    node.name || '',
    node.protocol || '',
    node.server || '',
    node.port || '',
    p.uuid || p.id || p.password || p.secret || '',
    p.cipher || p.method || p.scy || '',
    p.network || p.net || p.type || p.transport?.type || '',
    p.path || p.wsPath || p.transport?.path || '',
    p.serviceName || p.grpcServiceName || p.transport?.serviceName || '',
    p.sni || p.servername || p.host || '',
    p.realityOpts?.publicKey || p.pbk || '',
    p.flow || '',
    p.packetEncoding || '',
    p.encryption || '',
    node.source?.raw || ''
  ].join('|');
}

/**
 * 基于深层特征指纹去重
 */
export function deduplicateNodesByFingerprint(nodes: NodeEnvelope[]): NodeEnvelope[] {
  const seen = new Set<string>();
  const unique: NodeEnvelope[] = [];

  for (const node of nodes) {
    const fp = getNodeFingerprint(node);
    if (!seen.has(fp)) {
      seen.add(fp);
      unique.push(node);
    }
  }

  return unique;
}

/**
 * 节点名称去重
 */
export function deduplicateNodeNames(nodes: NodeEnvelope[]): NodeEnvelope[] {
  const nameCount: Record<string, number> = {};

  return nodes.map(node => {
    let name = node.name.trim() || 'Node';
    if (nameCount[name] === undefined) {
      nameCount[name] = 1;
      return { ...node, name };
    } else {
      const count = nameCount[name]! + 1;
      nameCount[name] = count;
      const newName = `${name} ${String(count).padStart(2, '0')}`;
      return { ...node, name: newName };
    }
  });
}

/**
 * 解析各种格式的节点重命名规则
 */
export function parseRenameRules(rulesStr?: string): Array<{ search: string; replace: string }> {
  if (!rulesStr || !rulesStr.trim()) return [];

  const rawRules = rulesStr.split(/[\n\r,;|]+/);
  const result: Array<{ search: string; replace: string }> = [];

  for (const raw of rawRules) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (/^(?:DEL|RM)[-_@=]/i.test(trimmed)) {
      const search = trimmed.replace(/^(?:DEL|RM)[-_@=]/i, '').trim();
      if (search) {
        result.push({ search, replace: '' });
        continue;
      }
    }

    if (trimmed.includes('=')) {
      const [search, ...rest] = trimmed.split('=');
      if (search) {
        result.push({ search: search.trim(), replace: rest.join('=').trim() });
        continue;
      }
    }

    if (trimmed.includes('@')) {
      const [search, ...rest] = trimmed.split('@');
      if (search) {
        result.push({ search: search.trim(), replace: rest.join('@').trim() });
        continue;
      }
    }

    if (trimmed.includes('-')) {
      const [search, ...rest] = trimmed.split('-');
      if (search) {
        result.push({ search: search.trim(), replace: rest.join('-').trim() });
        continue;
      }
    }
  }

  return result.slice(0, 30);
}

/**
 * 节点过滤、重命名与特征去重综合处理
 */
export function processNodes(
  rawNodes: NodeEnvelope[],
  options: {
    includeRegex?: string;
    excludeRegex?: string;
    renameRules?: Array<{ search: string; replace: string }>;
    addEmoji?: boolean;
    enableUdp?: boolean;
  }
): NodeEnvelope[] {
  let nodes = deduplicateNodesByFingerprint(rawNodes);

  nodes = nodes.map(node => {
    let cleanName = (node.name || '')
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanName.length > 128) {
      cleanName = cleanName.substring(0, 128);
    }
    return { ...node, name: cleanName || 'Node' };
  });

  if (options.includeRegex && options.includeRegex.trim()) {
    try {
      const safePattern = options.includeRegex.trim().substring(0, 500);
      const inc = new RegExp(safePattern, 'i');
      nodes = nodes.filter(n => inc.test(n.name));
    } catch {}
  }

  if (options.excludeRegex && options.excludeRegex.trim()) {
    try {
      const safePattern = options.excludeRegex.trim().substring(0, 500);
      const exc = new RegExp(safePattern, 'i');
      nodes = nodes.filter(n => !exc.test(n.name));
    } catch {}
  }

  if (options.renameRules && options.renameRules.length > 0) {
    const safeRules = options.renameRules.slice(0, 30).map(r => ({
      search: (r.search || '').substring(0, 200),
      replace: (r.replace || '').substring(0, 200)
    }));

    nodes = nodes.map(node => {
      let newName = node.name;
      for (const rule of safeRules) {
        if (!rule.search) continue;
        try {
          const reg = new RegExp(rule.search, 'g');
          newName = newName.replace(reg, rule.replace);
        } catch {
          newName = newName.split(rule.search).join(rule.replace);
        }
      }
      return { ...node, name: newName.trim() || node.name };
    });
  }

  if (options.addEmoji) {
    nodes = nodes.map(node => ({
      ...node,
      name: addFlagToNodeName(node.name)
    }));
  }

  if (options.enableUdp !== undefined) {
    nodes = nodes.map(node => ({
      ...node,
      udp: options.enableUdp
    }));
  }

  return deduplicateNodeNames(nodes);
}

/**
 * 字节数转可读格式 (GB, MB, KB)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 时间戳转日期格式 (YYYY-MM-DD)
 */
export function formatDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return '无限期';
  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) return '无限期';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 解析 subscription-userinfo 响应头
 */
export function parseUserinfo(userinfoStr?: string): { upload: number; download: number; total: number; expire: number } | null {
  if (!userinfoStr) return null;
  const parts = userinfoStr.split(';');
  const result = { upload: 0, download: 0, total: 0, expire: 0 };

  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (!k || !v) continue;
    const num = parseInt(v, 10);
    if (isNaN(num)) continue;
    if (k.toLowerCase() === 'upload') result.upload = num;
    if (k.toLowerCase() === 'download') result.download = num;
    if (k.toLowerCase() === 'total') result.total = num;
    if (k.toLowerCase() === 'expire') result.expire = num;
  }

  if (result.total === 0 && result.expire === 0) return null;
  return result;
}

/**
 * 根据机场流量信息生成置顶展示节点
 */
export function createUserinfoNodes(userinfoStr?: string): ShadowsocksNode[] {
  const info = parseUserinfo(userinfoStr);
  if (!info) return [];

  const used = info.upload + info.download;
  const remaining = Math.max(0, info.total - used);
  const trafficText = `📊 剩余: ${formatBytes(remaining)} / ${formatBytes(info.total)}`;
  const expireText = `📅 到期: ${formatDate(info.expire)}`;

  const dummyCipherPass = safeBase64Encode('none:info');

  const trafficNode: ShadowsocksNode = {
    name: trafficText,
    protocol: 'shadowsocks',
    server: '127.0.0.1',
    port: 0,
    source: {
      format: 'uri',
      raw: `ss://${dummyCipherPass}@127.0.0.1:0#${encodeURIComponent(trafficText)}`
    },
    protocolData: {
      cipher: 'none',
      password: 'info',
      isSS2022: false,
      extras: {}
    },
    udp: false
  };

  const expireNode: ShadowsocksNode = {
    name: expireText,
    protocol: 'shadowsocks',
    server: '127.0.0.1',
    port: 0,
    source: {
      format: 'uri',
      raw: `ss://${dummyCipherPass}@127.0.0.1:0#${encodeURIComponent(expireText)}`
    },
    protocolData: {
      cipher: 'none',
      password: 'info',
      isSS2022: false,
      extras: {}
    },
    udp: false
  };

  return [trafficNode, expireNode];
}
