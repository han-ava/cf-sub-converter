// src/utils.ts
import { ConversionWarning, InvalidQueryParam, NodeEnvelope, RawQuery, RawQueryEntry, ShadowsocksNode } from './types';

/**
 * 带有完整 UTF-8 支持的安全 Base64 解码（支持 URL-Safe、BOM 清除、自动补齐 Padding、MIME 换行与空白过滤、URL 编码字符自适应）
 */
export function safeBase64Decode(str: string): string {
  if (!str || typeof str !== 'string') return '';
  let s = str.replace(/^﻿/, '').trim();
  if (!s) return '';

  // 移除常见 Base64 前缀协议头
  if (s.startsWith('data:text/plain;base64,')) {
    s = s.substring('data:text/plain;base64,'.length);
  } else if (s.startsWith('data:application/octet-stream;base64,')) {
    s = s.substring('data:application/octet-stream;base64,'.length);
  } else if (s.startsWith('base64://')) {
    s = s.substring('base64://'.length);
  }

  // 针对经过 URL 编码的 Base64 文本进行自适应还原
  if (s.includes('%')) {
    try {
      s = decodeURIComponent(s);
    } catch {}
  }

  // 过滤所有内部换行符、空格与制表符（MIME Base64 换行兼容），并将 URL-Safe 字符统一转为标准 Base64 字符
  let clean = s.replace(/[\s\r\n\t]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!clean) return '';

  // 补齐缺失的 '=' Padding
  const remainder = clean.length % 4;
  if (remainder === 2) {
    clean += '==';
  } else if (remainder === 3) {
    clean += '=';
  } else if (remainder === 1) {
    clean = clean.slice(0, -1);
  }

  try {
    const binaryString = atob(clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try {
      return atob(clean);
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
 * 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
 * 凡是 Parser 读取并存在但 Adapter 未建模的字段，自动捕捉并返回
 */
export function detectUnmappedFields(
  obj: Record<string, unknown> | undefined | null,
  handledKeys: Set<string>,
  prefix: string = ''
): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const unmapped: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && !handledKeys.has(key)) {
      unmapped.push(prefix ? `${prefix}.${key}` : key);
    }
  }
  return unmapped;
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
 * 大小写不敏感地从 RawQueryEntry 列表中获取指定别名对应的参数值（命中第一个匹配项）
 */
export function getQueryParam(
  entries: RawQueryEntry[] | undefined,
  ...aliases: string[]
): string | undefined {
  if (!entries || entries.length === 0) return undefined;
  const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
  for (const entry of entries) {
    if (aliasSet.has(entry.key.toLowerCase())) {
      return entry.value;
    }
  }
  return undefined;
}

/**
 * 大小写不敏感地从 RawQueryEntry 列表中获取布尔型参数值 ('1', 'true' -> true; '0', 'false' -> false; 其他 -> undefined)
 */
export function getQueryBool(
  entries: RawQueryEntry[] | undefined,
  ...aliases: string[]
): boolean | undefined {
  const val = getQueryParam(entries, ...aliases);
  if (val === undefined) return undefined;
  const clean = val.toLowerCase().trim();
  if (clean === '1' || clean === 'true') return true;
  if (clean === '0' || clean === 'false') return false;
  return undefined;
}

/**
 * 统一 Query 参数提取器：自动跟踪被读取的别名，防止已声明别名未读取导致的静默丢参或 Gate 误判
 * 同时严格校验布尔与整数类型，杜绝非法参数被静默消费为 false 或猜测数字
 */
export class QueryParamReader {
  private entries: RawQueryEntry[];
  private usedKeys = new Set<string>();
  private invalidParams: InvalidQueryParam[] = [];

  constructor(entries?: RawQueryEntry[]) {
    this.entries = entries || [];
  }

  get(...aliases: string[]): string | undefined {
    if (!this.entries || this.entries.length === 0) return undefined;
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    let firstVal: string | undefined = undefined;

    for (const entry of this.entries) {
      const entryKeyLower = entry.key.toLowerCase();
      if (aliasSet.has(entryKeyLower)) {
        this.usedKeys.add(entryKeyLower);
        if (firstVal === undefined) {
          firstVal = entry.value;
        }
      }
    }
    return firstVal;
  }

  getBool(...aliases: string[]): boolean | undefined {
    const val = this.get(...aliases);
    if (val === undefined) return undefined;
    const clean = val.toLowerCase().trim();
    if (clean === '1' || clean === 'true') {
      return true;
    }
    if (clean === '0' || clean === 'false') {
      return false;
    }
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    const matchedEntry = this.entries.find(e => aliasSet.has(e.key.toLowerCase()));
    const key = matchedEntry ? matchedEntry.key : aliases[0] || 'unknown';
    this.invalidParams.push({
      key,
      value: val,
      reason: `参数值 "${val}" 不是合法的布尔值 (仅允许 1/0/true/false)`
    });
    return undefined;
  }

  getInt(...aliases: string[]): number | undefined {
    const val = this.get(...aliases);
    if (val === undefined) return undefined;
    const clean = val.trim();
    if (/^-?\d+$/.test(clean)) {
      const num = parseInt(clean, 10);
      if (!isNaN(num)) {
        return num;
      }
    }
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    const matchedEntry = this.entries.find(e => aliasSet.has(e.key.toLowerCase()));
    const key = matchedEntry ? matchedEntry.key : aliases[0] || 'unknown';
    this.invalidParams.push({
      key,
      value: val,
      reason: `参数值 "${val}" 不是合法的整数 (包含非数字字符或格式错误)`
    });
    return undefined;
  }

  getIntOrRange(...aliases: string[]): number | string | undefined {
    const val = this.get(...aliases);
    if (val === undefined || val === null || val === '') return undefined;
    const res = parsePositiveIntOrRange(val);
    if (res.value !== undefined) {
      return res.value;
    }
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    const matchedEntry = this.entries.find(e => aliasSet.has(e.key.toLowerCase()));
    const key = matchedEntry ? matchedEntry.key : aliases[0] || 'unknown';
    this.invalidParams.push({
      key,
      value: val,
      reason: res.error || `参数值 "${val}" 不是合法的非负整数或范围`
    });
    return undefined;
  }

  getEnum(allowedValues: string[], ...aliases: string[]): string | undefined {
    const val = this.get(...aliases);
    if (val === undefined) return undefined;
    const clean = val.trim();
    const cleanLower = clean.toLowerCase();
    const cleanNoDash = cleanLower.replace(/-/g, '');
    const matched = allowedValues.find(a => a === clean) || allowedValues.find(a => {
      const aLower = a.toLowerCase();
      return aLower === cleanLower || aLower.replace(/-/g, '') === cleanNoDash;
    });
    if (matched !== undefined) {
      return matched;
    }
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    const matchedEntry = this.entries.find(e => aliasSet.has(e.key.toLowerCase()));
    const key = matchedEntry ? matchedEntry.key : aliases[0] || 'unknown';
    this.invalidParams.push({
      key,
      value: val,
      reason: `参数值 "${val}" 不是合法的枚举值 (允许值: ${allowedValues.join(', ')})`
    });
    return undefined;
  }

  markRecognized(...aliases: string[]): void {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const entry of this.entries) {
      const entryKeyLower = entry.key.toLowerCase();
      if (aliasSet.has(entryKeyLower)) {
        this.usedKeys.add(entryKeyLower);
      }
    }
  }

  getInvalidParams(): InvalidQueryParam[] {
    return [...this.invalidParams];
  }

  getUnusedExtras(ignoreKeys: string[] = []): Record<string, unknown> {
    const ignored = new Set(ignoreKeys.map(k => k.toLowerCase()));
    const extras: Record<string, unknown> = {};
    for (const entry of this.entries) {
      const entryKeyLower = entry.key.toLowerCase();
      if (!this.usedKeys.has(entryKeyLower) && !ignored.has(entryKeyLower)) {
        extras[entry.key] = entry.value;
      }
    }
    return extras;
  }
}

export interface ParsedEndpoint {
  server: string;
  port: number;
  error?: string;
  rawPort?: string;
}

/**
 * 严格解析 URI Endpoint (IPv4 / IPv6 / Domain + Port)
 * 杜绝 443abc -> 443 猜测截断或宽松容错
 */
export function parseStrictEndpoint(serverPortStr: string, defaultPort: number = 443): ParsedEndpoint {
  if (!serverPortStr) {
    return { server: '', port: defaultPort, error: 'Endpoint 不能为空' };
  }

  let cleanStr = serverPortStr.trim();
  if (cleanStr.endsWith('/')) {
    cleanStr = cleanStr.replace(/\/+$/, '');
  }

  let server = '';
  let rawPort: string | undefined = undefined;

  if (cleanStr.startsWith('[')) {
    const closingBracket = cleanStr.indexOf(']');
    if (closingBracket === -1) {
      return { server: '', port: defaultPort, error: 'IPv6 地址格式错误: 缺少闭合括号 ]' };
    }
    server = cleanStr.substring(1, closingBracket);
    const afterBracket = cleanStr.substring(closingBracket + 1);
    if (afterBracket.startsWith(':')) {
      rawPort = afterBracket.substring(1);
    } else if (afterBracket.length > 0) {
      return { server, port: defaultPort, error: `IPv6 地址后包含非法字符: ${afterBracket}`, rawPort: afterBracket };
    }
  } else {
    // 检查未加 [] 的裸 IPv6 地址（包含多个冒号）
    const colonCount = (cleanStr.match(/:/g) || []).length;
    if (colonCount > 1) {
      return {
        server: cleanStr,
        port: defaultPort,
        error: `IPv6 地址 [${cleanStr}] 格式错误: 必须使用方括号 [ ] 包裹 (例如 [${cleanStr}]:${defaultPort})`
      };
    }
    const colonIndex = cleanStr.lastIndexOf(':');
    if (colonIndex !== -1) {
      server = cleanStr.substring(0, colonIndex);
      rawPort = cleanStr.substring(colonIndex + 1);
    } else {
      server = cleanStr;
    }
  }

  server = server.trim();
  if (!server) {
    return { server: '', port: defaultPort, error: '服务器地址不能为空' };
  }

  if (rawPort === undefined || rawPort === '') {
    return { server, port: defaultPort };
  }

  const cleanPort = rawPort.trim();
  if (!/^\d+$/.test(cleanPort)) {
    return { server, port: defaultPort, error: `端口 [${rawPort}] 不是合法的纯数字整数`, rawPort };
  }

  const parsedPort = parseInt(cleanPort, 10);
  if (parsedPort < 1 || parsedPort > 65535) {
    return { server, port: defaultPort, error: `端口 [${parsedPort}] 超出合法范围 (1-65535)`, rawPort };
  }

  return { server, port: parsedPort, rawPort };
}

/**
 * 统一解析非负整数或整数范围 (如 600, "600", "600-900", "16-32")
 * 返回非负整数 number 或规范化范围字符串 "min-max"；格式非法时返回 error
 */
export function parsePositiveIntOrRange(
  val: unknown
): { value?: number | string; error?: string } {
  if (val === undefined || val === null || val === '') {
    return {};
  }

  if (typeof val === 'number') {
    if (!Number.isInteger(val)) {
      return { error: `值 "${val}" 是浮点数而非整数` };
    }
    if (val < 0) {
      return { error: `值 "${val}" 是负数，必须为非负整数` };
    }
    return { value: val };
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return {};

    // 匹配单个非负整数
    if (/^\d+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10);
      return { value: parsed };
    }

    // 匹配范围 "min-max"
    const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (match) {
      const min = parseInt(match[1]!, 10);
      const max = parseInt(match[2]!, 10);
      if (min > max) {
        return { error: `范围下限 [${min}] 大于上限 [${max}]: "${trimmed}"` };
      }
      return { value: `${min}-${max}` };
    }

    return { error: `值 "${trimmed}" 不是合法的非负整数或范围 (例如 600 或 600-900)` };
  }

  return { error: `值类型非法 (期望数字或字符串)` };
}

/**
 * 结构化 JSON 字段严格读取器 (VMess 等 JSON 载荷解析专用)
 * 提供严格类型转换、别名回退与 invalidFields 追踪
 */
export class JsonFieldReader {
  private json: Record<string, any>;
  private usedKeys: Set<string> = new Set();
  private invalidFields: InvalidQueryParam[] = [];

  constructor(json: Record<string, any>) {
    this.json = json && typeof json === 'object' ? json : {};
  }

  getString(...aliases: string[]): string | undefined {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const [k, v] of Object.entries(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
        if (v !== undefined && v !== null && v !== '') {
          return String(v).trim();
        }
        return undefined;
      }
    }
    return undefined;
  }

  getStrictInt(...aliases: string[]): number | undefined {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const [k, v] of Object.entries(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
        if (v === undefined || v === null || v === '') return undefined;
        if (typeof v === 'number') {
          if (Number.isInteger(v)) return v;
          this.invalidFields.push({
            key: k,
            value: String(v),
            reason: `字段值 "${v}" 是浮点数而非合法整数`
          });
          return undefined;
        }
        const str = String(v).trim();
        if (/^-?\d+$/.test(str)) {
          const parsed = parseInt(str, 10);
          if (!isNaN(parsed)) return parsed;
        }
        this.invalidFields.push({
          key: k,
          value: String(v),
          reason: `字段值 "${v}" 不是合法的整数 (包含非数字字符或格式错误)`
        });
        return undefined;
      }
    }
    return undefined;
  }

  getIntOrRange(...aliases: string[]): number | string | undefined {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const [k, v] of Object.entries(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
        if (v === undefined || v === null || v === '') return undefined;
        const res = parsePositiveIntOrRange(v);
        if (res.value !== undefined) {
          return res.value;
        }
        this.invalidFields.push({
          key: k,
          value: String(v),
          reason: res.error || `字段值 "${v}" 不是合法的非负整数或范围`
        });
        return undefined;
      }
    }
    return undefined;
  }

  getStrictBool(...aliases: string[]): boolean | undefined {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const [k, v] of Object.entries(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
        if (v === undefined || v === null || v === '') return undefined;
        if (typeof v === 'boolean') return v;
        const str = String(v).toLowerCase().trim();
        if (str === '1' || str === 'true') return true;
        if (str === '0' || str === 'false') return false;
        this.invalidFields.push({
          key: k,
          value: String(v),
          reason: `字段值 "${v}" 不是合法的布尔值 (仅允许 true/false/1/0)`
        });
        return undefined;
      }
    }
    return undefined;
  }

  getEnum(allowedValues: string[], ...aliases: string[]): string | undefined {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const [k, v] of Object.entries(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
        if (v === undefined || v === null || v === '') return undefined;
        const str = String(v).trim();
        const strLower = str.toLowerCase();
        const strNoDash = strLower.replace(/-/g, '');
        const matched = allowedValues.find(a => a === str) || allowedValues.find(a => {
          const aLower = a.toLowerCase();
          return aLower === strLower || aLower.replace(/-/g, '') === strNoDash;
        });
        if (matched !== undefined) {
          return matched;
        }
        this.invalidFields.push({
          key: k,
          value: String(v),
          reason: `字段值 "${v}" 不是合法的枚举值 (允许值: ${allowedValues.join(', ')})`
        });
        return undefined;
      }
    }
    return undefined;
  }

  getRaw(...aliases: string[]): any {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const [k, v] of Object.entries(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
        return v;
      }
    }
    return undefined;
  }

  markRecognized(...aliases: string[]): void {
    const aliasSet = new Set(aliases.map(x => x.toLowerCase()));
    for (const k of Object.keys(this.json)) {
      if (aliasSet.has(k.toLowerCase())) {
        this.usedKeys.add(k.toLowerCase());
      }
    }
  }

  getInvalidFields(): InvalidQueryParam[] {
    return [...this.invalidFields];
  }

  getUnusedExtras(ignoreKeys: string[] = []): Record<string, unknown> {
    const ignored = new Set(ignoreKeys.map(k => k.toLowerCase()));
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.json)) {
      if (!this.usedKeys.has(k.toLowerCase()) && !ignored.has(k.toLowerCase())) {
        extras[k] = v;
      }
    }
    return extras;
  }
}

/**
 * 校验并解析 Hysteria 2 hop-interval (支持单正整数如 30 或合法范围如 15-30)
 */
export function parseHy2HopInterval(value: string | number | undefined): {
  val?: number | string;
  invalid?: boolean;
  reason?: string;
} {
  if (value === undefined || value === null || value === '') {
    return {};
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0) return { val: value };
    return { invalid: true, reason: `hop-interval 必须为正整数或范围，当前为 ${value}` };
  }
  const str = String(value).trim();
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    if (num > 0) return { val: num };
    return { invalid: true, reason: `hop-interval 必须为大于 0 的正整数` };
  }
  if (/^\d+-\d+$/.test(str)) {
    const parts = str.split('-').map(s => parseInt(s, 10));
    const min = parts[0]!;
    const max = parts[1]!;
    if (min > 0 && max >= min) {
      return { val: str };
    }
    return { invalid: true, reason: `hop-interval 范围 [${str}] 非法，要求 min > 0 且 max >= min` };
  }
  return { invalid: true, reason: `hop-interval [${str}] 格式非法，仅支持正整数 (如 30) 或合法范围 (如 15-30)` };
}

/**
 * 校验并分类 invalidParams：
 * 关键参数（如 uuid, password, cipher, pbk, port, server）非法直接致命拦截 (fatal: true)
 * 非关键参数（如 insecure, hop-interval, obfs-min-packet-size 等）记录 warning 并列入 unsupportedParams (lossy: true)
 */
export function processInvalidParams(
  invalidParams: InvalidQueryParam[] | undefined,
  criticalKeys: Set<string> = new Set(['port', 'server', 'password', 'uuid', 'cipher', 'publickey', 'public-key', 'pbk'])
): {
  fatal: boolean;
  fatalReason?: string;
  warnings: ConversionWarning[];
  unsupportedParams: string[];
} {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  let fatal = false;
  let fatalReason: string | undefined = undefined;

  if (!invalidParams || invalidParams.length === 0) {
    return { fatal: false, warnings, unsupportedParams };
  }

  for (const item of invalidParams) {
    const keyLower = item.key.toLowerCase();
    const isCritical = criticalKeys.has(keyLower);
    unsupportedParams.push(item.key);

    if (isCritical) {
      fatal = true;
      fatalReason = `关键参数 [${item.key}=${item.value}] 格式非法: ${item.reason}`;
      warnings.push({
        level: 'fatal',
        field: item.key,
        message: fatalReason
      });
    } else {
      warnings.push({
        level: 'warn',
        field: item.key,
        message: `参数 [${item.key}=${item.value}] 格式非法: ${item.reason}`
      });
    }
  }

  return { fatal, fatalReason, warnings, unsupportedParams };
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

/**
 * 规范化 SHA-256 证书指纹（去除 sha256: 前缀、冒号、空格等，仅当为有效 64 位十六进制 SHA-256 时返回）
 */
export function normalizeSha256Fingerprint(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const clean = raw.trim().replace(/^sha256[:/]/i, '').replace(/[:\s-]/g, '').toLowerCase();
  if (/^[0-9a-f]{64}$/.test(clean)) {
    return clean;
  }
  return undefined;
}
