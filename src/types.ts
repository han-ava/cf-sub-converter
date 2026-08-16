// src/types.ts

export interface Env {
  AUTH_TOKEN?: string;
  [key: string]: unknown;
}

export type ProxyType =
  | 'ss'
  | 'shadowsocks'
  | 'ssr'
  | 'shadowsocksr'
  | 'vmess'
  | 'vless'
  | 'trojan'
  | 'hysteria'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'socks5'
  | 'http';

export interface ProxyNode {
  name: string;
  type: string;
  server: string;
  port: number;
  uuid?: string;
  password?: string;
  cipher?: string;
  udp?: boolean;
  tls?: boolean;
  sni?: string;
  alpn?: string[];
  fingerprint?: string;
  skipCertVerify?: boolean;
  network?: string;
  wsPath?: string;
  wsHeaders?: Record<string, string>;
  grpcServiceName?: string;
  flow?: string;
  reality?: {
    publicKey: string;
    shortId?: string;
    spiderX?: string;
  };
  obfs?: string;
  obfsPassword?: string;
  obfsParam?: string;
  protoParam?: string;
  protocol?: string;
  // Hysteria / TUIC specific
  upMbps?: number;
  downMbps?: number;
  congestionControl?: string;
  udpRelayMode?: string;
  // Clash & Sing-box specific cached representations
  clashObj?: Record<string, any>;
  singboxObj?: Record<string, any>;
  raw?: string;
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
