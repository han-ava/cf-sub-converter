// src/adapters/singbox/index.ts
import { AdapterResult, ConversionWarning, NodeEnvelope } from '../../types';
import { strictBase64Decode } from '../../utils';
import {
  isValidX509CertificateBase64,
  publicKeyIdentitiesMatch,
  validateCertificatePem,
  validatePrivateKeyPem,
  validateSinglePemBlock
} from './pem';
import { hasValidAuthorizedSshKey } from './ssh-key';

const SINGBOX_VERSION = '1.13.21';
const SINGBOX_PROTOCOLS = new Set([
  'ss', 'shadowsocks', 'vmess', 'vless', 'trojan',
  'hysteria2', 'hy2', 'anytls', 'tuic'
]);
const SINGBOX_NATIVE_SERVER_OUTBOUNDS = new Set([
  'socks', 'http', 'shadowsocks', 'vmess', 'trojan', 'naive', 'hysteria', 'ssh',
  'shadowtls', 'vless', 'anytls', 'tuic', 'hysteria2'
]);
const SUPPORTED_V2RAY_TRANSPORTS = new Set([
  'tcp', 'ws', 'grpc', 'http', 'h2', 'quic', 'httpupgrade', 'http-upgrade'
]);
const NATIVE_V2RAY_TRANSPORTS = new Set(['ws', 'grpc', 'http', 'quic', 'httpupgrade']);
const SUPPORTED_SHADOWSOCKS_PLUGINS = new Set(['obfs-local', 'v2ray-plugin']);
const SUPPORTED_SHADOWSOCKS_METHODS = new Set([
  '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm',
  '2022-blake3-chacha20-poly1305', 'none', 'aes-128-gcm', 'aes-192-gcm',
  'aes-256-gcm', 'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305',
  'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr', 'aes-128-cfb', 'aes-192-cfb',
  'aes-256-cfb', 'rc4-md5', 'chacha20-ietf', 'xchacha20'
]);
const SUPPORTED_VMESS_SECURITY = new Set([
  'auto', 'aes-128-gcm', 'aes-128-cfb', 'chacha20-poly1305', 'none', 'zero'
]);
const SUPPORTED_UTLS_FINGERPRINTS = new Set([
  'chrome', 'chrome_psk', 'chrome_psk_shuffle', 'chrome_padding_psk_shuffle',
  'chrome_pq', 'chrome_pq_psk', 'firefox', 'edge', 'safari', '360', 'qq', 'ios',
  'android', 'random', 'randomized'
]);
const SUPPORTED_TLS_CIPHER_SUITES = new Set([
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA',
  'TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA',
  'TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA',
  'TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA',
  'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
  'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
  'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
  'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
  'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
  'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256'
]);
const NATIVE_DIALER_FIELDS = new Set([
  'detour', 'bind_interface', 'inet4_bind_address', 'inet6_bind_address',
  'bind_address_no_port', 'protect_path', 'routing_mark', 'reuse_addr', 'netns',
  'connect_timeout', 'tcp_fast_open', 'tcp_multi_path', 'disable_tcp_keep_alive',
  'tcp_keep_alive', 'tcp_keep_alive_interval', 'udp_fragment', 'domain_resolver',
  'network_strategy', 'network_type', 'fallback_network_type', 'fallback_delay',
  'domain_strategy'
]);
const NATIVE_PROTOCOL_FIELDS: Record<string, Set<string>> = {
  socks: new Set(['version', 'username', 'password', 'network', 'udp_over_tcp']),
  http: new Set(['username', 'password', 'tls', 'path', 'headers']),
  shadowsocks: new Set([
    'method', 'password', 'plugin', 'plugin_opts', 'network', 'udp_over_tcp', 'multiplex'
  ]),
  vmess: new Set([
    'uuid', 'security', 'alter_id', 'global_padding', 'authenticated_length', 'network',
    'tls', 'packet_encoding', 'multiplex', 'transport'
  ]),
  trojan: new Set(['password', 'network', 'tls', 'multiplex', 'transport']),
  naive: new Set([
    'username', 'password', 'insecure_concurrency', 'extra_headers',
    'udp_over_tcp', 'quic', 'quic_congestion_control', 'tls'
  ]),
  hysteria: new Set([
    'server_ports', 'hop_interval', 'up', 'up_mbps', 'down', 'down_mbps', 'obfs',
    'auth', 'auth_str', 'recv_window_conn', 'recv_window', 'disable_mtu_discovery',
    'network', 'tls'
  ]),
  ssh: new Set([
    'user', 'password', 'private_key', 'private_key_path', 'private_key_passphrase',
    'host_key', 'host_key_algorithms', 'client_version'
  ]),
  shadowtls: new Set(['version', 'password', 'tls']),
  vless: new Set([
    'uuid', 'flow', 'network', 'tls', 'multiplex', 'transport', 'packet_encoding'
  ]),
  anytls: new Set([
    'tls', 'password', 'idle_session_check_interval', 'idle_session_timeout',
    'min_idle_session', 'client_metadata'
  ]),
  tuic: new Set([
    'uuid', 'password', 'congestion_control', 'udp_relay_mode', 'udp_over_stream',
    'zero_rtt_handshake', 'heartbeat', 'network', 'tls'
  ]),
  hysteria2: new Set([
    'server_ports', 'hop_interval', 'up_mbps', 'down_mbps', 'obfs', 'password',
    'network', 'tls', 'brutal_debug'
  ])
};
const NATIVE_TLS_FIELDS = new Set([
  'enabled', 'disable_sni', 'server_name', 'insecure', 'alpn', 'min_version',
  'max_version', 'cipher_suites', 'curve_preferences', 'certificate',
  'certificate_path', 'certificate_public_key_sha256', 'client_certificate',
  'client_certificate_path', 'client_key', 'client_key_path', 'fragment',
  'fragment_fallback_delay', 'record_fragment', 'kernel_tx', 'kernel_rx', 'ech',
  'utls', 'reality'
]);
const NATIVE_DOMAIN_STRATEGIES = new Set([
  '', 'as_is', 'prefer_ipv4', 'prefer_ipv6', 'ipv4_only', 'ipv6_only'
]);
const DEFAULT_NATIVE_DNS_SERVER_TAGS = new Set(['dns-system', 'dns-cn', 'dns-remote']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PLAIN_PATTERN = '(?:[0-9A-Fa-f]{32}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})';
const TUIC_UUID_PATTERN = new RegExp(`^(?:${UUID_PLAIN_PATTERN}|\\{${UUID_PLAIN_PATTERN}\\}|urn:uuid:${UUID_PLAIN_PATTERN})$`);

const COMMON_CLASH_FIELDS = new Set([
  'name', 'type', 'server', 'port', 'udp', 'tfo', 'tcp-fast-open', 'tcp_fast_open',
  'interface-name', 'interface_name', 'routing-mark', 'routing_mark'
]);
const CLASH_FIELDS: Record<string, Set<string>> = {
  shadowsocks: new Set([
    'cipher', 'method', 'password', 'plugin', 'plugin-opts', 'plugin_opts', 'pluginOpts',
    'udp-over-tcp', 'udp_over_tcp', 'udpOverTcp', 'udp-over-tcp-version',
    'udp_over_tcp_version', 'udpOverTcpVersion', 'smux', 'multiplex',
    'client-fingerprint', 'client_fingerprint', 'clientFingerprint'
  ]),
  vmess: new Set([
    'uuid', 'id', 'cipher', 'scy', 'security', 'alterId', 'alter_id', 'aid',
    'tls', 'sni', 'servername', 'server-name', 'server_name', 'alpn', 'fp',
    'fingerprint', 'client-fingerprint', 'client_fingerprint', 'skip-cert-verify',
    'skip_cert_verify', 'skipCertVerify', 'insecure', 'packet-encoding',
    'packet_encoding', 'packetEncoding', 'global-padding', 'global_padding',
    'globalPadding', 'authenticated-length', 'authenticated_length',
    'authenticatedLength', 'network', 'net', 'transport', 'path', 'host',
    'ws-opts', 'ws_opts', 'wsOpts', 'grpc-opts', 'grpc_opts', 'grpcOpts',
    'http-opts', 'http_opts', 'httpOpts', 'h2-opts', 'h2_opts', 'h2Opts',
    'http-upgrade-opts', 'http_upgrade_opts', 'httpUpgradeOpts', 'smux', 'multiplex',
    'disable-sni', 'disable_sni', 'disableSni'
  ]),
  vless: new Set([
    'uuid', 'id', 'flow', 'encryption', 'packet-encoding', 'packet_encoding',
    'packetEncoding', 'tls', 'security', 'sni', 'servername', 'server-name',
    'server_name', 'alpn', 'fp', 'fingerprint', 'client-fingerprint',
    'client_fingerprint', 'skip-cert-verify', 'skip_cert_verify', 'skipCertVerify',
    'insecure', 'reality', 'reality-opts', 'reality_opts', 'realityOpts', 'network',
    'net', 'transport', 'path', 'host', 'ws-opts', 'ws_opts', 'wsOpts',
    'grpc-opts', 'grpc_opts', 'grpcOpts', 'http-opts', 'http_opts', 'httpOpts',
    'h2-opts', 'h2_opts', 'h2Opts', 'http-upgrade-opts', 'http_upgrade_opts',
    'httpUpgradeOpts', 'smux', 'multiplex', 'disable-sni', 'disable_sni', 'disableSni'
  ]),
  trojan: new Set([
    'password', 'sni', 'servername', 'server-name', 'server_name', 'alpn', 'fp',
    'fingerprint', 'client-fingerprint', 'client_fingerprint', 'skip-cert-verify',
    'skip_cert_verify', 'skipCertVerify', 'insecure', 'network', 'net', 'transport',
    'path', 'host', 'ws-opts', 'ws_opts', 'wsOpts', 'grpc-opts', 'grpc_opts',
    'grpcOpts', 'http-opts', 'http_opts', 'httpOpts', 'h2-opts', 'h2_opts',
    'h2Opts', 'http-upgrade-opts', 'http_upgrade_opts', 'httpUpgradeOpts', 'smux',
    'multiplex', 'disable-sni', 'disable_sni', 'disableSni'
  ]),
  hysteria2: new Set([
    'password', 'auth', 'sni', 'servername', 'server-name', 'server_name',
    'skip-cert-verify', 'skip_cert_verify', 'skipCertVerify', 'insecure', 'ports',
    'server-ports', 'server_ports', 'hop-interval', 'hop_interval', 'hopInterval',
    'up', 'up-mbps', 'up_mbps', 'down', 'down-mbps', 'down_mbps', 'obfs',
    'obfs-password', 'obfs_password', 'obfsPassword', 'alpn', 'pinSHA256',
    'pin-sha256', 'pin_sha256', 'certificateFingerprint', 'fingerprint',
    'name-cert-verify', 'name_cert_verify', 'nameCertVerify', 'handshake-timeout',
    'handshake_timeout', 'handshakeTimeout', 'obfs-min-packet-size',
    'obfs_min_packet_size', 'obfsMinPacketSize', 'obfs-max-packet-size',
    'obfs_max_packet_size', 'obfsMaxPacketSize'
  ]),
  anytls: new Set([
    'password', 'sni', 'servername', 'server-name', 'server_name', 'alpn', 'fp',
    'fingerprint', 'client-fingerprint', 'client_fingerprint', 'skip-cert-verify',
    'skip_cert_verify', 'skipCertVerify', 'insecure', 'client-metadata',
    'client_metadata', 'clientMetadata', 'idle-session-check-interval',
    'idle_session_check_interval', 'idleSessionCheckInterval', 'idle-session-timeout',
    'idle_session_timeout', 'idleSessionTimeout', 'min-idle-session',
    'min_idle_session', 'minIdleSession', 'name-cert-verify', 'name_cert_verify',
    'nameCertVerify', 'shadow-tls-opts', 'shadow_tls_opts', 'shadowTlsOpts',
    'restls-opts', 'restls_opts', 'restlsOpts', 'jls-opts', 'jls_opts', 'jlsOpts',
    'disable-sni', 'disable_sni', 'disableSni'
  ]),
  tuic: new Set([
    'uuid', 'password', 'token', 'version', 'ip', 'heartbeat-interval',
    'heartbeat_interval', 'heartbeat', 'heartbeatInterval', 'reduce-rtt', 'reduce_rtt',
    'reduceRtt', 'zero-rtt-handshake', 'zero_rtt_handshake', 'zeroRttHandshake',
    'request-timeout', 'request_timeout', 'requestTimeout', 'disable-sni',
    'disable_sni', 'disableSni', 'fast-open', 'fast_open', 'fastOpen',
    'max-open-streams', 'max_open_streams', 'maxOpenStreams',
    'max-udp-relay-packet-size', 'max_udp_relay_packet_size', 'maxUdpRelayPacketSize',
    'congestion-controller', 'congestion_controller', 'congestionController',
    'congestion-control', 'congestion_control', 'congestionControl', 'udp-relay-mode',
    'udp_relay_mode', 'udpRelayMode', 'alpn', 'sni', 'servername', 'server-name',
    'server_name', 'skip-cert-verify', 'skip_cert_verify', 'skipCertVerify', 'insecure',
    'udp-over-stream', 'udp_over_stream', 'udpOverStream'
  ])
};

type Analysis = {
  warnings: ConversionWarning[];
  unsupportedParams: string[];
  fatalReason?: string;
};

export type SingBoxAdaptationOptions = {
  allowedDomainResolvers?: ReadonlySet<string>;
};

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function hasNativeValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function first(p: Record<string, any>, ...keys: string[]): any {
  for (const key of keys) {
    if (isPresent(p[key])) return p[key];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined;
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  return undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value.map(scalarString);
    if (normalized.some(item => item === undefined)) return undefined;
    const result = normalized.map(item => item!.trim()).filter(Boolean);
    return result.length > 0 ? result : undefined;
  }
  if (typeof value === 'string') {
    const result = value.split(',').map(item => item.trim()).filter(Boolean);
    return result.length > 0 ? result : undefined;
  }
  const normalized = scalarString(value);
  if (normalized !== undefined && normalized.trim()) return [normalized.trim()];
  return undefined;
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

function normalizeHttpHeaders(value: unknown): Record<string, string | string[]> | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  const headers: Record<string, string | string[]> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    if (Array.isArray(rawValue)) {
      const values = rawValue.map(scalarString);
      if (values.some(item => item === undefined)) return undefined;
      headers[key] = values as string[];
      continue;
    }
    const normalized = scalarString(rawValue);
    if (normalized === undefined) return undefined;
    headers[key] = normalized;
  }
  return headers;
}

function strictPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function strictNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function strictUint32(value: unknown): number | undefined {
  const parsed = strictNonNegativeInt(value);
  return parsed !== undefined && parsed <= 0xFFFFFFFF ? parsed : undefined;
}

function strictPositiveUint32(value: unknown): number | undefined {
  const parsed = strictPositiveInt(value);
  return parsed !== undefined && parsed <= 0xFFFFFFFF ? parsed : undefined;
}

function parseSingBoxDuration(value: string): bigint | undefined {
  if (!value || value.length > 128) return undefined;
  const unitNanoseconds: Record<string, bigint> = {
    ns: 1n,
    us: 1_000n,
    'µs': 1_000n,
    'μs': 1_000n,
    ms: 1_000_000n,
    s: 1_000_000_000n,
    m: 60_000_000_000n,
    h: 3_600_000_000_000n,
    d: 86_400_000_000_000n
  };
  let source = value;
  let negative = false;
  if (source.startsWith('+') || source.startsWith('-')) {
    negative = source[0] === '-';
    source = source.slice(1);
  }
  if (source === '0') return 0n;
  if (!source) return undefined;

  const segmentPattern = /((?:\d+(?:\.\d*)?)|(?:\.\d+))(ns|us|µs|μs|ms|s|m|h|d)/gy;
  let offset = 0;
  let total = 0n;
  const maxMagnitude = 9_223_372_036_854_775_808n;
  while (offset < source.length) {
    segmentPattern.lastIndex = offset;
    const match = segmentPattern.exec(source);
    if (!match || match.index !== offset) return undefined;
    const [wholePart, fraction = ''] = match[1]!.split('.');
    const unit = unitNanoseconds[match[2]!]!;
    let segment = BigInt(wholePart || '0') * unit;
    if (fraction) {
      segment += BigInt(fraction) * unit / (10n ** BigInt(fraction.length));
    }
    total += segment;
    if (total > maxMagnitude) return undefined;
    offset = segmentPattern.lastIndex;
  }
  if (offset === 0 || (!negative && total === maxMagnitude)) return undefined;
  return negative ? -total : total;
}

function normalizeDuration(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  const normalized = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)
    ? `${trimmed}s`
    : trimmed;
  if (parseSingBoxDuration(normalized) === undefined) return undefined;
  return normalized;
}

function hasValidPercentEncoding(value: string): boolean {
  return !/%(?![0-9A-Fa-f]{2})/.test(value);
}

function addIssue(
  analysis: Analysis,
  level: 'warn' | 'fatal',
  field: string,
  message: string
): void {
  if (!analysis.unsupportedParams.includes(field)) analysis.unsupportedParams.push(field);
  if (!analysis.warnings.some(item => item.level === level && item.field === field && item.message === message)) {
    analysis.warnings.push({ level, field, message });
  }
  if (level === 'fatal' && !analysis.fatalReason) analysis.fatalReason = message;
}

function addRuntimeWarning(analysis: Analysis, field: string, message: string): void {
  if (!analysis.warnings.some(item => item.level === 'warn' && item.field === field && item.message === message)) {
    analysis.warnings.push({ level: 'warn', field, message });
  }
}

function validateScalarStringField(
  analysis: Analysis,
  value: unknown,
  field: string,
  label: string,
  required = false
): void {
  if (!isPresent(value)) {
    if (required) addIssue(analysis, 'fatal', field, `${label} 缺少${field === 'password' ? '密码' : '必填值'}`);
    return;
  }
  if (scalarString(value) === undefined) {
    addIssue(analysis, 'fatal', field, `${label} 的 ${field} 必须是字符串或可无损转为字符串的标量`);
  }
}

function validateNativeStringField(
  analysis: Analysis,
  value: unknown,
  field: string,
  label: string,
  required = false
): void {
  if (!hasNativeValue(value) || (required && value === '')) {
    if (required) addIssue(analysis, 'fatal', field, `${label} 缺少${field === 'password' ? '密码' : '必填值'}`);
    return;
  }
  if (typeof value !== 'string') {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是字符串`);
  }
}

function validateNativeDurationField(
  analysis: Analysis,
  value: unknown,
  field: string
): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || parseSingBoxDuration(value) === undefined) {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是有效范围内的时长字符串`);
  }
}

function nativeDurationIsZero(value: unknown): boolean {
  if (value === undefined) return true;
  return typeof value === 'string' && parseSingBoxDuration(value) === 0n;
}

function validateExactKeys(
  analysis: Analysis,
  value: Record<string, any>,
  allowed: ReadonlySet<string>,
  prefix = ''
): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    const field = prefix ? `${prefix}.${key}` : key;
    addIssue(
      analysis,
      'fatal',
      field,
      `Sing-box ${SINGBOX_VERSION} 不支持原生字段 [${field}]`
    );
  }
}

function nativeStringList(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value;
  return undefined;
}

function nativeStringListHasContent(value: unknown): boolean {
  const values = nativeStringList(value);
  return Boolean(values && values.join('\n').length > 0);
}

function validateNativeStringListField(
  analysis: Analysis,
  value: unknown,
  field: string
): string[] | undefined {
  if (!hasNativeValue(value)) return undefined;
  const values = nativeStringList(value);
  if (!values) {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是字符串或字符串数组`);
  }
  return values;
}

function validateNativeNullableStringListField(
  analysis: Analysis,
  value: unknown,
  field: string
): string[] | undefined {
  if (!hasNativeValue(value)) return undefined;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every(item => item === null || typeof item === 'string')) {
    return value.map(item => item === null ? '' : item);
  }
  if (hasNativeValue(value)) {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是字符串或字符串数组`);
  }
  return undefined;
}

function validateNativeBooleanField(
  analysis: Analysis,
  value: unknown,
  field: string
): void {
  if (hasNativeValue(value) && typeof value !== 'boolean') {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是布尔值`);
  }
}

function isNativeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function validateNativeIntegerField(
  analysis: Analysis,
  value: unknown,
  field: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER
): void {
  if (hasNativeValue(value) && (!isNativeInteger(value, minimum) || value > maximum)) {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是 ${minimum >= 0 ? '非负' : ''}整数`);
  }
}

function isNativeHttpHeaders(value: unknown): boolean {
  const headers = asRecord(value);
  if (!headers) return false;
  return Object.values(headers).every(headerValue => (
    headerValue === null
    || typeof headerValue === 'string'
    || (Array.isArray(headerValue) && headerValue.every(item => item === null || typeof item === 'string'))
  ));
}

function strictNativeBase64Decode(value: string): Uint8Array | null {
  return strictBase64Decode(value.replace(/[\r\n]/g, ''));
}

function validateNativeHeadersField(
  analysis: Analysis,
  value: unknown,
  field: string
): void {
  if (hasNativeValue(value) && !isNativeHttpHeaders(value)) {
    addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是字符串或字符串数组对象`);
  }
}

function isValidNativeIpAddress(value: string): boolean {
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) {
    return value.split('.').every(part => Number(part) <= 255);
  }
  if (!value.includes(':')) return false;
  const zoneIndex = value.indexOf('%');
  if (zoneIndex === value.length - 1) return false;
  const address = zoneIndex >= 0 ? value.slice(0, zoneIndex) : value;
  if (address.includes('[') || address.includes(']')) return false;
  try {
    const parsed = new URL(`http://[${address}]/`);
    return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']');
  } catch {
    return false;
  }
}

function isValidNativePrefix(value: string): boolean {
  const slash = value.lastIndexOf('/');
  if (slash < 0) return isValidNativeIpAddress(value);
  const address = value.slice(0, slash);
  const bitsValue = value.slice(slash + 1);
  if (address.includes('%') || !/^\d+$/.test(bitsValue) || !isValidNativeIpAddress(address)) return false;
  const bits = Number(bitsValue);
  return address.includes(':') ? bits <= 128 : bits <= 32;
}

function parseNativeNetworkByteQuantity(value: unknown): bigint | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d+)(.*)$/s);
  if (!match) return undefined;
  const networkUnits: Record<string, bigint> = {
    Bps: 1n,
    Kbps: 125n,
    KBps: 1_000n,
    Mbps: 125_000n,
    MBps: 1_000_000n,
    Gbps: 125_000_000n,
    GBps: 1_000_000_000n,
    Tbps: 125_000_000_000n,
    TBps: 1_000_000_000_000n,
    Pbps: 125_000_000_000_000n,
    PBps: 1_000_000_000_000_000n,
    Ebps: 125_000_000_000_000_000n,
    EBps: 1_000_000_000_000_000_000n
  };
  const byteUnits: Record<string, bigint> = {
    b: 1n,
    k: 1_000n,
    kb: 1_000n,
    ki: 1_024n,
    kib: 1_024n,
    m: 1_000_000n,
    mb: 1_000_000n,
    mi: 1_048_576n,
    mib: 1_048_576n,
    g: 1_000_000_000n,
    gb: 1_000_000_000n,
    gi: 1_073_741_824n,
    gib: 1_073_741_824n,
    t: 1_000_000_000_000n,
    tb: 1_000_000_000_000n,
    ti: 1_099_511_627_776n,
    tib: 1_099_511_627_776n,
    p: 1_000_000_000_000_000n,
    pb: 1_000_000_000_000_000n,
    pi: 1_125_899_906_842_624n,
    pib: 1_125_899_906_842_624n,
    e: 1_000_000_000_000_000_000n,
    eb: 1_000_000_000_000_000_000n,
    ei: 1_152_921_504_606_846_976n,
    eib: 1_152_921_504_606_846_976n
  };
  const unit = match[2]!.trim();
  const multiplier = networkUnits[unit] ?? byteUnits[unit.toLowerCase()];
  if (multiplier === undefined) return undefined;
  const result = BigInt(match[1]!) * multiplier;
  return result <= 18_446_744_073_709_551_615n ? result : undefined;
}

function validateNativeHysteriaBandwidth(
  analysis: Analysis,
  quantity: unknown,
  mbps: unknown,
  field: 'up' | 'down'
): void {
  const parsedQuantity = hasNativeValue(quantity)
    ? parseNativeNetworkByteQuantity(quantity)
    : 0n;
  if (hasNativeValue(quantity) && parsedQuantity === undefined) {
    addIssue(analysis, 'fatal', field, `原生 Sing-box Hysteria ${field} 格式非法`);
    return;
  }
  if (hasNativeValue(mbps) && !isNativeInteger(mbps, 0)) {
    addIssue(analysis, 'fatal', `${field}_mbps`, `原生 Sing-box ${field}_mbps 必须是非负整数`);
    return;
  }
  const effective = parsedQuantity && parsedQuantity > 0n
    ? parsedQuantity
    : BigInt(typeof mbps === 'number' ? mbps : 0) * 125_000n;
  if (effective < 16_384n) {
    addIssue(
      analysis,
      'fatal',
      parsedQuantity && parsedQuantity > 0n ? field : `${field}_mbps`,
      `原生 Sing-box Hysteria ${field === 'up' ? '上行' : '下行'}带宽必须至少为 16384 Bps`
    );
  }
}

function validateNativeUdpOverTcp(
  analysis: Analysis,
  value: unknown,
  protocol: string
): void {
  if (!hasNativeValue(value)) return;
  if (typeof value === 'boolean') return;
  const options = asRecord(value);
  if (!options) {
    addIssue(analysis, 'fatal', 'udp_over_tcp', `原生 Sing-box ${protocol} udp_over_tcp 必须是布尔值或对象`);
    return;
  }
  validateExactKeys(analysis, options, new Set(['enabled', 'version']), 'udp_over_tcp');
  validateNativeBooleanField(analysis, options.enabled, 'udp_over_tcp.enabled');
  if (hasNativeValue(options.version)) {
    if (!isNativeInteger(options.version, 0) || options.version > 0xFF) {
      addIssue(
        analysis,
        'fatal',
        'udp_over_tcp.version',
        '原生 Sing-box udp_over_tcp.version 必须是 uint8 整数'
      );
    } else if (options.enabled === true && ![0, 1, 2].includes(options.version)) {
      addIssue(
        analysis,
        'fatal',
        'udp_over_tcp.version',
        `Sing-box ${SINGBOX_VERSION} 启用 UDP-over-TCP 时仅支持 version 0、1 或 2`
      );
    }
  }
}

function protocolKey(protocol: string): string {
  if (protocol === 'ss' || protocol === 'shadowsocks') return 'shadowsocks';
  if (protocol === 'hy2' || protocol === 'hysteria2') return 'hysteria2';
  return protocol;
}

function transportType(node: NodeEnvelope, p: Record<string, any>): string {
  const nested = asRecord(p.transport);
  const directTransport = typeof p.transport === 'string' ? p.transport : undefined;
  const candidates = [nested?.type, directTransport, p.network, p.net];
  const pType = typeof p.type === 'string' ? p.type.toLowerCase() : '';
  if (SUPPORTED_V2RAY_TRANSPORTS.has(pType) || ['xhttp', 'splithttp', 'kcp', 'mkcp', 'mekya'].includes(pType)) {
    candidates.push(pType);
  }
  const raw = candidates.find(isPresent);
  const normalized = String(raw || 'tcp').toLowerCase();
  if (normalized === 'websocket') return 'ws';
  if (normalized === 'none') return 'tcp';
  return normalized;
}

function validateUuid(analysis: Analysis, value: unknown, field = 'uuid'): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    addIssue(
      analysis,
      'fatal',
      field,
      `Sing-box ${SINGBOX_VERSION} 要求 ${field} 为标准 UUID`
    );
  }
}

function validateTuicUuid(analysis: Analysis, value: unknown, field = 'uuid'): void {
  if (typeof value !== 'string' || !TUIC_UUID_PATTERN.test(value)) {
    addIssue(
      analysis,
      'fatal',
      field,
      `Sing-box ${SINGBOX_VERSION} 要求 ${field} 为 TUIC 支持的 UUID 格式`
    );
  }
}

function normalizePortList(value: unknown): string[] | undefined {
  if (!isPresent(value)) return undefined;
  const rawItems = Array.isArray(value) ? value.map(String) : String(value).split(',');
  const result: string[] = [];
  for (const rawItem of rawItems) {
    const item = rawItem.trim();
    let start: number;
    let end: number | undefined;
    if (/^\d+$/.test(item)) {
      start = Number(item);
    } else {
      const match = item.match(/^(\d+)\s*[:-]\s*(\d+)$/);
      if (!match) return undefined;
      start = Number(match[1]);
      end = Number(match[2]);
    }
    if (start < 1 || start > 65535 || (end !== undefined && (end < start || end > 65535))) {
      return undefined;
    }
    result.push(end === undefined ? `${start}:${start}` : `${start}:${end}`);
  }
  return result.length > 0 ? result : undefined;
}

function parsePluginOptions(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (record) return record;
  if (typeof value !== 'string') return undefined;

  const options: Record<string, unknown> = {};
  let key = '';
  let optionValue = '';
  let readingValue = false;
  let escaped = false;
  let endedAtSeparator = false;
  const flush = (): boolean => {
    if (!key) return false;
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = readingValue ? optionValue : true;
    }
    key = '';
    optionValue = '';
    readingValue = false;
    return true;
  };

  for (const char of value) {
    if (escaped) {
      if (readingValue) optionValue += char;
      else key += char;
      escaped = false;
      endedAtSeparator = false;
    } else if (char === '\\') {
      escaped = true;
      endedAtSeparator = false;
    } else if (char === '=' && !readingValue) {
      readingValue = true;
      endedAtSeparator = false;
    } else if (char === ';') {
      if (!flush()) return undefined;
      endedAtSeparator = true;
    } else {
      if (readingValue) optionValue += char;
      else key += char;
      endedAtSeparator = false;
    }
  }
  if (escaped) return undefined;
  if (!endedAtSeparator && !flush() && value.length > 0) return undefined;
  return options;
}

function validateNativeShadowsocksPlugin(p: Record<string, any>, analysis: Analysis): void {
  validateNativeStringField(analysis, p.plugin, 'plugin', '原生 Sing-box Shadowsocks');
  validateNativeStringField(analysis, p.plugin_opts, 'plugin_opts', '原生 Sing-box Shadowsocks');
  if (typeof p.plugin !== 'string' || p.plugin === '') return;
  if (!SUPPORTED_SHADOWSOCKS_PLUGINS.has(p.plugin)) {
    addIssue(
      analysis,
      'fatal',
      'plugin',
      `Sing-box ${SINGBOX_VERSION} 不支持 Shadowsocks plugin [${p.plugin}]`
    );
    return;
  }
  if (typeof p.plugin_opts !== 'string' && hasNativeValue(p.plugin_opts)) return;

  const options = parsePluginOptions(p.plugin_opts || '');
  if (!options) {
    addIssue(analysis, 'fatal', 'plugin_opts', 'Shadowsocks plugin_opts 不是有效的 SIP003 参数串');
    return;
  }
  const getOption = (key: string): string | undefined => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) return undefined;
    return options[key] === true ? '1' : String(options[key]);
  };

  if (p.plugin === 'obfs-local') {
    const rawMode = getOption('obfs');
    const mode = rawMode === undefined ? 'http' : rawMode;
    if (mode !== 'http' && mode !== 'tls') {
      addIssue(analysis, 'fatal', 'plugin_opts.obfs', `obfs-local 不支持模式 [${mode}]`);
    }
    return;
  }

  const rawMode = getOption('mode');
  const mode = rawMode === undefined ? 'websocket' : rawMode;
  if (mode !== 'websocket' && mode !== 'quic') {
    addIssue(analysis, 'fatal', 'plugin_opts.mode', `Sing-box v2ray-plugin 不支持模式 [${mode}]`);
    return;
  }
  if (mode === 'quic' && getOption('tls') === undefined) {
    addIssue(analysis, 'fatal', 'plugin_opts.tls', 'v2ray-plugin QUIC 模式必须启用 TLS');
  }
  const certRaw = getOption('certRaw');
  const tlsEnabled = getOption('tls') !== undefined;
  if (tlsEnabled && certRaw !== undefined) {
    if (!isValidX509CertificateBase64(certRaw)) {
      addIssue(analysis, 'fatal', 'plugin_opts.certRaw', 'v2ray-plugin certRaw 必须是有效 DER 证书的 Base64 内容');
    } else {
      addRuntimeWarning(
        analysis,
        'plugin_opts.certRaw',
        '已完成 v2ray-plugin 内联证书的本地结构校验；完整证书语义仍由最终 Sing-box 校验'
      );
    }
  }
  const cert = getOption('cert');
  if (tlsEnabled && certRaw === undefined && cert) {
    addRuntimeWarning(
      analysis,
      'plugin_opts.cert',
      'v2ray-plugin cert 指向的本地证书文件由最终 Sing-box 校验'
    );
  }
  if (mode === 'websocket') {
    const path = getOption('path');
    if (path !== undefined && !hasValidPercentEncoding(path)) {
      addIssue(analysis, 'fatal', 'plugin_opts.path', 'v2ray-plugin path 包含非法的百分号转义');
    }
    const mux = getOption('mux');
    if (mux !== undefined) {
      const digits = mux.replace(/^[+-]/, '').replace(/^0+/, '') || '0';
      if (!/^[+-]?\d+$/.test(mux) || digits.length > 19) {
        addIssue(analysis, 'fatal', 'plugin_opts.mux', 'v2ray-plugin mux 必须是整数');
      } else {
        const parsed = BigInt(mux);
        if (parsed < -9_223_372_036_854_775_808n || parsed > 9_223_372_036_854_775_807n) {
          addIssue(analysis, 'fatal', 'plugin_opts.mux', 'v2ray-plugin mux 超出 64 位整数范围');
        }
      }
    }
  }
}

function escapePluginOption(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/=/g, '\\=');
}

function serializePluginOptions(options: Record<string, unknown> | undefined): string | undefined {
  if (!options) return undefined;
  const parts: string[] = [];
  for (const [key, optionValue] of Object.entries(options)) {
    const escapedKey = escapePluginOption(key);
    if (optionValue === true || optionValue === '') parts.push(escapedKey);
    else if (optionValue !== undefined && optionValue !== null && optionValue !== false) {
      parts.push(`${escapedKey}=${escapePluginOption(optionValue)}`);
    }
  }
  return parts.length > 0 ? parts.join(';') : undefined;
}

type ShadowsocksPlugin = {
  name?: string;
  options?: Record<string, unknown>;
  issues: Array<{ field: string; message: string }>;
  runtimeWarnings?: Array<{ field: string; message: string }>;
};

function normalizeShadowsocksPlugin(p: Record<string, any>): ShadowsocksPlugin {
  const rawName = first(p, 'plugin');
  const rawOptions = first(p, 'pluginOpts', 'plugin-opts', 'plugin_opts');
  if (!rawName) {
    return {
      issues: isPresent(rawOptions)
        ? [{ field: 'plugin_opts', message: 'Shadowsocks 提供了 plugin_opts 但缺少 plugin' }]
        : []
    };
  }

  const inputName = String(rawName).trim().toLowerCase();
  const name = ['obfs', 'simple-obfs'].includes(inputName) ? 'obfs-local' : inputName;
  if (!SUPPORTED_SHADOWSOCKS_PLUGINS.has(name)) {
    return {
      name,
      issues: [{
        field: 'plugin',
        message: `Sing-box ${SINGBOX_VERSION} Shadowsocks 仅支持 obfs-local 与 v2ray-plugin，不支持 [${rawName}]`
      }]
    };
  }

  const source = isPresent(rawOptions) ? parsePluginOptions(rawOptions) : {};
  if (!source) {
    return {
      name,
      issues: [{ field: 'plugin_opts', message: 'Shadowsocks plugin_opts 不是有效的 SIP003 参数串或对象' }]
    };
  }

  const options: Record<string, unknown> = {};
  const issues: ShadowsocksPlugin['issues'] = [];
  const runtimeWarnings: NonNullable<ShadowsocksPlugin['runtimeWarnings']> = [];
  const handled = new Set<string>();
  const take = (...keys: string[]): unknown => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        handled.add(key);
        return source[key];
      }
    }
    return undefined;
  };

  if (name === 'obfs-local') {
    const modeValue = take('obfs', 'mode');
    const mode = isPresent(modeValue) ? String(modeValue).toLowerCase() : 'http';
    if (!['http', 'tls'].includes(mode)) {
      issues.push({ field: 'plugin_opts.obfs', message: `obfs-local 不支持模式 [${mode}]` });
    } else {
      options.obfs = mode;
    }
    const host = take('obfs-host', 'host');
    if (isPresent(host)) options['obfs-host'] = String(host);
  } else {
    const modeValue = take('mode');
    const mode = modeValue !== undefined && modeValue !== null
      ? String(modeValue).toLowerCase()
      : 'websocket';
    if (!['websocket', 'quic'].includes(mode)) {
      issues.push({ field: 'plugin_opts.mode', message: `Sing-box v2ray-plugin 不支持模式 [${mode}]` });
    } else {
      options.mode = mode;
    }

    for (const key of ['host', 'path', 'cert', 'certRaw']) {
      const value = take(key);
      if (isPresent(value)) {
        const normalized = String(value);
        options[key] = normalized;
        if (key === 'path' && mode === 'websocket' && !hasValidPercentEncoding(normalized)) {
          issues.push({ field: 'plugin_opts.path', message: 'v2ray-plugin path 包含非法的百分号转义' });
        }
      }
    }

    const tlsValue = take('tls');
    if (isPresent(tlsValue)) {
      const tls = asBool(tlsValue);
      if (tls === undefined) issues.push({ field: 'plugin_opts.tls', message: 'v2ray-plugin tls 必须是布尔值' });
      else if (tls) options.tls = true;
    }
    if (mode === 'quic' && options.tls !== true) {
      issues.push({ field: 'plugin_opts.tls', message: 'v2ray-plugin QUIC 模式必须启用 TLS' });
    }
    if (options.tls === true && typeof options.certRaw === 'string') {
      if (!isValidX509CertificateBase64(options.certRaw)) {
        issues.push({ field: 'plugin_opts.certRaw', message: 'v2ray-plugin certRaw 必须是有效 DER 证书的 Base64 内容' });
      } else {
        runtimeWarnings.push({
          field: 'plugin_opts.certRaw',
          message: '已完成 v2ray-plugin 内联证书的本地结构校验；完整证书语义仍由最终 Sing-box 校验'
        });
      }
    }
    if (
      options.tls === true
      && typeof options.cert === 'string'
      && options.cert !== ''
      && typeof options.certRaw !== 'string'
    ) {
      runtimeWarnings.push({
        field: 'plugin_opts.cert',
        message: 'v2ray-plugin cert 指向的本地证书文件由最终 Sing-box 校验'
      });
    }

    const muxValue = take('mux');
    if (isPresent(muxValue)) {
      const muxBool = asBool(muxValue);
      const mux = muxBool === true ? 1 : muxBool === false ? 0 : strictNonNegativeInt(muxValue);
      if (mux === undefined) issues.push({ field: 'plugin_opts.mux', message: 'v2ray-plugin mux 必须是非负整数' });
      else options.mux = mux;
    }
  }

  for (const key of Object.keys(source)) {
    if (!handled.has(key)) {
      issues.push({
        field: `plugin_opts.${key}`,
        message: `Sing-box ${SINGBOX_VERSION} 的 ${name} 不支持参数 [${key}]`
      });
    }
  }
  return { name, options, issues, runtimeWarnings };
}

function validateShadowsocksCredentials(
  p: Record<string, any>,
  analysis: Analysis,
  methodAliases: string[] = ['cipher', 'method'],
  allowNativeLineBreaks = false
): void {
  const methodValue = first(p, ...methodAliases);
  const passwordValue = first(p, 'password');
  if (!isPresent(methodValue)) {
    addIssue(analysis, 'fatal', 'method', 'Shadowsocks 缺少加密方法');
    return;
  }
  const method = String(methodValue).toLowerCase();
  if (!SUPPORTED_SHADOWSOCKS_METHODS.has(method)) {
    addIssue(
      analysis,
      'fatal',
      'method',
      `Sing-box ${SINGBOX_VERSION} 不支持 Shadowsocks method [${methodValue}]`
    );
  }
  if (!isPresent(passwordValue) && method !== 'none') {
    addIssue(analysis, 'fatal', 'password', 'Shadowsocks 缺少密码');
    return;
  }
  validateScalarStringField(analysis, passwordValue, 'password', 'Shadowsocks', method !== 'none');
  if (!method.startsWith('2022-')) return;

  const expectedLength = method === '2022-blake3-aes-128-gcm' ? 16 : 32;
  const keys = String(passwordValue).split(':');
  if (method === '2022-blake3-chacha20-poly1305' && keys.length > 1) {
    addIssue(
      analysis,
      'fatal',
      'password',
      'Shadowsocks 2022 EIH 多密钥仅受 AES-128-GCM 与 AES-256-GCM 支持'
    );
    return;
  }
  if (keys.some(key => {
    const decoded = allowNativeLineBreaks
      ? strictNativeBase64Decode(key)
      : strictBase64Decode(key);
    return !decoded || decoded.length !== expectedLength;
  })) {
    addIssue(
      analysis,
      'fatal',
      'password',
      `Shadowsocks ${method} 的每个密钥必须是 ${expectedLength} 字节的标准 Base64`
    );
  }
}

function nativeTlsRequired(p: Record<string, any>, analysis: Analysis, protocol: string): void {
  const tls = asRecord(p.tls);
  if (!tls || tls.enabled !== true) {
    addIssue(
      analysis,
      'fatal',
      'tls.enabled',
      `原生 Sing-box ${protocol} outbound 要求启用 TLS`
    );
  }
}

function parseNativeRoutingMark(value: unknown): number | undefined {
  if (typeof value === 'number') return strictUint32(value);
  if (typeof value !== 'string' || value.startsWith('+')) return undefined;
  const unsigned = value;
  let normalized: string;
  if (/^0[xX]_?[0-9a-fA-F](?:_?[0-9a-fA-F])*$/.test(unsigned)) {
    normalized = `0x${unsigned.slice(2).replace(/_/g, '')}`;
  } else if (/^0[bB]_?[01](?:_?[01])*$/.test(unsigned)) {
    normalized = `0b${unsigned.slice(2).replace(/_/g, '')}`;
  } else if (/^0[oO]_?[0-7](?:_?[0-7])*$/.test(unsigned)) {
    normalized = `0o${unsigned.slice(2).replace(/_/g, '')}`;
  } else if (/^0(?:_?[0-7])+$/.test(unsigned) && unsigned !== '0') {
    normalized = `0o${unsigned.slice(1).replace(/_/g, '')}`;
  } else if (/^(?:0|[1-9](?:_?\d)*)$/.test(unsigned)) {
    normalized = unsigned.replace(/_/g, '');
  } else {
    return undefined;
  }
  const parsed = BigInt(normalized);
  return parsed <= 0xFFFFFFFFn ? Number(parsed) : undefined;
}

function validateNativeInterfaceTypes(
  analysis: Analysis,
  value: unknown,
  field: string
): void {
  const values = validateNativeStringListField(analysis, value, field);
  if (values?.some(item => !['wifi', 'cellular', 'ethernet', 'other'].includes(item))) {
    addIssue(
      analysis,
      'fatal',
      field,
      `原生 Sing-box ${field} 包含未知网络类型`
    );
  }
}

function validateNativeDialerOptions(
  p: Record<string, any>,
  analysis: Analysis,
  allowedDomainResolvers: ReadonlySet<string>
): void {
  for (const field of ['detour', 'bind_interface', 'protect_path', 'netns']) {
    validateNativeStringField(analysis, p[field], field, '原生 Sing-box outbound');
  }
  if (typeof p.detour === 'string' && p.detour !== '' && p.detour.trim() === '') {
    addIssue(analysis, 'fatal', 'detour', '原生 Sing-box detour 不能只包含空白字符');
  }
  for (const field of ['inet4_bind_address', 'inet6_bind_address']) {
    validateNativeStringField(analysis, p[field], field, '原生 Sing-box outbound');
    if (typeof p[field] === 'string' && !isValidNativeIpAddress(p[field])) {
      addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是有效 IP 地址`);
    }
  }
  for (const field of [
    'bind_address_no_port', 'reuse_addr', 'tcp_fast_open', 'tcp_multi_path',
    'disable_tcp_keep_alive', 'udp_fragment'
  ]) {
    validateNativeBooleanField(analysis, p[field], field);
  }
  if (p.bind_address_no_port === true) {
    addIssue(analysis, 'warn', 'bind_address_no_port', 'bind_address_no_port 是 Linux 专属字段');
  }
  if (typeof p.netns === 'string' && p.netns !== '') {
    addIssue(analysis, 'warn', 'netns', 'netns 是 Linux 专属字段');
  }
  if (typeof p.protect_path === 'string' && p.protect_path !== '') {
    addIssue(analysis, 'warn', 'protect_path', 'protect_path 仅适用于 Android VPNService');
  }
  for (const field of [
    'connect_timeout', 'tcp_keep_alive', 'tcp_keep_alive_interval', 'fallback_delay'
  ]) {
    validateNativeDurationField(analysis, p[field], field);
  }

  if (p.routing_mark !== undefined) {
    const routingMark = parseNativeRoutingMark(p.routing_mark);
    if (routingMark === undefined) {
      addIssue(analysis, 'fatal', 'routing_mark', '原生 Sing-box routing_mark 必须是 uint32 整数或数字字符串');
    } else if (routingMark !== 0) {
      addIssue(
        analysis,
        'warn',
        'routing_mark',
        'routing_mark 是 Linux 专属字段；在其他平台导入会被 sing-box 拒绝'
      );
    }
  }

  if (
    hasNativeValue(p.network_strategy)
    && (typeof p.network_strategy !== 'string'
      || !['default', 'fallback', 'hybrid'].includes(p.network_strategy))
  ) {
    addIssue(
      analysis,
      'fatal',
      'network_strategy',
      '原生 Sing-box network_strategy 仅支持 default、fallback 或 hybrid'
    );
  }
  validateNativeInterfaceTypes(analysis, p.network_type, 'network_type');
  validateNativeInterfaceTypes(analysis, p.fallback_network_type, 'fallback_network_type');
  if (
    hasNativeValue(p.domain_strategy)
    && (typeof p.domain_strategy !== 'string' || !NATIVE_DOMAIN_STRATEGIES.has(p.domain_strategy))
  ) {
    addIssue(analysis, 'fatal', 'domain_strategy', '原生 Sing-box domain_strategy 值非法');
  }

  const hasExplicitBind = isPresent(p.bind_interface)
    || isPresent(p.inet4_bind_address)
    || isPresent(p.inet6_bind_address)
    || p.tcp_fast_open === true;
  const networkType = nativeStringList(p.network_type) || [];
  const fallbackNetworkType = nativeStringList(p.fallback_network_type) || [];
  if (
    hasExplicitBind
    && (hasNativeValue(p.network_strategy)
      || (networkType.length > 0
        && fallbackNetworkType.length === 0
        && nativeDurationIsZero(p.fallback_delay)))
  ) {
    addIssue(
      analysis,
      'fatal',
      'network_strategy',
      'network_strategy 与 bind address / bind_interface / tcp_fast_open 冲突'
    );
  }

  const resolver = p.domain_resolver;
  let resolverTag: string | undefined;
  if (typeof resolver === 'string') {
    resolverTag = resolver;
  } else if (hasNativeValue(resolver)) {
    const resolverOptions = asRecord(resolver);
    if (!resolverOptions) {
      addIssue(
        analysis,
        'fatal',
        'domain_resolver',
        '原生 Sing-box domain_resolver 必须是字符串或对象'
      );
    } else {
      if (Object.keys(resolverOptions).length === 0) return;
      validateExactKeys(
        analysis,
        resolverOptions,
        new Set(['server', 'strategy', 'disable_cache', 'rewrite_ttl', 'client_subnet']),
        'domain_resolver'
      );
      validateNativeStringField(
        analysis,
        resolverOptions.server,
        'domain_resolver.server',
        'DNS resolver',
        true
      );
      if (typeof resolverOptions.server === 'string') resolverTag = resolverOptions.server;
      if (
        hasNativeValue(resolverOptions.strategy)
        && (typeof resolverOptions.strategy !== 'string'
          || !NATIVE_DOMAIN_STRATEGIES.has(resolverOptions.strategy))
      ) {
        addIssue(
          analysis,
          'fatal',
          'domain_resolver.strategy',
          '原生 Sing-box domain_resolver.strategy 值非法'
        );
      }
      validateNativeBooleanField(
        analysis,
        resolverOptions.disable_cache,
        'domain_resolver.disable_cache'
      );
      validateNativeIntegerField(
        analysis,
        resolverOptions.rewrite_ttl,
        'domain_resolver.rewrite_ttl',
        0,
        0xFFFFFFFF
      );
      validateNativeStringField(
        analysis,
        resolverOptions.client_subnet,
        'domain_resolver.client_subnet',
        'DNS resolver'
      );
      if (
        typeof resolverOptions.client_subnet === 'string'
        && !isValidNativePrefix(resolverOptions.client_subnet)
      ) {
        addIssue(
          analysis,
          'fatal',
          'domain_resolver.client_subnet',
          '原生 Sing-box domain_resolver.client_subnet 必须是有效 IP 或网段'
        );
      }
    }
  }
  if (resolverTag && !allowedDomainResolvers.has(resolverTag)) {
    addIssue(
      analysis,
      'fatal',
      'domain_resolver',
      `原生 outbound 引用了最终模板中不存在的 DNS server [${resolverTag}]`
    );
  }
}

function validateNativeTls(p: Record<string, any>, analysis: Analysis): void {
  if (hasNativeValue(p.tls) && !asRecord(p.tls)) {
    addIssue(analysis, 'fatal', 'tls', '原生 Sing-box tls 必须是对象');
    return;
  }
  const tls = asRecord(p.tls);
  if (!tls) return;
  validateExactKeys(analysis, tls, NATIVE_TLS_FIELDS, 'tls');
  const tlsActive = tls.enabled === true;

  for (const field of [
    'enabled', 'disable_sni', 'insecure', 'fragment', 'record_fragment', 'kernel_tx', 'kernel_rx'
  ]) {
    validateNativeBooleanField(analysis, tls[field], `tls.${field}`);
  }
  if (tls.enabled === true && tls.kernel_tx === true) {
    addIssue(analysis, 'warn', 'tls.kernel_tx', 'tls.kernel_tx 是 Linux kTLS 专属字段');
  }
  if (tls.enabled === true && tls.kernel_rx === true) {
    addIssue(analysis, 'warn', 'tls.kernel_rx', 'tls.kernel_rx 是 Linux kTLS 专属字段');
  }
  for (const field of [
    'server_name', 'certificate_path', 'client_certificate_path', 'client_key_path'
  ]) {
    validateNativeStringField(analysis, tls[field], `tls.${field}`, 'TLS');
  }
  for (const field of ['min_version', 'max_version']) {
    const value = tls[field];
    if (hasNativeValue(value) && typeof value !== 'string') {
      addIssue(analysis, 'fatal', `tls.${field}`, `原生 Sing-box tls.${field} 必须是字符串`);
    } else if (tlsActive && typeof value === 'string' && !['', '1.0', '1.1', '1.2', '1.3'].includes(value)) {
      addIssue(analysis, 'fatal', `tls.${field}`, `原生 Sing-box tls.${field} 必须是 1.0、1.1、1.2 或 1.3`);
    }
  }
  validateNativeDurationField(analysis, tls.fragment_fallback_delay, 'tls.fragment_fallback_delay');

  validateNativeNullableStringListField(analysis, tls.alpn, 'tls.alpn');
  const certificate = validateNativeNullableStringListField(
    analysis,
    tls.certificate,
    'tls.certificate'
  );
  const clientCertificate = validateNativeNullableStringListField(
    analysis,
    tls.client_certificate,
    'tls.client_certificate'
  );
  const clientKey = validateNativeNullableStringListField(
    analysis,
    tls.client_key,
    'tls.client_key'
  );
  if (tlsActive) {
    for (const [field, inlineValues] of [
      ['certificate_path', certificate],
      ['client_certificate_path', clientCertificate],
      ['client_key_path', clientKey]
    ] as const) {
      if (!inlineValues?.length && typeof tls[field] === 'string' && tls[field] !== '') {
        addRuntimeWarning(
          analysis,
          `tls.${field}`,
          `tls.${field} 指向的本地文件内容由最终 Sing-box 校验`
        );
      }
    }
  }
  const cipherSuites = validateNativeStringListField(
    analysis,
    tls.cipher_suites,
    'tls.cipher_suites'
  );
  if (tlsActive && cipherSuites?.some(cipher => !SUPPORTED_TLS_CIPHER_SUITES.has(cipher))) {
    addIssue(
      analysis,
      'fatal',
      'tls.cipher_suites',
      `Sing-box ${SINGBOX_VERSION} 包含未知 TLS cipher suite`
    );
  }
  const curves = validateNativeStringListField(
    analysis,
    tls.curve_preferences,
    'tls.curve_preferences'
  );
  if (tlsActive && curves?.some(curve => !['P256', 'P384', 'P521', 'X25519', 'X25519MLKEM768'].includes(curve.toUpperCase()))) {
    addIssue(
      analysis,
      'fatal',
      'tls.curve_preferences',
      `Sing-box ${SINGBOX_VERSION} 包含未知 TLS curve preference`
    );
  }
  const publicKeyHashes = validateNativeStringListField(
    analysis,
    tls.certificate_public_key_sha256,
    'tls.certificate_public_key_sha256'
  );
  if (tlsActive && publicKeyHashes?.some(value => !strictNativeBase64Decode(value))) {
    addIssue(
      analysis,
      'fatal',
      'tls.certificate_public_key_sha256',
      '原生 Sing-box TLS 公钥指纹必须是标准 Base64'
    );
  }
  if (
    tlsActive
    && publicKeyHashes?.length
    && ((certificate?.length || 0) > 0 || isPresent(tls.certificate_path))
  ) {
    addIssue(
      analysis,
      'fatal',
      'tls.certificate_public_key_sha256',
      'tls.certificate_public_key_sha256 与 certificate / certificate_path 冲突'
    );
  }

  const ech = asRecord(tls.ech);
  if (hasNativeValue(tls.ech) && !ech) {
    addIssue(analysis, 'fatal', 'tls.ech', '原生 Sing-box tls.ech 必须是对象');
  }
  if (ech) {
    validateExactKeys(
      analysis,
      ech,
      new Set([
        'enabled', 'config', 'config_path', 'query_server_name',
        'pq_signature_schemes_enabled', 'dynamic_record_sizing_disabled'
      ]),
      'tls.ech'
    );
    validateNativeBooleanField(analysis, ech.enabled, 'tls.ech.enabled');
    validateNativeBooleanField(
      analysis,
      ech.pq_signature_schemes_enabled,
      'tls.ech.pq_signature_schemes_enabled'
    );
    validateNativeBooleanField(
      analysis,
      ech.dynamic_record_sizing_disabled,
      'tls.ech.dynamic_record_sizing_disabled'
    );
    const echConfig = validateNativeNullableStringListField(
      analysis,
      ech.config,
      'tls.ech.config'
    );
    validateNativeStringField(analysis, ech.config_path, 'tls.ech.config_path', 'ECH');
    validateNativeStringField(
      analysis,
      ech.query_server_name,
      'tls.ech.query_server_name',
      'ECH'
    );
    if (tlsActive && ech.enabled === true) {
      if (ech.pq_signature_schemes_enabled === true) {
        addIssue(
          analysis,
          'fatal',
          'tls.ech.pq_signature_schemes_enabled',
          `Sing-box ${SINGBOX_VERSION} 已移除 ECH pq_signature_schemes_enabled`
        );
      }
      if (ech.dynamic_record_sizing_disabled === true) {
        addIssue(
          analysis,
          'fatal',
          'tls.ech.dynamic_record_sizing_disabled',
          `Sing-box ${SINGBOX_VERSION} 已移除 ECH dynamic_record_sizing_disabled`
        );
      }
      if (
        echConfig?.some(value => value !== '')
        && !validateSinglePemBlock(echConfig, 'ECH CONFIGS')
      ) {
        addIssue(analysis, 'fatal', 'tls.ech.config', 'ECH config 必须包含有效的 ECH CONFIGS PEM 块');
      }
      if (!echConfig?.length && typeof ech.config_path === 'string' && ech.config_path !== '') {
        addRuntimeWarning(
          analysis,
          'tls.ech.config_path',
          'tls.ech.config_path 指向的本地 ECH config 由最终 Sing-box 校验'
        );
      }
    }
  }

  const utls = asRecord(tls.utls);
  if (hasNativeValue(tls.utls) && !utls) {
    addIssue(analysis, 'fatal', 'tls.utls', '原生 Sing-box tls.utls 必须是对象');
  }
  if (utls) {
    validateExactKeys(analysis, utls, new Set(['enabled', 'fingerprint']), 'tls.utls');
    validateNativeBooleanField(analysis, utls.enabled, 'tls.utls.enabled');
    validateNativeStringField(analysis, utls.fingerprint, 'tls.utls.fingerprint', 'uTLS');
    if (
      tlsActive
      && utls.enabled === true
      && isPresent(utls.fingerprint)
      && !SUPPORTED_UTLS_FINGERPRINTS.has(String(utls.fingerprint))
    ) {
      addIssue(
        analysis,
        'fatal',
        'tls.utls.fingerprint',
        `Sing-box ${SINGBOX_VERSION} 不支持 uTLS fingerprint [${utls.fingerprint}]`
      );
    }
  }

  const reality = asRecord(tls.reality);
  if (hasNativeValue(tls.reality) && !reality) {
    addIssue(analysis, 'fatal', 'tls.reality', '原生 Sing-box tls.reality 必须是对象');
  }
  if (reality) {
    validateExactKeys(
      analysis,
      reality,
      new Set(['enabled', 'public_key', 'short_id']),
      'tls.reality'
    );
    validateNativeBooleanField(analysis, reality.enabled, 'tls.reality.enabled');
    validateNativeStringField(analysis, reality.public_key, 'tls.reality.public_key', 'Reality');
    validateNativeStringField(analysis, reality.short_id, 'tls.reality.short_id', 'Reality');
  }
  if (tlsActive && reality?.enabled === true) {
    if (ech?.enabled === true) {
      addIssue(analysis, 'fatal', 'tls.ech', 'Reality 与 ECH 不能同时启用');
    }
    if (tls.disable_sni === true) {
      addIssue(analysis, 'fatal', 'tls.disable_sni', 'Reality outbound 不能禁用 SNI');
    }
    if (!utls || utls.enabled !== true) {
      addIssue(analysis, 'fatal', 'tls.utls.enabled', 'Reality outbound 必须启用 uTLS');
    }
    validateNativeStringField(analysis, reality.public_key, 'tls.reality.public_key', 'Reality', true);
    if (!/^[A-Za-z0-9_-]{43}$/.test(String(reality.public_key || ''))) {
      addIssue(analysis, 'fatal', 'tls.reality.public_key', 'Reality public_key 必须是 32 字节 RawURL Base64');
    }
    if (isPresent(reality.short_id) && !/^(?:[0-9a-fA-F]{2}){1,8}$/.test(String(reality.short_id))) {
      addIssue(analysis, 'fatal', 'tls.reality.short_id', 'Reality short_id 必须是不超过 8 字节的偶数位十六进制字符串');
    }
  }

  const hasClientCertificate = clientCertificate?.length
    ? nativeStringListHasContent(clientCertificate)
    : isPresent(tls.client_certificate_path);
  const hasClientKey = clientKey?.length
    ? nativeStringListHasContent(clientKey)
    : isPresent(tls.client_key_path);
  if (tlsActive && hasClientCertificate && !hasClientKey) {
    addIssue(
      analysis,
      'fatal',
      'tls.client_key',
      'TLS client_certificate 必须与 client_key 成对提供'
    );
  } else if (tlsActive && hasClientKey && !hasClientCertificate) {
    addIssue(
      analysis,
      'fatal',
      'tls.client_certificate',
      'TLS client_key 必须与 client_certificate 成对提供'
    );
  }
  if (tlsActive) {
    const parsedCertificate = certificate && certificate.join('\n').length > 0
      ? validateCertificatePem(certificate, { usage: 'trust' })
      : undefined;
    if (parsedCertificate && !parsedCertificate.valid) {
      addIssue(analysis, 'fatal', 'tls.certificate', 'TLS certificate 必须至少包含一个有效且无 PEM header 的 X.509 证书');
    } else if (parsedCertificate?.runtimeValidation) {
      addRuntimeWarning(
        analysis,
        'tls.certificate',
        '已完成内联根证书的本地结构校验；完整证书语义仍由最终 Sing-box 校验'
      );
    }
    const parsedClientCertificate = clientCertificate && clientCertificate.join('\n').length > 0
      ? validateCertificatePem(clientCertificate)
      : undefined;
    if (parsedClientCertificate && !parsedClientCertificate.valid) {
      addIssue(analysis, 'fatal', 'tls.client_certificate', 'TLS client_certificate 必须包含有效的 PEM X.509 证书');
    } else if (parsedClientCertificate?.runtimeValidation) {
      addRuntimeWarning(
        analysis,
        'tls.client_certificate',
        '已完成 TLS 客户端证书的本地结构校验；完整证书语义仍由最终 Sing-box 校验'
      );
    }
    const parsedClientKey = clientKey && clientKey.join('\n').length > 0
      ? validatePrivateKeyPem(
          clientKey,
          new Set(['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY'])
        )
      : undefined;
    if (parsedClientKey && !parsedClientKey.valid) {
      addIssue(analysis, 'fatal', 'tls.client_key', 'TLS client_key 必须包含有效的 PEM 私钥');
    } else if (parsedClientKey?.runtimeValidation) {
      addRuntimeWarning(
        analysis,
        'tls.client_key',
        '该 TLS 私钥超出本地安全校验预算；完整密钥语义仍由最终 Sing-box 校验'
      );
    }
    if (
      parsedClientCertificate?.valid
      && parsedClientKey?.valid
      && publicKeyIdentitiesMatch(
        parsedClientCertificate.publicKey,
        parsedClientKey.publicKey
      ) === false
    ) {
      addIssue(analysis, 'fatal', 'tls.client_key', 'TLS client_certificate 与 client_key 公钥不匹配');
    }
  }
}

function validateNativeNetworkField(
  analysis: Analysis,
  value: unknown,
  field = 'network'
): void {
  if (!hasNativeValue(value)) return;
  const networks = nativeStringList(value);
  if (!networks || networks.some(network => !['tcp', 'udp'].includes(network))) {
    addIssue(
      analysis,
      'fatal',
      field,
      `原生 Sing-box ${field} 仅支持 tcp、udp 或其字符串数组`
    );
  }
}

function validateNativeServerPorts(
  analysis: Analysis,
  value: unknown,
  field = 'server_ports'
): void {
  if (!hasNativeValue(value)) return;
  const ranges = validateNativeStringListField(analysis, value, field);
  if (!ranges) return;
  const valid = ranges.every(range => {
    const colon = range.indexOf(':');
    if (colon < 0 || colon !== range.lastIndexOf(':')) return false;
    const start = range.slice(0, colon);
    const end = range.slice(colon + 1);
    const validPort = (port: string): boolean => (
      port === '' || (/^\d+$/.test(port) && Number(port) <= 65535)
    );
    return validPort(start) && validPort(end);
  });
  if (!valid) {
    addIssue(
      analysis,
      'fatal',
      field,
      `原生 Sing-box ${field} 必须使用 start:end 端口范围`
    );
  }
}

function validateNativeOutbound(
  node: NodeEnvelope,
  analysis: Analysis,
  options: SingBoxAdaptationOptions = {}
): void {
  const protocol = (node.protocol || '').toLowerCase();
  const p = node.protocolData as Record<string, any>;
  const protocolFields = NATIVE_PROTOCOL_FIELDS[protocol] || new Set<string>();
  validateExactKeys(
    analysis,
    p,
    new Set(['type', 'tag', 'server', 'server_port', ...NATIVE_DIALER_FIELDS, ...protocolFields])
  );
  validateNativeStringField(analysis, p.type, 'type', '原生 Sing-box outbound', true);
  if (typeof p.type === 'string' && p.type !== protocol) {
    addIssue(analysis, 'fatal', 'type', '原生 Sing-box outbound type 必须使用官方小写名称');
  }
  validateNativeStringField(analysis, p.tag, 'tag', '原生 Sing-box outbound');
  validateNativeStringField(analysis, p.server, 'server', '原生 Sing-box outbound', true);
  const sshDefaultPort = protocol === 'ssh'
    && (p.server_port === undefined || p.server_port === null || p.server_port === 0);
  if (!sshDefaultPort && (!Number.isInteger(p.server_port) || p.server_port < 1 || p.server_port > 65535)) {
    addIssue(analysis, 'fatal', 'server_port', '原生 Sing-box server_port 必须是 1..65535 的整数');
  }
  validateNativeDialerOptions(
    p,
    analysis,
    options.allowedDomainResolvers || DEFAULT_NATIVE_DNS_SERVER_TAGS
  );
  if (
    typeof p.detour === 'string'
    && ['🚀 节点选择', '⚡ 自动选择'].includes(p.detour)
    && node.source.nativeOutboundTags
    && !node.source.nativeOutboundTags.includes(p.detour)
  ) {
    addIssue(
      analysis,
      'fatal',
      'detour',
      `detour [${p.detour}] 会与生成器内置策略组形成循环依赖`
    );
  }
  validateNativeNetworkField(analysis, p.network);
  if (protocolFields.has('tls')) validateNativeTls(p, analysis);

  if (protocol === 'shadowsocks') {
    validateNativeStringField(analysis, p.method, 'method', '原生 Sing-box Shadowsocks', true);
    validateNativeStringField(
      analysis,
      p.password,
      'password',
      '原生 Sing-box Shadowsocks',
      String(p.method || '').toLowerCase() !== 'none'
    );
    if (typeof p.method === 'string' && p.method !== p.method.toLowerCase()) {
      addIssue(analysis, 'fatal', 'method', '原生 Sing-box Shadowsocks method 必须使用官方小写名称');
    }
    validateNativeShadowsocksPlugin(p, analysis);
    validateShadowsocksCredentials(p, analysis, ['method'], true);
    validateNativeUdpOverTcp(analysis, p.udp_over_tcp, 'Shadowsocks');
    validateMultiplex(p, analysis, true);
    if (hasNativeValue(p.udp_over_tcp) && hasNativeValue(p.multiplex)) {
      const uot = asRecord(p.udp_over_tcp);
      const multiplex = asRecord(p.multiplex);
      if ((p.udp_over_tcp === true || uot?.enabled === true) && multiplex?.enabled === true) {
        addIssue(analysis, 'fatal', 'udp_over_tcp', 'Shadowsocks udp_over_tcp 与 multiplex 不能同时启用');
      }
    }
  } else if (protocol === 'vmess') {
    validateNativeStringField(analysis, p.uuid, 'uuid', '原生 Sing-box VMess');
    validateNativeStringField(analysis, p.security, 'security', '原生 Sing-box VMess');
    const security = typeof p.security === 'string' && p.security ? p.security : 'auto';
    if (typeof p.security === 'string' && !SUPPORTED_VMESS_SECURITY.has(security)) {
      addIssue(analysis, 'fatal', 'security', `Sing-box 不支持 VMess security [${p.security}]`);
    }
    validateNativeIntegerField(analysis, p.alter_id, 'alter_id');
    validateNativeBooleanField(analysis, p.global_padding, 'global_padding');
    validateNativeBooleanField(analysis, p.authenticated_length, 'authenticated_length');
    const packetEncoding = p.packet_encoding;
    validateNativeStringField(analysis, packetEncoding, 'packet_encoding', '原生 Sing-box VMess');
    if (typeof packetEncoding === 'string' && !['', 'packetaddr', 'xudp'].includes(packetEncoding)) {
      addIssue(analysis, 'fatal', 'packet_encoding', `Sing-box 不支持 VMess packet_encoding [${packetEncoding}]`);
    }
    validateNativeV2RayTransport(p, analysis);
    validateMultiplex(p, analysis, true);
  } else if (protocol === 'vless') {
    validateNativeStringField(analysis, p.uuid, 'uuid', '原生 Sing-box VLESS');
    validateNativeStringField(analysis, p.flow, 'flow', '原生 Sing-box VLESS');
    if (typeof p.flow === 'string' && !['', 'xtls-rprx-vision'].includes(p.flow)) {
      addIssue(analysis, 'fatal', 'flow', `Sing-box 不支持 VLESS flow [${p.flow}]`);
    }
    validateNativeStringField(
      analysis,
      p.packet_encoding,
      'packet_encoding',
      '原生 Sing-box VLESS'
    );
    if (typeof p.packet_encoding === 'string' && !['', 'packetaddr', 'xudp'].includes(p.packet_encoding)) {
      addIssue(analysis, 'fatal', 'packet_encoding', `Sing-box 不支持 VLESS packet_encoding [${p.packet_encoding}]`);
    }
    validateNativeV2RayTransport(p, analysis);
    validateMultiplex(p, analysis, true);
  } else if (protocol === 'trojan') {
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box Trojan', true);
    validateNativeV2RayTransport(p, analysis);
    validateMultiplex(p, analysis, true);
  } else if (protocol === 'anytls') {
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box AnyTLS', true);
    validateNativeStringField(analysis, p.client_metadata, 'client_metadata', '原生 Sing-box AnyTLS');
    nativeTlsRequired(p, analysis, 'AnyTLS');
    if (asBool(p.tcp_fast_open) === true) {
      addIssue(analysis, 'fatal', 'tcp_fast_open', 'Sing-box AnyTLS outbound 不支持 tcp_fast_open');
    }
    for (const [field, value] of [
      ['idle_session_check_interval', p.idle_session_check_interval],
      ['idle_session_timeout', p.idle_session_timeout]
    ] as const) {
      validateNativeDurationField(analysis, value, field);
    }
    validateNativeIntegerField(analysis, p.min_idle_session, 'min_idle_session', 0);
  } else if (protocol === 'hysteria2') {
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box Hysteria2');
    nativeTlsRequired(p, analysis, 'Hysteria2');
    validateNativeDurationField(analysis, p.hop_interval, 'hop_interval');
    validateNativeServerPorts(analysis, p.server_ports);
    validateNativeIntegerField(analysis, p.up_mbps, 'up_mbps');
    validateNativeIntegerField(analysis, p.down_mbps, 'down_mbps');
    validateNativeBooleanField(analysis, p.brutal_debug, 'brutal_debug');
    if (hasNativeValue(p.obfs)) {
      const obfs = asRecord(p.obfs);
      if (!obfs) {
        addIssue(analysis, 'fatal', 'obfs', '原生 Sing-box Hysteria2 obfs 必须是对象');
      } else {
        validateExactKeys(analysis, obfs, new Set(['type', 'password']), 'obfs');
        validateNativeStringField(analysis, obfs.type, 'obfs.type', 'Hysteria2 obfs', true);
        validateNativeStringField(analysis, obfs.password, 'obfs.password', 'Hysteria2 obfs', true);
        if (typeof obfs.type === 'string' && obfs.type !== 'salamander') {
          addIssue(
            analysis,
            'fatal',
            'obfs.type',
            `Sing-box ${SINGBOX_VERSION} 不支持 Hysteria2 obfs [${obfs.type}]`
          );
        }
      }
    }
  } else if (protocol === 'tuic') {
    validateTuicUuid(analysis, p.uuid);
    if (isPresent(p.version)) {
      addIssue(analysis, 'fatal', 'version', '原生 Sing-box TUIC outbound 不包含 version 字段');
    }
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box TUIC');
    nativeTlsRequired(p, analysis, 'TUIC');
    validateNativeStringField(
      analysis,
      p.congestion_control,
      'congestion_control',
      '原生 Sing-box TUIC'
    );
    const congestion = typeof p.congestion_control === 'string' && p.congestion_control
      ? p.congestion_control
      : 'cubic';
    if (typeof p.congestion_control === 'string' && !['cubic', 'new_reno', 'bbr'].includes(congestion)) {
      addIssue(analysis, 'fatal', 'congestion_control', `Sing-box 不支持 TUIC congestion_control [${p.congestion_control}]`);
    }
    validateNativeStringField(
      analysis,
      p.udp_relay_mode,
      'udp_relay_mode',
      '原生 Sing-box TUIC'
    );
    if (typeof p.udp_relay_mode === 'string' && !['', 'native', 'quic'].includes(p.udp_relay_mode)) {
      addIssue(analysis, 'fatal', 'udp_relay_mode', `Sing-box 不支持 TUIC udp_relay_mode [${p.udp_relay_mode}]`);
    }
    validateNativeBooleanField(analysis, p.udp_over_stream, 'udp_over_stream');
    validateNativeBooleanField(analysis, p.zero_rtt_handshake, 'zero_rtt_handshake');
    if (p.udp_over_stream === true && isPresent(p.udp_relay_mode)) {
      addIssue(analysis, 'fatal', 'udp_over_stream', 'TUIC udp_over_stream 与 udp_relay_mode 冲突');
    }
    validateNativeDurationField(analysis, p.heartbeat, 'heartbeat');
  } else if (protocol === 'naive') {
    validateNativeStringField(analysis, p.username, 'username', '原生 Sing-box Naive');
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box Naive');
    validateNativeIntegerField(analysis, p.insecure_concurrency, 'insecure_concurrency');
    validateNativeHeadersField(analysis, p.extra_headers, 'extra_headers');
    validateNativeUdpOverTcp(analysis, p.udp_over_tcp, 'Naive');
    validateNativeBooleanField(analysis, p.quic, 'quic');
    validateNativeStringField(
      analysis,
      p.quic_congestion_control,
      'quic_congestion_control',
      '原生 Sing-box Naive'
    );
    if (
      typeof p.quic_congestion_control === 'string'
      && !['', 'bbr', 'bbr2', 'cubic', 'reno'].includes(p.quic_congestion_control)
    ) {
      addIssue(
        analysis,
        'fatal',
        'quic_congestion_control',
        `Sing-box 不支持 Naive quic_congestion_control [${p.quic_congestion_control}]`
      );
    }
    nativeTlsRequired(p, analysis, 'Naive');
    const tls = asRecord(p.tls);
    if (tls) {
      const unsupportedNaiveTls = [
        'disable_sni', 'insecure', 'alpn', 'min_version', 'max_version',
        'cipher_suites', 'curve_preferences', 'certificate_public_key_sha256',
        'client_certificate',
        'client_certificate_path', 'client_key', 'client_key_path', 'fragment',
        'fragment_fallback_delay', 'record_fragment', 'kernel_tx', 'kernel_rx',
        'utls', 'reality'
      ];
      for (const field of unsupportedNaiveTls) {
        const value = tls[field];
        const enabledObject = asRecord(value)?.enabled === true;
        const active = Array.isArray(value)
          ? value.length > 0
          : asRecord(value)
          ? enabledObject
          : Boolean(value);
        if (active) {
          addIssue(
            analysis,
            'fatal',
            `tls.${field}`,
            `Sing-box Naive outbound 不支持 tls.${field}`
          );
        }
      }
    }
  } else if (protocol === 'socks') {
    validateNativeStringField(analysis, p.version, 'version', '原生 Sing-box SOCKS');
    validateNativeStringField(analysis, p.username, 'username', '原生 Sing-box SOCKS');
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box SOCKS');
    validateNativeUdpOverTcp(analysis, p.udp_over_tcp, 'SOCKS');
    const version = typeof p.version === 'string' && p.version ? p.version : '5';
    if (typeof p.version === 'string' && !['4', '4a', '5'].includes(version)) {
      addIssue(analysis, 'fatal', 'version', `Sing-box 不支持 SOCKS version [${p.version}]`);
    }
  } else if (protocol === 'http') {
    validateNativeStringField(analysis, p.username, 'username', '原生 Sing-box HTTP');
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box HTTP');
    validateNativeStringField(analysis, p.path, 'path', '原生 Sing-box HTTP');
    validateNativeHeadersField(analysis, p.headers, 'headers');
  } else if (protocol === 'hysteria') {
    nativeTlsRequired(p, analysis, 'Hysteria');
    validateNativeServerPorts(analysis, p.server_ports);
    validateNativeDurationField(analysis, p.hop_interval, 'hop_interval');
    validateNativeHysteriaBandwidth(analysis, p.up, p.up_mbps, 'up');
    validateNativeHysteriaBandwidth(analysis, p.down, p.down_mbps, 'down');
    validateNativeStringField(analysis, p.obfs, 'obfs', '原生 Sing-box Hysteria');
    if (isPresent(p.auth) && (typeof p.auth !== 'string' || !strictNativeBase64Decode(p.auth))) {
      addIssue(analysis, 'fatal', 'auth', '原生 Sing-box Hysteria auth 必须是标准 Base64 字符串');
    }
    validateNativeStringField(analysis, p.auth_str, 'auth_str', '原生 Sing-box Hysteria');
    validateNativeIntegerField(analysis, p.recv_window_conn, 'recv_window_conn', 0);
    validateNativeIntegerField(analysis, p.recv_window, 'recv_window', 0);
    validateNativeBooleanField(analysis, p.disable_mtu_discovery, 'disable_mtu_discovery');
  } else if (protocol === 'shadowtls') {
    nativeTlsRequired(p, analysis, 'ShadowTLS');
    validateNativeStringField(analysis, p.password, 'password', '原生 Sing-box ShadowTLS');
    const version = hasNativeValue(p.version) && isNativeInteger(p.version)
      ? p.version
      : hasNativeValue(p.version)
      ? undefined
      : 1;
    if (version === undefined) {
      addIssue(analysis, 'fatal', 'version', 'ShadowTLS version 必须是 1、2 或 3');
      return;
    }
    if (![0, 1, 2, 3].includes(version)) {
      addIssue(analysis, 'fatal', 'version', `Sing-box 不支持 ShadowTLS version [${p.version}]`);
    }
    if (version === 0 || version === 1) {
      const tls = asRecord(p.tls);
      for (const field of ['min_version', 'max_version']) {
        const value = tls?.[field];
        if (typeof value === 'string' && value !== '' && value !== '1.2') {
          addIssue(
            analysis,
            'fatal',
            `tls.${field}`,
            `ShadowTLS v1 强制使用 TLS 1.2，无法保留 tls.${field} [${value}]`
          );
        }
      }
    }
  } else if (protocol === 'ssh') {
    for (const field of [
      'user', 'password', 'private_key_path', 'private_key_passphrase', 'client_version'
    ]) {
      validateNativeStringField(analysis, p[field], field, '原生 Sing-box SSH');
    }
    for (const field of ['private_key', 'host_key']) {
      validateNativeStringListField(analysis, p[field], field);
    }
    validateNativeNullableStringListField(
      analysis,
      p.host_key_algorithms,
      'host_key_algorithms'
    );
    const privateKey = nativeStringList(p.private_key);
    if (!privateKey?.length && typeof p.private_key_path === 'string' && p.private_key_path !== '') {
      addRuntimeWarning(
        analysis,
        'private_key_path',
        'SSH private_key_path 指向的本地私钥及口令由最终 Sing-box 校验'
      );
    }
    const parsedPrivateKey = privateKey?.length
      ? validatePrivateKeyPem(
          privateKey,
          new Set([
            'OPENSSH PRIVATE KEY', 'PRIVATE KEY',
            'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'DSA PRIVATE KEY'
          ]),
          true
        )
      : undefined;
    if (parsedPrivateKey && !parsedPrivateKey.valid) {
      addIssue(analysis, 'fatal', 'private_key', 'SSH private_key 必须包含有效的 PEM/OpenSSH 私钥');
    } else if (parsedPrivateKey?.valid) {
      const hasPassphrase = typeof p.private_key_passphrase === 'string'
        && p.private_key_passphrase.length > 0;
      if (Boolean(parsedPrivateKey.encrypted) !== hasPassphrase) {
        addIssue(
          analysis,
          'fatal',
          'private_key_passphrase',
          parsedPrivateKey.encrypted
            ? '加密 SSH private_key 必须提供 private_key_passphrase'
            : '未加密 SSH private_key 不能提供 private_key_passphrase'
        );
      } else if (parsedPrivateKey.runtimeValidation) {
        addRuntimeWarning(
          analysis,
          parsedPrivateKey.encrypted ? 'private_key_passphrase' : 'private_key',
          parsedPrivateKey.encrypted
            ? '已验证加密 SSH 私钥封装；口令、密文完整性及解密后的密钥由最终 Sing-box 校验'
            : '已完成 SSH 私钥的本地结构校验；完整密钥语义仍由最终 Sing-box 校验'
        );
      }
    }
    const hostKeys = nativeStringList(p.host_key);
    if (hostKeys?.some(hostKey => !hasValidAuthorizedSshKey(hostKey))) {
      addIssue(analysis, 'fatal', 'host_key', 'SSH host_key 必须使用有效的 authorized_keys 公钥格式');
    }
  }
}

function buildMultiplex(value: unknown): Record<string, any> | undefined {
  if (!isPresent(value)) return undefined;
  const boolValue = asBool(value);
  if (boolValue !== undefined) {
    return boolValue ? { enabled: true, protocol: 'smux' } : undefined;
  }
  const source = asRecord(value);
  if (!source) return undefined;
  const enabled = asBool(first(source, 'enabled'));
  if (enabled === false) return undefined;
  const multiplex: Record<string, any> = {
    enabled: true,
    protocol: String(first(source, 'protocol') || 'smux').toLowerCase()
  };
  const integerFields: Array<[string, string[]]> = [
    ['max_connections', ['max_connections', 'max-connections', 'maxConnections']],
    ['min_streams', ['min_streams', 'min-streams', 'minStreams']],
    ['max_streams', ['max_streams', 'max-streams', 'maxStreams']]
  ];
  for (const [target, aliases] of integerFields) {
    const parsed = strictPositiveInt(first(source, ...aliases));
    if (parsed !== undefined) multiplex[target] = parsed;
  }
  const padding = asBool(first(source, 'padding'));
  if (padding !== undefined) multiplex.padding = padding;
  return multiplex;
}

function validateMultiplex(
  p: Record<string, any>,
  analysis: Analysis,
  native = false
): void {
  if (native && isPresent(p.smux)) {
    addIssue(analysis, 'fatal', 'smux', '原生 Sing-box outbound 必须使用 multiplex 字段');
  }
  const value = native ? p.multiplex : first(p, 'smux', 'multiplex');
  if (native ? !hasNativeValue(value) : !isPresent(value)) return;
  if (native && !asRecord(value)) {
    addIssue(analysis, 'fatal', 'multiplex', '原生 Sing-box multiplex 必须是对象');
    return;
  }
  if (!native && asBool(value) !== undefined) return;

  const source = asRecord(value);
  if (!source) {
    addIssue(analysis, 'fatal', 'multiplex', 'Sing-box multiplex 必须是布尔值或对象');
    return;
  }
  const enabled = native ? source.enabled : first(source, 'enabled');
  const enabledValid = native ? typeof enabled === 'boolean' : asBool(enabled) !== undefined;
  if ((native ? hasNativeValue(enabled) : isPresent(enabled)) && !enabledValid) {
    addIssue(analysis, 'fatal', 'multiplex.enabled', 'multiplex.enabled 必须是布尔值');
  }
  if (!native && asBool(enabled) === false) return;
  const multiplexActive = !native || enabled === true;

  const rawProtocol = native ? source.protocol : first(source, 'protocol');
  const protocol = native
    ? String(rawProtocol || '')
    : String(rawProtocol || 'smux').toLowerCase();
  if (native && hasNativeValue(rawProtocol) && typeof rawProtocol !== 'string') {
    addIssue(analysis, 'fatal', 'multiplex.protocol', '原生 Sing-box multiplex.protocol 必须是字符串');
  } else if (multiplexActive && !['', 'smux', 'yamux', 'h2mux'].includes(protocol)) {
    addIssue(
      analysis,
      'fatal',
      'multiplex.protocol',
      `Sing-box ${SINGBOX_VERSION} 不支持 multiplex protocol [${protocol}]`
    );
  }

  const maxConnections = strictNonNegativeInt(first(
    source, 'max_connections', 'max-connections', 'maxConnections'
  ));
  const minStreams = strictNonNegativeInt(first(source, 'min_streams', 'min-streams', 'minStreams'));
  const maxStreams = strictNonNegativeInt(first(source, 'max_streams', 'max-streams', 'maxStreams'));
  for (const [field, aliases] of [
    ['max_connections', ['max_connections', 'max-connections', 'maxConnections']],
    ['min_streams', ['min_streams', 'min-streams', 'minStreams']],
    ['max_streams', ['max_streams', 'max-streams', 'maxStreams']]
  ] as const) {
    const raw = native ? source[field] : first(source, ...aliases);
    const valid = native
      ? typeof raw === 'number' && Number.isSafeInteger(raw) && (!multiplexActive || raw >= 0)
      : strictNonNegativeInt(raw) !== undefined;
    if ((native ? hasNativeValue(raw) : isPresent(raw)) && !valid) {
      addIssue(analysis, 'fatal', `multiplex.${field}`, `multiplex.${field} 必须是非负整数`);
    }
  }
  const padding = native ? source.padding : first(source, 'padding');
  const paddingValid = native ? typeof padding === 'boolean' : asBool(padding) !== undefined;
  if ((native ? hasNativeValue(padding) : isPresent(padding)) && !paddingValid) {
    addIssue(analysis, 'fatal', 'multiplex.padding', 'multiplex.padding 必须是布尔值');
  }
  if (multiplexActive && (maxStreams || 0) > 0 && ((maxConnections || 0) > 0 || (minStreams || 0) > 0)) {
    addIssue(
      analysis,
      'fatal',
      'multiplex.max_streams',
      'multiplex.max_streams 与 max_connections / min_streams 冲突'
    );
  }

  if (native && hasNativeValue(source.brutal)) {
    const brutal = asRecord(source.brutal);
    if (!brutal) {
      addIssue(analysis, 'fatal', 'multiplex.brutal', 'multiplex.brutal 必须是对象');
    } else {
      validateExactKeys(
        analysis,
        brutal,
        new Set(['enabled', 'up_mbps', 'down_mbps']),
        'multiplex.brutal'
      );
      if (hasNativeValue(brutal.enabled) && typeof brutal.enabled !== 'boolean') {
        addIssue(analysis, 'fatal', 'multiplex.brutal.enabled', 'multiplex.brutal.enabled 必须是布尔值');
      }
      for (const field of ['up_mbps', 'down_mbps']) {
        const raw = brutal[field];
        if (
          hasNativeValue(raw)
          && (
            typeof raw !== 'number'
            || !Number.isSafeInteger(raw)
            || (multiplexActive && brutal.enabled === true && raw < 0)
          )
        ) {
          addIssue(analysis, 'fatal', `multiplex.brutal.${field}`, `multiplex.brutal.${field} 必须是非负整数`);
        }
      }
      if (
        multiplexActive
        && brutal.enabled === true
        && ((brutal.up_mbps || 0) < 1 || (brutal.down_mbps || 0) < 1)
      ) {
        addIssue(analysis, 'fatal', 'multiplex.brutal', '启用 multiplex.brutal 时上下行 Mbps 必须大于 0');
      }
    }
  }

  const known = native
    ? new Set(['enabled', 'protocol', 'max_connections', 'min_streams', 'max_streams', 'padding', 'brutal'])
    : new Set([
      'enabled', 'protocol', 'max_connections', 'max-connections', 'maxConnections',
      'min_streams', 'min-streams', 'minStreams', 'max_streams', 'max-streams',
      'maxStreams', 'padding'
    ]);
  for (const key of Object.keys(source)) {
    if (!known.has(key)) {
      addIssue(
        analysis,
        native ? 'fatal' : 'warn',
        `multiplex.${key}`,
        `Sing-box 目标未映射 multiplex 参数 [${key}]`
      );
    }
  }
}

function validateShadowsocksTransportFeatures(
  p: Record<string, any>,
  analysis: Analysis,
  native = false
): void {
  const rawUot = first(p, 'udpOverTcp', 'udp-over-tcp', 'udp_over_tcp');
  const uotObject = asRecord(rawUot);
  const enabled = uotObject
    ? asBool(first(uotObject, 'enabled'))
    : asBool(rawUot);
  const nativeEnabledValid = uotObject
    ? typeof uotObject.enabled === 'boolean'
    : typeof rawUot === 'boolean';
  if (isPresent(rawUot) && (enabled === undefined || (native && !nativeEnabledValid))) {
    addIssue(analysis, 'fatal', 'udp_over_tcp', 'Shadowsocks udp_over_tcp.enabled 必须是布尔值');
  }

  const versionValue = uotObject
    ? first(uotObject, 'version')
    : first(p, 'udpOverTcpVersion', 'udp-over-tcp-version', 'udp_over_tcp_version');
  if (isPresent(versionValue)) {
    const version = strictPositiveInt(versionValue);
    const nativeVersionValid = typeof versionValue === 'number' && Number.isInteger(versionValue);
    if (version === undefined || ![1, 2].includes(version) || (native && !nativeVersionValid)) {
      addIssue(
        analysis,
        'fatal',
        'udp_over_tcp.version',
        `Sing-box ${SINGBOX_VERSION} 仅支持 UDP-over-TCP version 1 或 2`
      );
    }
  }

  if (enabled === true && (native ? isPresent(p.multiplex) : Boolean(buildMultiplex(first(p, 'smux', 'multiplex'))))) {
    addIssue(
      analysis,
      'fatal',
      'udp_over_tcp',
      'Shadowsocks udp_over_tcp 与 multiplex 不能同时启用'
    );
  }
}

function buildBase(node: NodeEnvelope, p: Record<string, any>): Record<string, any> {
  const base: Record<string, any> = {
    tag: node.name,
    server: node.server,
    server_port: node.port
  };
  const tcpFastOpen = asBool(first(p, 'tfo', 'tcp-fast-open', 'tcp_fast_open'));
  if (tcpFastOpen !== undefined) base.tcp_fast_open = tcpFastOpen;
  const bindInterface = first(p, 'interface-name', 'interface_name');
  if (bindInterface) base.bind_interface = String(bindInterface);
  const routingMark = strictPositiveUint32(first(p, 'routing-mark', 'routing_mark'));
  if (routingMark !== undefined) base.routing_mark = routingMark;
  return base;
}

function applyNetworkRestriction(outbound: Record<string, any>, node: NodeEnvelope): void {
  if (node.udp === false) outbound.network = 'tcp';
}

function realityOptions(p: Record<string, any>): Record<string, any> | undefined {
  return asRecord(p.realityOpts)
    || asRecord(p['reality-opts'])
    || asRecord(p.reality_opts)
    || asRecord(p.reality);
}

function buildTls(
  node: NodeEnvelope,
  p: Record<string, any>,
  options: { always?: boolean; utls?: boolean } = {}
): Record<string, any> | undefined {
  const reality = realityOptions(p);
  const security = String(first(p, 'security') || '').toLowerCase();
  const tlsFlag = asBool(first(p, 'tls'));
  const enabled = options.always
    || tlsFlag === true
    || security === 'tls'
    || security === 'reality'
    || Boolean(reality);
  if (!enabled) return undefined;

  const tls: Record<string, any> = { enabled: true };
  const serverName = first(p, 'sni', 'servername', 'server-name', 'server_name') || node.server;
  const disableSni = asBool(first(p, 'disableSni', 'disable-sni', 'disable_sni'));
  if (disableSni !== undefined) tls.disable_sni = disableSni;
  if (serverName) tls.server_name = scalarString(serverName);

  const insecure = asBool(first(
    p,
    'skipCertVerify', 'skip-cert-verify', 'skip_cert_verify', 'insecure', 'allowInsecure'
  ));
  if (insecure !== undefined) tls.insecure = insecure;
  const alpn = asStringList(first(p, 'alpn'));
  if (alpn) tls.alpn = alpn;

  const fingerprint = first(p, 'fingerprint', 'fp', 'client-fingerprint', 'client_fingerprint');
  if ((fingerprint || reality) && options.utls !== false) {
    tls.utls = { enabled: true, fingerprint: String(fingerprint || 'chrome').toLowerCase() };
  }

  if (reality) {
    const publicKey = first(reality, 'publicKey', 'public-key', 'public_key');
    if (publicKey) {
      tls.reality = {
        enabled: true,
        public_key: String(publicKey),
        short_id: String(first(reality, 'shortId', 'short-id', 'short_id') || '')
      };
    }
  }
  return tls;
}

function buildTransport(node: NodeEnvelope, p: Record<string, any>): Record<string, any> | undefined {
  const type = transportType(node, p);
  if (type === 'tcp') return undefined;
  if (!SUPPORTED_V2RAY_TRANSPORTS.has(type)) return undefined;

  const nested = asRecord(p.transport) || {};
  if (type === 'ws') {
    const opts = asRecord(first(p, 'ws-opts', 'ws_opts', 'wsOpts')) || {};
    const path = first(nested, 'path') || first(opts, 'path') || first(p, 'wsPath', 'path');
    const transport: Record<string, any> = {
      type: 'ws',
      path: scalarString(path) || '/'
    };
    const headers = normalizeHttpHeaders(first(nested, 'headers'))
      || normalizeHttpHeaders(first(opts, 'headers'))
      || normalizeHttpHeaders(first(p, 'wsHeaders'));
    const host = first(p, 'host');
    if (headers && Object.keys(headers).length > 0) transport.headers = headers;
    else if (host) transport.headers = { Host: String(host) };
    const maxEarlyData = strictUint32(first(opts, 'max-early-data', 'max_early_data', 'maxEarlyData'));
    if (maxEarlyData !== undefined) transport.max_early_data = maxEarlyData;
    const earlyHeader = first(opts, 'early-data-header-name', 'early_data_header_name', 'earlyDataHeaderName');
    if (earlyHeader) transport.early_data_header_name = String(earlyHeader);
    return transport;
  }

  if (type === 'grpc') {
    const opts = asRecord(first(p, 'grpc-opts', 'grpc_opts', 'grpcOpts')) || {};
    const transport: Record<string, any> = {
      type: 'grpc',
      service_name: scalarString(first(
        nested,
        'serviceName', 'service_name'
      ) || first(opts, 'grpc-service-name', 'service-name', 'service_name', 'serviceName')
        || first(p, 'grpcServiceName', 'serviceName', 'path')) || ''
    };
    const idle = normalizeDuration(first(opts, 'idle-timeout', 'idle_timeout', 'idleTimeout'));
    const ping = normalizeDuration(first(opts, 'ping-timeout', 'ping_timeout', 'pingTimeout'));
    if (idle) transport.idle_timeout = idle;
    if (ping) transport.ping_timeout = ping;
    const permit = asBool(first(opts, 'permit-without-stream', 'permit_without_stream', 'permitWithoutStream'));
    if (permit !== undefined) transport.permit_without_stream = permit;
    return transport;
  }

  if (type === 'http' || type === 'h2') {
    const opts = asRecord(first(
      p,
      'http-opts', 'http_opts', 'httpOpts', 'h2-opts', 'h2_opts', 'h2Opts'
    )) || {};
    const pathValue = first(nested, 'httpPath', 'path') || first(opts, 'path') || first(p, 'httpPath', 'path');
    const path = scalarString(Array.isArray(pathValue) ? pathValue[0] : pathValue);
    const nestedHeaders = normalizeHttpHeaders(first(nested, 'headers'));
    const optsHeaders = normalizeHttpHeaders(first(opts, 'headers'));
    const host = asStringList(
      first(nested, 'httpHost', 'host')
      || first(nestedHeaders || {}, 'Host', 'host')
      || first(opts, 'host')
      || first(optsHeaders || {}, 'Host', 'host')
      || first(p, 'httpHost', 'host')
    );
    const transport: Record<string, any> = { type: 'http' };
    if (path) transport.path = path;
    if (host) transport.host = host;
    const method = first(opts, 'method');
    const headers = optsHeaders || nestedHeaders;
    if (method) transport.method = scalarString(method);
    if (headers) transport.headers = headers;
    const idle = normalizeDuration(first(opts, 'idle-timeout', 'idle_timeout', 'idleTimeout'));
    const ping = normalizeDuration(first(opts, 'ping-timeout', 'ping_timeout', 'pingTimeout'));
    if (idle) transport.idle_timeout = idle;
    if (ping) transport.ping_timeout = ping;
    return transport;
  }

  if (type === 'httpupgrade' || type === 'http-upgrade') {
    const opts = asRecord(first(
      p,
      'http-upgrade-opts', 'http_upgrade_opts', 'httpUpgradeOpts'
    )) || {};
    const transport: Record<string, any> = {
      type: 'httpupgrade',
      path: scalarString(first(nested, 'path') || first(opts, 'path') || first(p, 'path')) || '/'
    };
    const nestedHeaders = normalizeHttpHeaders(first(nested, 'headers'));
    const optsHeaders = normalizeHttpHeaders(first(opts, 'headers'));
    const host = first(nested, 'host')
      || first(nestedHeaders || {}, 'Host', 'host')
      || first(opts, 'host')
      || first(optsHeaders || {}, 'Host', 'host')
      || first(p, 'host');
    const headers = optsHeaders || nestedHeaders;
    if (host) transport.host = scalarString(host);
    if (headers) transport.headers = headers;
    return transport;
  }

  return { type: 'quic' };
}

function validateV2RayTransportFields(
  type: string,
  p: Record<string, any>,
  analysis: Analysis
): void {
  const nested = asRecord(p.transport) || {};
  const checkScalar = (field: string, value: unknown): void => {
    if (isPresent(value) && scalarString(value) === undefined) {
      addIssue(analysis, 'fatal', field, `${field} 必须是字符串或可无损转为字符串的标量`);
    }
  };
  const checkPath = (value: unknown): void => {
    checkScalar('transport.path', value);
    const path = scalarString(value);
    if (path !== undefined && !hasValidPercentEncoding(path)) {
      addIssue(analysis, 'fatal', 'transport.path', 'transport.path 包含非法的百分号转义');
    }
  };
  const checkHeaders = (field: string, value: unknown): void => {
    if (isPresent(value) && normalizeHttpHeaders(value) === undefined) {
      addIssue(analysis, 'fatal', field, `${field} 必须是仅包含字符串标量或字符串数组的对象`);
    }
  };
  const checkOptions = (field: string, value: unknown): Record<string, any> => {
    if (isPresent(value) && !asRecord(value)) {
      addIssue(analysis, 'fatal', field, `${field} 必须是对象`);
    }
    return asRecord(value) || {};
  };

  if (type === 'ws') {
    const rawOpts = first(p, 'ws-opts', 'ws_opts', 'wsOpts');
    const opts = checkOptions('transport.ws_opts', rawOpts);
    for (const value of [nested.path, opts.path, first(p, 'wsPath', 'path')]) checkPath(value);
    for (const [field, value] of [
      ['transport.early_data_header_name', first(opts, 'early-data-header-name', 'early_data_header_name', 'earlyDataHeaderName')],
      ['transport.host', p.host]
    ] as const) checkScalar(field, value);
    checkHeaders('transport.headers', nested.headers);
    checkHeaders('transport.headers', opts.headers);
    checkHeaders('transport.headers', p.wsHeaders);
    const maxEarlyData = first(opts, 'max-early-data', 'max_early_data', 'maxEarlyData');
    if (isPresent(maxEarlyData) && strictUint32(maxEarlyData) === undefined) {
      addIssue(analysis, 'fatal', 'transport.max_early_data', 'transport.max_early_data 必须是 uint32 整数');
    }
    return;
  }

  if (type === 'grpc') {
    const rawOpts = first(p, 'grpc-opts', 'grpc_opts', 'grpcOpts');
    const opts = checkOptions('transport.grpc_opts', rawOpts);
    for (const [field, value] of [
      ['transport.service_name', first(nested, 'serviceName', 'service_name')],
      ['transport.service_name', first(opts, 'grpc-service-name', 'service-name', 'service_name', 'serviceName')],
      ['transport.service_name', first(p, 'grpcServiceName', 'serviceName', 'path')]
    ] as const) checkScalar(field, value);
    for (const [field, value] of [
      ['transport.idle_timeout', first(opts, 'idle-timeout', 'idle_timeout', 'idleTimeout')],
      ['transport.ping_timeout', first(opts, 'ping-timeout', 'ping_timeout', 'pingTimeout')]
    ] as const) {
      if (isPresent(value) && !normalizeDuration(value)) {
        addIssue(analysis, 'fatal', field, `${field} 必须是正数时长`);
      }
    }
    const permit = first(opts, 'permit-without-stream', 'permit_without_stream', 'permitWithoutStream');
    if (isPresent(permit) && asBool(permit) === undefined) {
      addIssue(analysis, 'fatal', 'transport.permit_without_stream', 'transport.permit_without_stream 必须是布尔值');
    }
    return;
  }

  if (type === 'http' || type === 'h2') {
    const rawOpts = first(p, 'http-opts', 'http_opts', 'httpOpts', 'h2-opts', 'h2_opts', 'h2Opts');
    const opts = checkOptions('transport.http_opts', rawOpts);
    const pathValues = [nested.httpPath, nested.path, opts.path, p.httpPath, p.path];
    for (const value of pathValues) {
      if (!isPresent(value)) continue;
      const values = Array.isArray(value) ? value : [value];
      if (Array.isArray(value) && value.length !== 1) {
        addIssue(analysis, 'fatal', 'transport.path', 'Sing-box HTTP transport 只能表示一个 path');
      }
      if (values.some(item => scalarString(item) === undefined)) {
        addIssue(analysis, 'fatal', 'transport.path', 'transport.path 必须是字符串标量或字符串标量数组');
      } else if (values.some(item => !hasValidPercentEncoding(scalarString(item)!))) {
        addIssue(analysis, 'fatal', 'transport.path', 'transport.path 包含非法的百分号转义');
      }
    }
    const optsHeaders = normalizeHttpHeaders(opts.headers);
    for (const value of [
      nested.httpHost,
      nested.host,
      opts.host,
      first(optsHeaders || {}, 'Host', 'host'),
      p.httpHost,
      p.host
    ]) {
      if (isPresent(value) && !asStringList(value)) {
        addIssue(analysis, 'fatal', 'transport.host', 'transport.host 必须是字符串标量或字符串标量数组');
      }
    }
    checkScalar('transport.method', opts.method);
    checkHeaders('transport.headers', nested.headers);
    checkHeaders('transport.headers', opts.headers);
    for (const [field, value] of [
      ['transport.idle_timeout', first(opts, 'idle-timeout', 'idle_timeout', 'idleTimeout')],
      ['transport.ping_timeout', first(opts, 'ping-timeout', 'ping_timeout', 'pingTimeout')]
    ] as const) {
      if (isPresent(value) && !normalizeDuration(value)) {
        addIssue(analysis, 'fatal', field, `${field} 必须是有效范围内的时长`);
      }
    }
    return;
  }

  if (type === 'httpupgrade' || type === 'http-upgrade') {
    const rawOpts = first(p, 'http-upgrade-opts', 'http_upgrade_opts', 'httpUpgradeOpts');
    const opts = checkOptions('transport.http_upgrade_opts', rawOpts);
    for (const value of [nested.path, opts.path, p.path]) checkPath(value);
    const optsHeaders = normalizeHttpHeaders(opts.headers);
    for (const value of [
      nested.host,
      opts.host,
      first(optsHeaders || {}, 'Host', 'host'),
      p.host
    ]) checkScalar('transport.host', value);
    checkHeaders('transport.headers', nested.headers);
    checkHeaders('transport.headers', opts.headers);
  }
}

function validateNativeV2RayTransport(p: Record<string, any>, analysis: Analysis): void {
  if (!hasNativeValue(p.transport)) return;
  const transport = asRecord(p.transport);
  if (!transport) {
    addIssue(analysis, 'fatal', 'transport', '原生 Sing-box transport 必须是对象');
    return;
  }
  if (typeof transport.type !== 'string' || !NATIVE_V2RAY_TRANSPORTS.has(transport.type)) {
    addIssue(
      analysis,
      'fatal',
      'transport.type',
      `Sing-box ${SINGBOX_VERSION} 不支持原生 V2Ray transport [${String(transport.type || 'unknown')}]`
    );
    return;
  }

  const type = transport.type;
  if (type === 'quic' && asRecord(p.tls)?.enabled !== true) {
    addIssue(analysis, 'fatal', 'tls.enabled', 'V2Ray QUIC transport 必须启用 TLS');
  }
  const allowedFields: Record<string, Set<string>> = {
    http: new Set(['type', 'host', 'path', 'method', 'headers', 'idle_timeout', 'ping_timeout']),
    ws: new Set(['type', 'path', 'headers', 'max_early_data', 'early_data_header_name']),
    quic: new Set(['type']),
    grpc: new Set([
      'type', 'service_name', 'idle_timeout', 'ping_timeout', 'permit_without_stream'
    ]),
    httpupgrade: new Set(['type', 'host', 'path', 'headers'])
  };
  validateExactKeys(analysis, transport, allowedFields[type]!, 'transport');
  const checkString = (field: string, value: unknown): void => {
    if (hasNativeValue(value) && typeof value !== 'string') {
      addIssue(analysis, 'fatal', field, `原生 Sing-box ${field} 必须是字符串`);
    }
  };
  const checkPath = (value: unknown): void => {
    checkString('transport.path', value);
    if (typeof value === 'string' && !hasValidPercentEncoding(value)) {
      addIssue(analysis, 'fatal', 'transport.path', 'transport.path 包含非法的百分号转义');
    }
  };
  const checkHeaders = (value: unknown): void => {
    if (hasNativeValue(value) && !isNativeHttpHeaders(value)) {
      addIssue(analysis, 'fatal', 'transport.headers', '原生 Sing-box transport.headers 必须是字符串或字符串数组对象');
    }
  };
  const checkDuration = (field: string, value: unknown): void => {
    validateNativeDurationField(analysis, value, field);
  };

  if (type === 'ws') {
    checkPath(transport.path);
    checkHeaders(transport.headers);
    checkString('transport.early_data_header_name', transport.early_data_header_name);
    if (
      hasNativeValue(transport.max_early_data)
      && (!isNativeInteger(transport.max_early_data, 0) || transport.max_early_data > 0xFFFFFFFF)
    ) {
      addIssue(analysis, 'fatal', 'transport.max_early_data', '原生 Sing-box transport.max_early_data 必须是 uint32 整数');
    }
  } else if (type === 'grpc') {
    checkString('transport.service_name', transport.service_name);
    checkDuration('transport.idle_timeout', transport.idle_timeout);
    checkDuration('transport.ping_timeout', transport.ping_timeout);
    if (hasNativeValue(transport.permit_without_stream) && typeof transport.permit_without_stream !== 'boolean') {
      addIssue(analysis, 'fatal', 'transport.permit_without_stream', '原生 Sing-box transport.permit_without_stream 必须是布尔值');
    }
  } else if (type === 'http') {
    checkPath(transport.path);
    checkString('transport.method', transport.method);
    const hostValid = typeof transport.host === 'string'
      || (Array.isArray(transport.host) && transport.host.every((item: unknown) => (
        item === null || typeof item === 'string'
      )));
    if (isPresent(transport.host) && !hostValid) {
      addIssue(analysis, 'fatal', 'transport.host', '原生 Sing-box transport.host 必须是字符串或字符串数组');
    }
    checkHeaders(transport.headers);
    checkDuration('transport.idle_timeout', transport.idle_timeout);
    checkDuration('transport.ping_timeout', transport.ping_timeout);
  } else if (type === 'httpupgrade') {
    checkPath(transport.path);
    checkString('transport.host', transport.host);
    checkHeaders(transport.headers);
  }
}

function validateBaseFields(p: Record<string, any>, analysis: Analysis): void {
  const tcpFastOpen = first(p, 'tfo', 'tcp-fast-open', 'tcp_fast_open');
  if (isPresent(tcpFastOpen) && asBool(tcpFastOpen) === undefined) {
    addIssue(analysis, 'fatal', 'tcp_fast_open', 'tcp_fast_open 必须是布尔值');
  }
  validateScalarStringField(
    analysis,
    first(p, 'interface-name', 'interface_name'),
    'bind_interface',
    'outbound'
  );
  const routingMark = first(p, 'routing-mark', 'routing_mark');
  if (isPresent(routingMark)) {
    const parsed = strictUint32(routingMark);
    if (parsed === undefined) {
      addIssue(analysis, 'fatal', 'routing_mark', 'routing_mark 必须是 uint32 整数');
    } else if (parsed !== 0) {
      addIssue(
        analysis,
        'warn',
        'routing_mark',
        'routing_mark 是 Linux 专属字段；在其他平台导入会被 sing-box 拒绝'
      );
    }
  }
}

function collectGenericIssues(node: NodeEnvelope, p: Record<string, any>, analysis: Analysis): void {
  const invalidParams = Array.isArray(p.invalidParams)
    ? p.invalidParams
    : node.rawQuery?.invalidParams || [];
  const critical = new Set([
    'port', 'server', 'password', 'uuid', 'cipher', 'method', 'scy', 'security',
    'encryption', 'tls', 'xtls', 'sni', 'peer', 'servername', 'alpn', 'insecure',
    'allowinsecure', 'skipcertverify', 'fingerprint', 'fp', 'publickey', 'pbk',
    'shortid', 'sid', 'type', 'transport', 'network', 'net', 'path', 'host',
    'servicename', 'mode', 'headertype', 'authority', 'flow', 'packetencoding',
    'obfs', 'token', 'version', 'alterid', 'aid', 'udpovertcp',
    'udpoverstream', 'udprelaymode', 'congestioncontroller', 'congestioncontrol',
    'disablesni'
  ]);
  for (const invalid of invalidParams) {
    const field = String(invalid.key || 'parameter');
    const normalizedField = field.toLowerCase().replace(/[-_]/g, '');
    const fatal = critical.has(normalizedField);
    addIssue(
      analysis,
      fatal ? 'fatal' : 'warn',
      field,
      `参数 [${field}=${invalid.value}] 格式非法: ${invalid.reason}`
    );
  }

  const extras = asRecord(p.extras);
  if (extras) {
    for (const key of Object.keys(extras)) {
      addIssue(
        analysis,
        'warn',
        key,
        `Sing-box ${SINGBOX_VERSION} 无法映射参数 [${key}]，该参数已省略`
      );
    }
  }

  if (node.source.format === 'clash') {
    const key = protocolKey((node.protocol || '').toLowerCase());
    const handled = CLASH_FIELDS[key] || new Set<string>();
    for (const field of Object.keys(p)) {
      if (!COMMON_CLASH_FIELDS.has(field) && !handled.has(field)) {
        addIssue(
          analysis,
          'warn',
          field,
          `Sing-box ${SINGBOX_VERSION} 无法映射 Clash 参数 [${field}]，该参数已省略`
        );
      }
    }
  }
}

function validateProtocol(node: NodeEnvelope, p: Record<string, any>, analysis: Analysis): void {
  const protocol = protocolKey((node.protocol || '').toLowerCase());
  validateBaseFields(p, analysis);

  const reality = realityOptions(p);
  const security = String(first(p, 'security') || '').toLowerCase();
  const tlsEnabled = ['trojan', 'anytls', 'tuic'].includes(protocol)
    || asBool(first(p, 'tls')) === true
    || security === 'tls'
    || security === 'reality'
    || Boolean(reality);
  const serverName = first(p, 'sni', 'servername', 'server-name', 'server_name');
  validateScalarStringField(analysis, serverName, 'tls.server_name', 'TLS');
  const disableSniValue = first(p, 'disableSni', 'disable-sni', 'disable_sni');
  const disableSni = asBool(disableSniValue);
  if (isPresent(disableSniValue) && disableSni === undefined) {
    addIssue(analysis, 'fatal', 'tls.disable_sni', 'tls.disable_sni 必须是布尔值');
  }
  if ((security === 'reality' || reality) && disableSni === true) {
    addIssue(analysis, 'fatal', 'tls.disable_sni', 'Reality outbound 不能禁用 SNI');
  }
  const insecureValue = first(
    p,
    'skipCertVerify', 'skip-cert-verify', 'skip_cert_verify', 'insecure', 'allowInsecure'
  );
  if (isPresent(insecureValue) && asBool(insecureValue) === undefined) {
    addIssue(analysis, 'fatal', 'tls.insecure', 'tls.insecure 必须是布尔值');
  }
  const alpnValue = first(p, 'alpn');
  if (isPresent(alpnValue) && !asStringList(alpnValue)) {
    addIssue(analysis, 'fatal', 'tls.alpn', 'tls.alpn 必须是字符串标量或字符串标量数组');
  }
  const tlsFingerprint = first(p, 'fingerprint', 'fp', 'client-fingerprint', 'client_fingerprint');
  if (
    tlsEnabled
    && tlsFingerprint
    && protocol !== 'hysteria2'
    && !SUPPORTED_UTLS_FINGERPRINTS.has(String(tlsFingerprint).toLowerCase())
  ) {
    addIssue(
      analysis,
      'fatal',
      'tls.utls.fingerprint',
      `Sing-box ${SINGBOX_VERSION} 不支持 uTLS fingerprint [${tlsFingerprint}]`
    );
  }

  if (['vmess', 'vless', 'trojan'].includes(protocol)) {
    const type = transportType(node, p);
    if (!SUPPORTED_V2RAY_TRANSPORTS.has(type)) {
      addIssue(
        analysis,
        'fatal',
        'transport.type',
        `Sing-box ${SINGBOX_VERSION} 不支持 ${protocol.toUpperCase()} 传输 [${type}]`
      );
    }
    if (type === 'quic' && !tlsEnabled) {
      addIssue(analysis, 'fatal', 'tls.enabled', 'V2Ray QUIC transport 必须启用 TLS');
    }
    validateV2RayTransportFields(type, p, analysis);
    const nested = asRecord(p.transport);
    const headerType = first(nested || {}, 'headerType', 'header_type');
    if (type === 'tcp' && headerType && String(headerType).toLowerCase() !== 'none') {
      addIssue(
        analysis,
        'fatal',
        'transport.headerType',
        `Sing-box ${SINGBOX_VERSION} 无法表示 TCP headerType [${headerType}]`
      );
    }
    if (type === 'quic') {
      const rawJson = asRecord(p.rawJson);
      const rawQuicSecurity = rawJson?.type;
      const quicSecurity = typeof rawQuicSecurity === 'string'
        && rawQuicSecurity.toLowerCase() === 'none'
        ? undefined
        : rawQuicSecurity;
      const unsupportedQuicFields: Array<[string, unknown]> = [
        ['transport.headerType', headerType],
        ['transport.path', nested?.path],
        ['transport.headers', nested?.headers],
        ['transport.security', quicSecurity],
        ['transport.host', rawJson?.host],
        ['transport.key', rawJson?.path]
      ];
      for (const [field, value] of unsupportedQuicFields) {
        if (isPresent(value) && !(asRecord(value) && Object.keys(asRecord(value)!).length === 0)) {
          addIssue(
            analysis,
            'fatal',
            field,
            `Sing-box ${SINGBOX_VERSION} 的 V2Ray QUIC transport 无法表示参数 [${field}]`
          );
        }
      }
    }
    for (const [field, value] of [
      ['transport.mode', nested?.mode],
      ['transport.extra', nested?.extra],
      ['transport.authority', nested?.authority]
    ] as const) {
      if (isPresent(value)) {
        addIssue(
          analysis,
          'warn',
          field,
          `Sing-box ${SINGBOX_VERSION} 无法映射参数 [${field}]`
        );
      }
    }
  }

  if (['shadowsocks', 'vmess', 'vless', 'trojan'].includes(protocol)) {
    validateMultiplex(p, analysis);
  }

  if (protocol === 'vmess' || protocol === 'vless') {
    validateUuid(analysis, first(p, 'uuid', 'id'));
    const packetEncoding = first(p, 'packetEncoding', 'packet-encoding', 'packet_encoding');
    if (packetEncoding && !['packetaddr', 'xudp'].includes(String(packetEncoding).toLowerCase())) {
      addIssue(
        analysis,
        'fatal',
        'packet_encoding',
        `Sing-box ${SINGBOX_VERSION} 不支持 packet_encoding [${packetEncoding}]`
      );
    }
  }

  if (protocol === 'vmess') {
    const vmessSecurity = String(first(p, 'cipher', 'scy', 'security') || 'auto').toLowerCase();
    if (!SUPPORTED_VMESS_SECURITY.has(vmessSecurity)) {
      addIssue(
        analysis,
        'fatal',
        'security',
        `Sing-box ${SINGBOX_VERSION} 不支持 VMess security [${vmessSecurity}]`
      );
    }
    const alterIdValue = first(p, 'alterId', 'alter_id', 'aid');
    if (isPresent(alterIdValue) && strictNonNegativeInt(alterIdValue) === undefined) {
      addIssue(analysis, 'fatal', 'alter_id', 'VMess alter_id 必须是非负整数');
    }
  }

  if (protocol === 'vless') {
    const flow = first(p, 'flow');
    if (flow && String(flow) !== 'xtls-rprx-vision') {
      addIssue(analysis, 'fatal', 'flow', `Sing-box ${SINGBOX_VERSION} 不支持 VLESS flow [${flow}]`);
    }
    const encryption = first(p, 'encryption');
    if (encryption && String(encryption).toLowerCase() !== 'none') {
      addIssue(
        analysis,
        'fatal',
        'encryption',
        `Sing-box ${SINGBOX_VERSION} 无法表示 VLESS encryption [${encryption}]`
      );
    }
    const publicKey = first(reality || {}, 'publicKey', 'public-key', 'public_key');
    if (security === 'reality' || reality) {
      if (!publicKey) {
        addIssue(analysis, 'fatal', 'reality.public_key', 'VLESS Reality 缺少 public_key');
      } else if (!/^[A-Za-z0-9_-]{43}$/.test(String(publicKey))) {
        addIssue(
          analysis,
          'fatal',
          'reality.public_key',
          `Sing-box ${SINGBOX_VERSION} 要求 Reality public_key 是 32 字节 RawURL Base64`
        );
      }
      const shortId = first(reality || {}, 'shortId', 'short-id', 'short_id');
      if (isPresent(shortId) && !/^(?:[0-9a-fA-F]{2}){1,8}$/.test(String(shortId))) {
        addIssue(
          analysis,
          'fatal',
          'reality.short_id',
          `Sing-box ${SINGBOX_VERSION} 要求 Reality short_id 为不超过 8 字节的偶数位十六进制字符串`
        );
      }
    }
    const spiderX = first(reality || {}, 'spiderX', 'spider-x', 'spider_x');
    if (spiderX) {
      addIssue(
        analysis,
        'warn',
        'reality.spider_x',
        `Sing-box ${SINGBOX_VERSION} 的 Reality outbound 不支持 spider_x`
      );
    }
  }

  if (protocol === 'shadowsocks') {
    validateShadowsocksCredentials(p, analysis);
    validateShadowsocksTransportFeatures(p, analysis);
    const plugin = normalizeShadowsocksPlugin(p);
    for (const issue of plugin.issues) {
      addIssue(analysis, 'fatal', issue.field, issue.message);
    }
    for (const warning of plugin.runtimeWarnings || []) {
      addRuntimeWarning(analysis, warning.field, warning.message);
    }
    const clientFingerprint = first(p, 'clientFingerprint', 'client-fingerprint', 'client_fingerprint');
    if (clientFingerprint) {
      addIssue(
        analysis,
        'warn',
        'client_fingerprint',
        `Sing-box ${SINGBOX_VERSION} Shadowsocks outbound 不支持 client_fingerprint`
      );
    }
  }

  if (protocol === 'trojan') {
    validateScalarStringField(analysis, first(p, 'password'), 'password', 'Trojan', true);
  }

  if (protocol === 'hysteria2') {
    validateScalarStringField(
      analysis,
      first(p, 'password', 'auth'),
      'password',
      'Hysteria2'
    );
    const obfs = String(first(p, 'obfs') || '').toLowerCase();
    if (obfs && obfs !== 'salamander') {
      addIssue(
        analysis,
        'fatal',
        'obfs',
        `Sing-box ${SINGBOX_VERSION} 不支持 Hysteria2 obfs [${obfs}]`
      );
    }
    const obfsPassword = first(p, 'obfsPassword', 'obfs-password', 'obfs_password');
    if (obfs) {
      validateScalarStringField(analysis, obfsPassword, 'obfs.password', 'Hysteria2 obfs', true);
    }
    const ports = first(p, 'ports', 'server-ports', 'server_ports');
    if (isPresent(ports) && !normalizePortList(ports)) {
      addIssue(analysis, 'fatal', 'server_ports', 'Hysteria2 server_ports 格式非法');
    }
    const hop = first(p, 'hopInterval', 'hop-interval', 'hop_interval');
    if (isPresent(hop) && !normalizeDuration(hop)) {
      addIssue(
        analysis,
        'fatal',
        'hop_interval',
        `Sing-box ${SINGBOX_VERSION} 的 hop_interval 必须是单个正数时长，不能使用随机范围`
      );
    }
    for (const [field, aliases] of [
      ['up_mbps', ['up', 'up-mbps', 'up_mbps']],
      ['down_mbps', ['down', 'down-mbps', 'down_mbps']]
    ] as const) {
      const value = first(p, ...aliases);
      if (isPresent(value) && strictPositiveInt(value) === undefined) {
        addIssue(analysis, 'fatal', field, `${field} 必须是安全范围内的正整数`);
      }
    }
    const pin = first(p, 'certificateFingerprint', 'pinSHA256', 'pin-sha256', 'pin_sha256', 'fingerprint');
    if (pin) {
      addIssue(
        analysis,
        'fatal',
        'pinSHA256',
        `Hysteria2 pinSHA256 是整张证书指纹，Sing-box ${SINGBOX_VERSION} 仅提供公钥指纹字段，不能安全等价转换`
      );
    }
    for (const [field, aliases] of [
      ['name_cert_verify', ['nameCertVerify', 'name-cert-verify', 'name_cert_verify']],
      ['handshake_timeout', ['handshakeTimeout', 'handshake-timeout', 'handshake_timeout']],
      ['obfs.min_packet_size', ['obfsMinPacketSize', 'obfs-min-packet-size', 'obfs_min_packet_size']],
      ['obfs.max_packet_size', ['obfsMaxPacketSize', 'obfs-max-packet-size', 'obfs_max_packet_size']]
    ] as const) {
      if (isPresent(first(p, ...aliases))) {
        addIssue(
          analysis,
          'warn',
          field,
          `Sing-box ${SINGBOX_VERSION} 不支持 Hysteria2 参数 [${field}]`
        );
      }
    }
  }

  if (protocol === 'anytls') {
    validateScalarStringField(analysis, first(p, 'password'), 'password', 'AnyTLS', true);
    validateScalarStringField(
      analysis,
      first(p, 'clientMetadata', 'client-metadata', 'client_metadata'),
      'client_metadata',
      'AnyTLS'
    );
    const tcpFastOpen = first(p, 'tfo', 'tcp-fast-open', 'tcp_fast_open');
    if (isPresent(tcpFastOpen) && asBool(tcpFastOpen) !== false) {
      addIssue(
        analysis,
        'fatal',
        'tcp_fast_open',
        'Sing-box AnyTLS outbound 不支持 tcp_fast_open'
      );
    }
    for (const [field, aliases] of [
      ['idle_session_check_interval', ['idleSessionCheckInterval', 'idle-session-check-interval', 'idle_session_check_interval']],
      ['idle_session_timeout', ['idleSessionTimeout', 'idle-session-timeout', 'idle_session_timeout']]
    ] as const) {
      const value = first(p, ...aliases);
      if (isPresent(value) && !normalizeDuration(value)) {
        addIssue(analysis, 'fatal', field, `${field} 不是有效范围内的正数时长`);
      }
    }
    const minIdleSession = first(p, 'minIdleSession', 'min-idle-session', 'min_idle_session');
    if (isPresent(minIdleSession) && strictNonNegativeInt(minIdleSession) === undefined) {
      addIssue(analysis, 'fatal', 'min_idle_session', 'min_idle_session 必须是非负整数');
    }
    for (const [field, aliases, fatal] of [
      ['name_cert_verify', ['nameCertVerify', 'name-cert-verify', 'name_cert_verify'], false],
      ['shadow_tls_opts', ['shadowTlsOpts', 'shadow-tls-opts', 'shadow_tls_opts'], true],
      ['restls_opts', ['restlsOpts', 'restls-opts', 'restls_opts'], true],
      ['jls_opts', ['jlsOpts', 'jls-opts', 'jls_opts'], true]
    ] as const) {
      if (isPresent(first(p, ...aliases))) {
        addIssue(
          analysis,
          fatal ? 'fatal' : 'warn',
          field,
          `Sing-box ${SINGBOX_VERSION} AnyTLS outbound 不支持参数 [${field}]`
        );
      }
    }
  }

  if (protocol === 'tuic') {
    const token = first(p, 'token');
    const versionValue = first(p, 'version');
    if (token || Number(versionValue) === 4) {
      addIssue(
        analysis,
        'fatal',
        'token',
        `Sing-box ${SINGBOX_VERSION} 仅支持 TUIC v5 UUID/密码认证，不支持 v4 token`
      );
    }
    if (isPresent(versionValue) && strictPositiveInt(versionValue) !== 5) {
      addIssue(
        analysis,
        'fatal',
        'version',
        `Sing-box ${SINGBOX_VERSION} 仅支持 TUIC v5`
      );
    }
    validateTuicUuid(analysis, first(p, 'uuid'));
    validateScalarStringField(analysis, first(p, 'password'), 'password', 'TUIC');
    const congestion = String(first(
      p,
      'congestionController', 'congestion-controller', 'congestion_controller',
      'congestionControl', 'congestion-control', 'congestion_control'
    ) || 'cubic').toLowerCase();
    if (!['cubic', 'new_reno', 'bbr'].includes(congestion)) {
      addIssue(
        analysis,
        'fatal',
        'congestion_control',
        `Sing-box ${SINGBOX_VERSION} 不支持 TUIC congestion_control [${congestion}]`
      );
    }
    const relayMode = first(p, 'udpRelayMode', 'udp-relay-mode', 'udp_relay_mode');
    if (relayMode && !['native', 'quic'].includes(String(relayMode).toLowerCase())) {
      addIssue(
        analysis,
        'fatal',
        'udp_relay_mode',
        `Sing-box ${SINGBOX_VERSION} 不支持 TUIC udp_relay_mode [${relayMode}]`
      );
    }
    if (first(p, 'ip')) {
      addIssue(
        analysis,
        'fatal',
        'ip',
        `Sing-box ${SINGBOX_VERSION} TUIC outbound 无法表示独立服务器 IP 覆盖`
      );
    }
    const udpOverStream = asBool(first(p, 'udpOverStream', 'udp-over-stream', 'udp_over_stream'));
    const udpRelayMode = first(p, 'udpRelayMode', 'udp-relay-mode', 'udp_relay_mode');
    if (udpOverStream === true && isPresent(udpRelayMode)) {
      addIssue(
        analysis,
        'fatal',
        'udp_over_stream',
        'Sing-box TUIC 的 udp_over_stream 与 udp_relay_mode 不能同时设置'
      );
    }
    const heartbeat = first(
      p,
      'heartbeatInterval', 'heartbeat-interval', 'heartbeat_interval', 'heartbeat'
    );
    if (isPresent(heartbeat) && !normalizeDuration(heartbeat)) {
      addIssue(analysis, 'fatal', 'heartbeat', 'heartbeat 不是有效范围内的正数时长');
    }
    for (const [field, aliases] of [
      ['request_timeout', ['requestTimeout', 'request-timeout', 'request_timeout']],
      ['fast_open', ['fastOpen', 'fast-open', 'fast_open']],
      ['max_open_streams', ['maxOpenStreams', 'max-open-streams', 'max_open_streams']],
      ['max_udp_relay_packet_size', ['maxUdpRelayPacketSize', 'max-udp-relay-packet-size', 'max_udp_relay_packet_size']]
    ] as const) {
      if (isPresent(first(p, ...aliases))) {
        addIssue(
          analysis,
          'warn',
          field,
          `Sing-box ${SINGBOX_VERSION} TUIC outbound 不支持参数 [${field}]`
        );
      }
    }
  }
}

export function adaptNodeToSingBox(
  node: NodeEnvelope,
  options: SingBoxAdaptationOptions = {}
): AdapterResult {
  if (!node.server || !Number.isInteger(node.port) || node.port < 1 || node.port > 65535) {
    const message = `节点 [${node.name}] 的服务器地址或端口无效，无法生成 Sing-box outbound`;
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      warnings: [{ level: 'fatal', field: 'server_port', message }],
      unsupportedParams: ['server_port'],
      skipReason: message
    };
  }

  if (node.source.format === 'singbox') {
    const protocol = (node.protocol || '').toLowerCase();
    if (!SINGBOX_NATIVE_SERVER_OUTBOUNDS.has(protocol)) {
      const message = `Sing-box ${SINGBOX_VERSION} 不支持原生 outbound 类型 [${protocol || 'unknown'}]`;
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        warnings: [{ level: 'fatal', field: 'protocol', message }],
        unsupportedParams: ['protocol'],
        skipReason: message
      };
    }
    const analysis: Analysis = { warnings: [], unsupportedParams: [] };
    validateNativeOutbound(node, analysis, options);
    if (analysis.fatalReason) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        warnings: analysis.warnings,
        unsupportedParams: analysis.unsupportedParams,
        skipReason: analysis.fatalReason
      };
    }
    return {
      config: nodeToSingBoxOutbound(node),
      fatal: false,
      lossy: analysis.warnings.length > 0,
      emitted: true,
      warnings: analysis.warnings,
      unsupportedParams: analysis.unsupportedParams
    };
  }

  const protocol = (node.protocol || '').toLowerCase();
  if (!SINGBOX_PROTOCOLS.has(protocol)) {
    const message = `Sing-box ${SINGBOX_VERSION} 生成器不支持节点 [${node.name}] 的协议 [${protocol || 'unknown'}]`;
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      warnings: [{ level: 'fatal', field: 'protocol', message }],
      unsupportedParams: ['protocol'],
      skipReason: message
    };
  }

  const analysis: Analysis = { warnings: [], unsupportedParams: [] };
  const p = node.protocolData as Record<string, any>;
  collectGenericIssues(node, p, analysis);
  validateProtocol(node, p, analysis);

  if (analysis.fatalReason) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      warnings: analysis.warnings,
      unsupportedParams: analysis.unsupportedParams,
      skipReason: analysis.fatalReason
    };
  }

  return {
    config: nodeToSingBoxOutbound(node),
    fatal: false,
    lossy: analysis.warnings.length > 0,
    emitted: true,
    warnings: analysis.warnings,
    unsupportedParams: analysis.unsupportedParams
  };
}

function fatalReferenceResult(base: AdapterResult, field: string, message: string): AdapterResult {
  return {
    fatal: true,
    lossy: true,
    emitted: false,
    warnings: [
      ...base.warnings,
      { level: 'fatal', field, message }
    ],
    unsupportedParams: Array.from(new Set([...base.unsupportedParams, field])),
    skipReason: message
  };
}

function nativeOutboundTag(node: NodeEnvelope): string {
  const data = node.protocolData as Record<string, any>;
  return String(data.tag || node.name);
}

function nativeConfigId(node: NodeEnvelope): string {
  return node.source.configId || `legacy:${node.source.raw}`;
}

function nativeScopedTag(node: NodeEnvelope, tag = nativeOutboundTag(node)): string {
  return `${nativeConfigId(node)}\u0000${tag}`;
}

function nativeDetour(node: NodeEnvelope): string | undefined {
  if (node.source.format !== 'singbox') return undefined;
  const value = (node.protocolData as Record<string, any>).detour;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Adds list-level validation that a single node cannot perform, notably native
 * Sing-box detour references and cycles after unsupported outbounds are filtered.
 */
export function adaptNodesToSingBox(
  nodes: NodeEnvelope[],
  options: SingBoxAdaptationOptions = {}
): AdapterResult[] {
  const results = nodes.map(node => adaptNodeToSingBox(node, options));
  const nativeTagIndexes = new Map<string, { tag: string; indexes: number[] }>();
  const declaredTagsByConfig = new Map<string, string[]>();
  const configsWithCompleteTagMetadata = new Set<string>();

  nodes.forEach(node => {
    if (node.source.format !== 'singbox') return;
    const configId = nativeConfigId(node);
    if (node.source.nativeOutboundTags) {
      if (!configsWithCompleteTagMetadata.has(configId)) {
        declaredTagsByConfig.set(configId, [...node.source.nativeOutboundTags]);
        configsWithCompleteTagMetadata.add(configId);
      }
      return;
    }
    if (configsWithCompleteTagMetadata.has(configId)) return;
    const data = node.protocolData as Record<string, any>;
    if (typeof data.tag === 'string') {
      const tags = declaredTagsByConfig.get(configId) || [];
      tags.push(data.tag);
      declaredTagsByConfig.set(configId, tags);
    }
  });

  nodes.forEach((node, index) => {
    if (node.source.format !== 'singbox' || !results[index]?.emitted) return;
    const nativeData = node.protocolData as Record<string, any>;
    if (typeof nativeData.tag !== 'string' || nativeData.tag === '') return;
    const tag = nativeOutboundTag(node);
    const scopedTag = nativeScopedTag(node, tag);
    const entry = nativeTagIndexes.get(scopedTag) || { tag, indexes: [] };
    entry.indexes.push(index);
    nativeTagIndexes.set(scopedTag, entry);
  });

  const duplicateDeclaredTags = new Set<string>();
  for (const [configId, tags] of declaredTagsByConfig) {
    const counts = new Map<string, number>();
    for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    for (const [tag, count] of counts) {
      if (count > 1) duplicateDeclaredTags.add(`${configId}\u0000${tag}`);
    }
  }

  for (const [scopedTag, { tag, indexes }] of nativeTagIndexes) {
    if (indexes.length < 2 && !duplicateDeclaredTags.has(scopedTag)) continue;
    for (const index of indexes) {
      results[index] = fatalReferenceResult(
        results[index]!,
        'tag',
        `原生 Sing-box outbound tag [${tag}] 重复，无法安全重写引用`
      );
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const tagToIndex = new Map<string, number>();
    nodes.forEach((node, index) => {
      if (!results[index]?.emitted || node.source.format !== 'singbox') return;
      const nativeData = node.protocolData as Record<string, any>;
      if (typeof nativeData.tag !== 'string' || nativeData.tag === '') return;
      const scopedTag = nativeScopedTag(node);
      if (!tagToIndex.has(scopedTag)) tagToIndex.set(scopedTag, index);
    });

    nodes.forEach((node, startIndex) => {
      if (!results[startIndex]?.emitted || node.source.format !== 'singbox') return;
      let detour = nativeDetour(node);
      if (!detour) return;

      const visited = new Set<number>([startIndex]);
      while (detour) {
        const targetIndex = tagToIndex.get(nativeScopedTag(node, detour));
        if (targetIndex === undefined) {
          const declaredTags = declaredTagsByConfig.get(nativeConfigId(node)) || [];
          if (detour === 'direct' && !declaredTags.includes('direct')) return;
          results[startIndex] = fatalReferenceResult(
            results[startIndex]!,
            'detour',
            `原生 Sing-box outbound [${node.name}] 引用了未保留的 detour [${detour}]`
          );
          changed = true;
          return;
        }
        if (visited.has(targetIndex)) {
          results[startIndex] = fatalReferenceResult(
            results[startIndex]!,
            'detour',
            `原生 Sing-box outbound [${node.name}] 的 detour 链形成循环`
          );
          changed = true;
          return;
        }

        visited.add(targetIndex);
        const targetNode = nodes[targetIndex]!;
        if (targetNode.source.format !== 'singbox') return;
        detour = nativeDetour(targetNode);
      }
    });
  }

  return results;
}

export function nodeToSingBoxOutbound(node: NodeEnvelope): Record<string, any> {
  if (node.source.format === 'singbox') {
    return {
      ...(node.protocolData as Record<string, any>),
      tag: node.name
    };
  }

  const p = node.protocolData as Record<string, any>;
  const base = buildBase(node, p);
  const protocol = protocolKey((node.protocol || '').toLowerCase());

  if (protocol === 'shadowsocks') {
    const outbound: Record<string, any> = {
      ...base,
      type: 'shadowsocks',
      method: scalarString(first(p, 'cipher', 'method'))?.toLowerCase(),
      password: scalarString(first(p, 'password'))
    };
    const plugin = normalizeShadowsocksPlugin(p);
    const pluginOpts = serializePluginOptions(plugin.options);
    if (plugin.name) outbound.plugin = plugin.name;
    if (pluginOpts) outbound.plugin_opts = pluginOpts;
    const rawUdpOverTcp = first(p, 'udpOverTcp', 'udp-over-tcp', 'udp_over_tcp');
    const udpOverTcpObject = asRecord(rawUdpOverTcp);
    const udpOverTcp = udpOverTcpObject
      ? asBool(first(udpOverTcpObject, 'enabled'))
      : asBool(rawUdpOverTcp);
    const udpOverTcpVersion = strictPositiveInt(
      udpOverTcpObject
        ? first(udpOverTcpObject, 'version')
        : first(p, 'udpOverTcpVersion', 'udp-over-tcp-version', 'udp_over_tcp_version')
    );
    if (udpOverTcp) {
      outbound.udp_over_tcp = udpOverTcpVersion
        ? { enabled: true, version: udpOverTcpVersion }
        : true;
    }
    const multiplex = buildMultiplex(first(p, 'smux', 'multiplex'));
    if (multiplex) outbound.multiplex = multiplex;
    applyNetworkRestriction(outbound, node);
    return outbound;
  }

  if (protocol === 'vmess') {
    const outbound: Record<string, any> = {
      ...base,
      type: 'vmess',
      uuid: first(p, 'uuid', 'id'),
      security: String(first(p, 'cipher', 'scy', 'security') || 'auto').toLowerCase()
    };
    const alterId = Number(first(p, 'alterId', 'alter_id', 'aid') || 0);
    if (Number.isInteger(alterId) && alterId > 0) outbound.alter_id = alterId;
    const packetEncoding = first(p, 'packetEncoding', 'packet-encoding', 'packet_encoding');
    if (packetEncoding) outbound.packet_encoding = String(packetEncoding).toLowerCase();
    const globalPadding = asBool(first(p, 'globalPadding', 'global-padding', 'global_padding'));
    const authenticatedLength = asBool(first(
      p,
      'authenticatedLength', 'authenticated-length', 'authenticated_length'
    ));
    if (globalPadding !== undefined) outbound.global_padding = globalPadding;
    if (authenticatedLength !== undefined) outbound.authenticated_length = authenticatedLength;
    const tls = buildTls(node, p);
    const transport = buildTransport(node, p);
    if (tls) outbound.tls = tls;
    if (transport) outbound.transport = transport;
    const multiplex = buildMultiplex(first(p, 'smux', 'multiplex'));
    if (multiplex) outbound.multiplex = multiplex;
    applyNetworkRestriction(outbound, node);
    return outbound;
  }

  if (protocol === 'vless') {
    const outbound: Record<string, any> = {
      ...base,
      type: 'vless',
      uuid: first(p, 'uuid', 'id')
    };
    const flow = first(p, 'flow');
    const packetEncoding = first(p, 'packetEncoding', 'packet-encoding', 'packet_encoding');
    if (flow) outbound.flow = flow;
    if (packetEncoding) outbound.packet_encoding = String(packetEncoding).toLowerCase();
    const tls = buildTls(node, p);
    const transport = buildTransport(node, p);
    if (tls) outbound.tls = tls;
    if (transport) outbound.transport = transport;
    const multiplex = buildMultiplex(first(p, 'smux', 'multiplex'));
    if (multiplex) outbound.multiplex = multiplex;
    applyNetworkRestriction(outbound, node);
    return outbound;
  }

  if (protocol === 'trojan') {
    const outbound: Record<string, any> = {
      ...base,
      type: 'trojan',
      password: scalarString(first(p, 'password')),
      tls: buildTls(node, p, { always: true })
    };
    const transport = buildTransport(node, p);
    if (transport) outbound.transport = transport;
    const multiplex = buildMultiplex(first(p, 'smux', 'multiplex'));
    if (multiplex) outbound.multiplex = multiplex;
    applyNetworkRestriction(outbound, node);
    return outbound;
  }

  if (protocol === 'hysteria2') {
    const outbound: Record<string, any> = {
      ...base,
      type: 'hysteria2',
      password: scalarString(first(p, 'password', 'auth')),
      tls: buildTls(node, p, { always: true, utls: false })
    };
    const ports = normalizePortList(first(p, 'ports', 'server-ports', 'server_ports'));
    const hop = normalizeDuration(first(p, 'hopInterval', 'hop-interval', 'hop_interval'));
    const up = strictPositiveInt(first(p, 'up', 'up-mbps', 'up_mbps'));
    const down = strictPositiveInt(first(p, 'down', 'down-mbps', 'down_mbps'));
    if (ports) outbound.server_ports = ports;
    if (hop) outbound.hop_interval = hop;
    if (up !== undefined) outbound.up_mbps = up;
    if (down !== undefined) outbound.down_mbps = down;
    const obfs = first(p, 'obfs');
    if (obfs) {
      outbound.obfs = {
        type: String(obfs).toLowerCase(),
        password: scalarString(first(p, 'obfsPassword', 'obfs-password', 'obfs_password'))
      };
    }
    applyNetworkRestriction(outbound, node);
    return outbound;
  }

  if (protocol === 'anytls') {
    const outbound: Record<string, any> = {
      ...base,
      type: 'anytls',
      password: scalarString(first(p, 'password')),
      tls: buildTls(node, p, { always: true })
    };
    const idleCheck = normalizeDuration(first(
      p,
      'idleSessionCheckInterval', 'idle-session-check-interval', 'idle_session_check_interval'
    ));
    const idleTimeout = normalizeDuration(first(
      p,
      'idleSessionTimeout', 'idle-session-timeout', 'idle_session_timeout'
    ));
    const minIdle = strictNonNegativeInt(first(p, 'minIdleSession', 'min-idle-session', 'min_idle_session'));
    const metadata = first(p, 'clientMetadata', 'client-metadata', 'client_metadata');
    if (idleCheck) outbound.idle_session_check_interval = idleCheck;
    if (idleTimeout) outbound.idle_session_timeout = idleTimeout;
    if (minIdle !== undefined) outbound.min_idle_session = minIdle;
    if (metadata) outbound.client_metadata = scalarString(metadata);
    return outbound;
  }

  const outbound: Record<string, any> = {
    ...base,
    type: 'tuic',
    uuid: first(p, 'uuid'),
    password: scalarString(first(p, 'password')),
    congestion_control: String(first(
      p,
      'congestionController', 'congestion-controller', 'congestion_controller',
      'congestionControl', 'congestion-control', 'congestion_control'
    ) || 'bbr').toLowerCase(),
    tls: buildTls(node, p, { always: true })
  };
  const udpRelayMode = first(p, 'udpRelayMode', 'udp-relay-mode', 'udp_relay_mode');
  const zeroRtt = asBool(first(
    p,
    'reduceRtt', 'reduce-rtt', 'reduce_rtt', 'zeroRttHandshake',
    'zero-rtt-handshake', 'zero_rtt_handshake'
  ));
  const heartbeat = normalizeDuration(first(
    p,
    'heartbeatInterval', 'heartbeat-interval', 'heartbeat_interval', 'heartbeat'
  ));
  if (udpRelayMode) outbound.udp_relay_mode = String(udpRelayMode).toLowerCase();
  if (zeroRtt !== undefined) outbound.zero_rtt_handshake = zeroRtt;
  if (heartbeat) outbound.heartbeat = heartbeat;
  const udpOverStream = asBool(first(p, 'udpOverStream', 'udp-over-stream', 'udp_over_stream'));
  if (udpOverStream !== undefined) outbound.udp_over_stream = udpOverStream;
  applyNetworkRestriction(outbound, node);
  return outbound;
}
