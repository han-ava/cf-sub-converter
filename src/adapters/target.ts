import { AdapterResult, ConversionWarning, NodeEnvelope } from '../types';
import { adaptNodeToMihomo } from './mihomo';
import { toRawLinks } from './raw';
import { adaptNodeToSingBox } from './singbox';

export const CANONICAL_TARGETS = [
  'mihomo',
  'singbox',
  'shadowrocket',
  'base64',
  'shadowrocket-conf',
  'raw',
  'surge',
  'surge-conf',
  'quantumult-x',
  'loon'
] as const;

export type CanonicalTarget = typeof CANONICAL_TARGETS[number];

const TARGET_ALIASES: Record<string, CanonicalTarget> = {
  mihomo: 'mihomo',
  clash: 'mihomo',
  meta: 'mihomo',
  singbox: 'singbox',
  'sing-box': 'singbox',
  shadowrocket: 'shadowrocket',
  rocket: 'shadowrocket',
  base64: 'base64',
  'shadowrocket-conf': 'shadowrocket-conf',
  raw: 'raw',
  surge: 'surge',
  'surge-conf': 'surge-conf',
  'quantumult-x': 'quantumult-x',
  quantumultx: 'quantumult-x',
  qx: 'quantumult-x',
  loon: 'loon'
};

const SURGE_PROTOCOLS = new Set(['ss', 'shadowsocks', 'trojan', 'vmess']);
const SHADOWROCKET_CONF_PROTOCOLS = new Set([
  'ss',
  'shadowsocks',
  'trojan',
  'vmess',
  'vless',
  'hysteria2',
  'hy2',
  'anytls',
  'tuic'
]);
const QUANTUMULT_X_PROTOCOLS = new Set(['ss', 'shadowsocks', 'vmess', 'vless', 'trojan']);
const LOON_PROTOCOLS = new Set([
  'ss',
  'shadowsocks',
  'ssr',
  'shadowsocksr',
  'vmess',
  'vless',
  'trojan',
  'http',
  'https',
  'hysteria2',
  'hy2'
]);

export function normalizeTarget(value: unknown): CanonicalTarget | null {
  if (typeof value !== 'string') return null;
  return TARGET_ALIASES[value.trim().toLowerCase()] ?? null;
}

function warningResult(message: string, field: string): AdapterResult {
  const warning: ConversionWarning = { level: 'warn', field, message };
  return {
    fatal: false,
    lossy: true,
    emitted: true,
    warnings: [warning],
    unsupportedParams: []
  };
}

function fatalResult(message: string): AdapterResult {
  const warning: ConversionWarning = { level: 'fatal', field: 'protocol', message };
  return {
    fatal: true,
    lossy: true,
    emitted: false,
    warnings: [warning],
    unsupportedParams: [],
    skipReason: message
  };
}

function unsupportedResult(message: string, ...unsupportedParams: string[]): AdapterResult {
  const result = fatalResult(message);
  result.unsupportedParams = unsupportedParams;
  return result;
}

function perfectResult(): AdapterResult {
  return {
    fatal: false,
    lossy: false,
    emitted: true,
    warnings: [],
    unsupportedParams: []
  };
}

function adaptToRawLinkTarget(node: NodeEnvelope, target: CanonicalTarget): AdapterResult {
  let rawLink = '';
  try {
    rawLink = toRawLinks([node]);
  } catch {
    return fatalResult(
      `目标 ${target} 无法输出节点 [${node.name}] 的协议 [${node.protocol || 'unknown'}]`
    );
  }

  if (!rawLink.trim()) {
    return fatalResult(
      `目标 ${target} 无法输出节点 [${node.name}] 的协议 [${node.protocol || 'unknown'}]`
    );
  }

  if (node.source.format === 'uri' && node.source.raw) {
    if (target === 'shadowrocket') {
      return warningResult(
        `节点 [${node.name}] 的原始 URI 会完整保留，但尚未验证该协议与参数是否被 Shadowrocket 客户端支持`,
        'client-compatibility-unverified'
      );
    }
    return perfectResult();
  }

  return warningResult(
    `节点 [${node.name}] 将从 ${node.source.format} 结构重建为 URI，无法保证所有参数逐项无损`,
    'source-format-rebuild'
  );
}

function adaptToGeneratedTarget(
  node: NodeEnvelope,
  target: 'surge' | 'surge-conf' | 'shadowrocket-conf',
  supportedProtocols: Set<string>
): AdapterResult {
  const protocol = (node.protocol || '').toLowerCase();
  if (!supportedProtocols.has(protocol)) {
    return fatalResult(
      `目标 ${target} 的生成器不支持节点 [${node.name}] 的协议 [${protocol || 'unknown'}]`
    );
  }

  return warningResult(
    `节点 [${node.name}] 将由 ${target} 生成器重建；仅确认协议可输出，无法保证所有参数逐项无损`,
    'target-parameter-mapping'
  );
}

function transportType(node: NodeEnvelope): string {
  const p: any = node.protocolData || {};
  return String(p.transport?.type || p.network || p.net || 'tcp').toLowerCase();
}

function usesTls(node: NodeEnvelope): boolean {
  const protocol = (node.protocol || '').toLowerCase();
  const p: any = node.protocolData || {};
  if (protocol === 'trojan' || protocol === 'hysteria2' || protocol === 'hy2') return true;
  if (protocol === 'vless') return p.security === 'tls' || p.security === 'reality' || !!p.realityOpts;
  if (p.tls?.enabled !== undefined) return !!p.tls.enabled;
  return p.tls === true || p.tls === 'tls' || p.tls === 'true' || p.tls === 1;
}

function transportHost(node: NodeEnvelope): string {
  const p: any = node.protocolData || {};
  return String(
    p.transport?.headers?.Host
    || p.transport?.headers?.host
    || p.host
    || p['ws-opts']?.headers?.Host
    || ''
  );
}

function adaptToNativeClientTarget(
  node: NodeEnvelope,
  target: 'quantumult-x' | 'loon',
  supportedProtocols: Set<string>
): AdapterResult {
  const protocol = (node.protocol || '').toLowerCase();
  const p: any = node.protocolData || {};
  if (!supportedProtocols.has(protocol)) {
    return fatalResult(
      `目标 ${target} 的生成器不支持节点 [${node.name}] 的协议 [${protocol || 'unknown'}]`
    );
  }

  if ((protocol === 'ss' || protocol === 'shadowsocks') && p.plugin) {
    const plugin = String(p.plugin).toLowerCase();
    if (!['obfs-local', 'simple-obfs'].includes(plugin)) {
      return unsupportedResult(
        `目标 ${target} 无法等价转换节点 [${node.name}] 的 Shadowsocks 插件 [${p.plugin}]`,
        'plugin'
      );
    }
  }

  if (protocol === 'vmess' || protocol === 'vless' || protocol === 'trojan') {
    const transport = transportType(node);
    const allowedTransports = target === 'quantumult-x'
      ? new Set(['tcp', 'ws', 'http'])
      : new Set(['tcp', 'ws', 'http']);
    if (!allowedTransports.has(transport)) {
      return unsupportedResult(
        `目标 ${target} 不支持节点 [${node.name}] 的传输层 [${transport}]`,
        'transport.type'
      );
    }

    if (target === 'quantumult-x' && transport === 'http' && usesTls(node)) {
      return unsupportedResult(
        `Quantumult X 原生节点行无法同时表达节点 [${node.name}] 的 HTTP 传输与 TLS`,
        'transport.type',
        'tls'
      );
    }

    if (target === 'loon' && (p.security === 'reality' || p.realityOpts)) {
      return unsupportedResult(
        `Loon 官方节点格式未声明节点 [${node.name}] 的 Reality 参数`,
        'reality'
      );
    }

    if (target === 'quantumult-x' && transport === 'ws' && usesTls(node)) {
      const host = transportHost(node);
      const sni = String(p.sni || p.servername || p['server-name'] || node.server);
      if (host && sni && host.toLowerCase() !== sni.toLowerCase()) {
        return unsupportedResult(
          `Quantumult X 的 WSS obfs-host 同时用于 SNI 与 Host，无法无损表达节点 [${node.name}] 的不同取值`,
          'transport.headers.Host',
          'sni'
        );
      }
    }
  }

  if ((protocol === 'hysteria2' || protocol === 'hy2') && target === 'loon') {
    const unsupported = ['obfs', 'ports', 'hopInterval', 'certificateFingerprint']
      .filter(field => p[field] !== undefined && p[field] !== null && p[field] !== '');
    if (unsupported.length > 0) {
      return unsupportedResult(
        `Loon 官方节点格式未声明节点 [${node.name}] 的 Hysteria2 参数: ${unsupported.join(', ')}`,
        ...unsupported
      );
    }
  }

  return warningResult(
    `节点 [${node.name}] 将由 ${target} 原生节点生成器重建；已验证协议与关键传输参数`,
    'target-parameter-mapping'
  );
}

export function adaptNodeToTarget(node: NodeEnvelope, target: CanonicalTarget): AdapterResult {
  switch (target) {
    case 'mihomo':
      return adaptNodeToMihomo(node);
    case 'raw':
    case 'base64':
    case 'shadowrocket':
      return adaptToRawLinkTarget(node, target);
    case 'singbox':
      return adaptNodeToSingBox(node);
    case 'surge':
    case 'surge-conf':
      return adaptToGeneratedTarget(node, target, SURGE_PROTOCOLS);
    case 'shadowrocket-conf':
      return adaptToGeneratedTarget(node, target, SHADOWROCKET_CONF_PROTOCOLS);
    case 'quantumult-x':
      return adaptToNativeClientTarget(node, target, QUANTUMULT_X_PROTOCOLS);
    case 'loon':
      return adaptToNativeClientTarget(node, target, LOON_PROTOCOLS);
  }
}
