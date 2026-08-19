// src/types.ts

export interface Env {
  AUTH_TOKEN?: string;
}

export type KnownProtocol =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'ss'
  | 'shadowsocks'
  | 'ssr'
  | 'shadowsocksr'
  | 'hysteria'
  | 'hysteria2'
  | 'hy2'
  | 'anytls'
  | 'tuic'
  | 'wireguard'
  | 'socks5'
  | 'http'
  | string;

export interface NodeSource {
  format: 'uri' | 'vmess-json' | 'clash' | 'singbox';
  raw: string;
}

export interface RawQueryEntry {
  rawKey: string;
  rawValue: string;
  key: string;
  value: string;
}

export interface InvalidQueryParam {
  key: string;
  value: string;
  reason: string;
}

export interface RawQuery {
  raw: string;
  entries: RawQueryEntry[];
  invalidParams?: InvalidQueryParam[];
}

export interface BaseNode {
  name: string;
  server: string;
  port: number;
  source: NodeSource;
  rawQuery?: RawQuery;
  udp?: boolean;
}

export interface VlessNode extends BaseNode {
  protocol: 'vless';
  protocolData: {
    uuid: string;
    flow?: string;
    encryption?: string;
    packetEncoding?: string;
    security?: 'none' | 'tls' | 'reality' | string;
    sni?: string;
    alpn?: string[];
    fingerprint?: string;
    skipCertVerify?: boolean;
    realityOpts?: {
      publicKey: string;
      shortId?: string;
      spiderX?: string;
    };
    transport?: {
      type: 'tcp' | 'ws' | 'grpc' | 'http' | 'h2' | 'xhttp' | 'splithttp' | string;
      path?: string;
      headers?: Record<string, string>;
      serviceName?: string;
      mode?: string;
      extra?: string;
      headerType?: string;
      authority?: string;
    };
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface VmessNode extends BaseNode {
  protocol: 'vmess';
  protocolData: {
    uuid: string;
    alterId: number;
    cipher: string;
    security?: string;
    tls?: boolean;
    sni?: string;
    alpn?: string[];
    fingerprint?: string;
    skipCertVerify?: boolean;
    packetEncoding?: string;
    globalPadding?: boolean;
    authenticatedLength?: boolean;
    transport?: {
      type: string;
      path?: string;
      headers?: Record<string, string>;
      serviceName?: string;
      httpHost?: string[];
      httpPath?: string[];
      // mKCP fields
      seed?: string;
      headerType?: string;
      congestion?: boolean;
      uplinkCapacity?: number;
      downlinkCapacity?: number;
      mtu?: number;
      tti?: number;
      writeBuffer?: number;
      readBuffer?: number;
      // MeKya fields
      url?: string;
      maxWriteDelay?: number;
      maxRequestSize?: number;
      pollingIntervalInitial?: number;
      h2PoolSize?: number;
    };
    rawJson: Record<string, unknown>;
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface ShadowsocksNode extends BaseNode {
  protocol: 'ss' | 'shadowsocks';
  protocolData: {
    cipher: string;
    password: string;
    isSS2022: boolean;
    plugin?: string;
    pluginOpts?: Record<string, any>;
    udpOverTcp?: boolean;
    udpOverTcpVersion?: number;
    clientFingerprint?: string;
    smux?: Record<string, any>;
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface Hysteria2Node extends BaseNode {
  protocol: 'hysteria2' | 'hy2';
  protocolData: {
    password: string;
    sni?: string;
    skipCertVerify?: boolean;
    ports?: string;
    hopInterval?: number;
    up?: string | number;
    down?: string | number;
    obfs?: string;
    obfsPassword?: string;
    obfsMinPacketSize?: number;
    obfsMaxPacketSize?: number;
    alpn?: string[];
    certificateFingerprint?: string;
    fingerprint?: string;
    nameCertVerify?: string;
    handshakeTimeout?: string;
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface AnyTLSNode extends BaseNode {
  protocol: 'anytls';
  protocolData: {
    password: string;
    sni?: string;
    insecure?: boolean;
    alpn?: string[];
    fingerprint?: string;
    nameCertVerify?: string;
    clientMetadata?: string;
    idleSessionCheckInterval?: string;
    idleSessionTimeout?: string;
    minIdleSession?: string;
    shadowTlsOpts?: Record<string, any>;
    restlsOpts?: Record<string, any>;
    jlsOpts?: Record<string, any>;
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface TrojanNode extends BaseNode {
  protocol: 'trojan';
  protocolData: {
    password: string;
    sni?: string;
    alpn?: string[];
    fingerprint?: string;
    skipCertVerify?: boolean;
    transport?: {
      type: string;
      path?: string;
      headers?: Record<string, string>;
      serviceName?: string;
    };
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface TuicNode extends BaseNode {
  protocol: 'tuic';
  protocolData: {
    uuid?: string;
    password?: string;
    token?: string;
    version?: 4 | 5;
    ip?: string;
    heartbeatInterval?: string | number;
    reduceRtt?: boolean;
    requestTimeout?: string | number;
    disableSni?: boolean;
    fastOpen?: boolean;
    maxOpenStreams?: number;
    maxUdpRelayPacketSize?: number;
    congestionController?: string;
    udpRelayMode?: string;
    alpn?: string[];
    sni?: string;
    skipCertVerify?: boolean;
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface ShadowsocksRNode extends BaseNode {
  protocol: 'ssr' | 'shadowsocksr';
  protocolData: {
    cipher: string;
    password: string;
    protocol: string;
    obfs: string;
    obfsParam?: string;
    protoParam?: string;
    invalidParams?: InvalidQueryParam[];
    extras: Record<string, unknown>;
  };
}

export interface GenericProxyNode extends BaseNode {
  protocol: string;
  protocolData: Record<string, any>;
}

export type NodeEnvelope =
  | VlessNode
  | VmessNode
  | ShadowsocksNode
  | Hysteria2Node
  | AnyTLSNode
  | TrojanNode
  | TuicNode
  | ShadowsocksRNode
  | GenericProxyNode;

export type ProxyNode = NodeEnvelope;

export type ConversionStatus = 'perfect' | 'warning' | 'fatal';

export interface ConversionWarning {
  level: 'info' | 'warn' | 'fatal';
  field?: string;
  message: string;
}

export interface AdapterResult {
  config?: Record<string, any>;
  fatal: boolean;
  lossy: boolean;
  emitted: boolean;
  warnings: ConversionWarning[];
  unsupportedParams: string[];
  skipReason?: string;
}

export interface NodeConversionInfo {
  status: ConversionStatus;
  emitted: boolean;
  target: string;
  lossy: boolean;
  warnings: string[];
  unsupportedParams: string[];
  skipReason?: string;
}

export interface ConvertOptions {
  urls: string[];
  target: 'clash' | 'singbox' | 'base64' | 'shadowrocket' | 'shadowrocket-conf' | 'surge' | 'raw';
  includeRegex?: string;
  excludeRegex?: string;
  renameRules?: Array<{ search: string; replace: string }>;
  addEmoji?: boolean;
  enableUdp?: boolean;
  showInfo?: boolean;
  token?: string;
  customTemplate?: string;
}

export interface NodeSubscriptionInfo {
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
}
