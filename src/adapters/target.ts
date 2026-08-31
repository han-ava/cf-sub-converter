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
  'surge'
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
  surge: 'surge'
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
  target: 'surge' | 'shadowrocket-conf',
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
      return adaptToGeneratedTarget(node, target, SURGE_PROTOCOLS);
    case 'shadowrocket-conf':
      return adaptToGeneratedTarget(node, target, SHADOWROCKET_CONF_PROTOCOLS);
  }
}
