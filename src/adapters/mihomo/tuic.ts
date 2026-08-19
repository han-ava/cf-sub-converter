// src/adapters/mihomo/tuic.ts
import { AdapterResult, ConversionWarning, TuicNode } from '../../types';
import { parseALPN, detectUnmappedFields, processInvalidParams } from '../../utils';

export function adaptTuicToMihomo(node: TuicNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需凭据校验
  if (!p.uuid && !p.password) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 TUIC UUID 或密码`,
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 TUIC UUID 或密码` }],
      unsupportedParams: ['uuid']
    };
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['uuid', 'password', 'server', 'port']));
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

  const alpn = parseALPN(p.alpn);

  const config: Record<string, any> = {
    name: node.name,
    type: 'tuic',
    server: node.server,
    port: node.port,
    uuid: p.uuid || '',
    password: p.password || '',
    sni: p.sni || node.server,
    'congestion-controller': p.congestionControl || 'bbr',
    'udp-relay-mode': p.udpRelayMode || 'native',
    alpn: alpn && alpn.length > 0 ? alpn : ['h3'],
    'skip-cert-verify': !!p.skipCertVerify,
    udp: node.udp !== false
  };

  if (p.zeroRttHandshake !== undefined) {
    config['zero-rtt-handshake'] = p.zeroRttHandshake;
  }

  if (p.heartbeat !== undefined) {
    config.heartbeat = p.heartbeat;
  }

  // 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
  const HANDLED_TUIC_PROTOCOL_KEYS = new Set([
    'uuid', 'password', 'sni', 'alpn', 'skipCertVerify', 'congestionControl',
    'udpRelayMode', 'zeroRttHandshake', 'heartbeat', 'invalidParams', 'extras'
  ]);
  const unmapped = detectUnmappedFields(p as Record<string, unknown>, HANDLED_TUIC_PROTOCOL_KEYS);
  for (const item of unmapped) {
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
      warnings.push({
        level: 'warn',
        field: k,
        message: `参数 [${k}=${v}] 已保留在原始节点中，但 Mihomo 官方无对应字段映射`
      });
    }
  }

  return {
    config,
    fatal: false,
    lossy: unsupportedParams.length > 0,
    emitted: true,
    warnings,
    unsupportedParams
  };
}
