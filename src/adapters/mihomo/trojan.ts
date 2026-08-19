// src/adapters/mihomo/trojan.ts
import { AdapterResult, ConversionWarning, TrojanNode } from '../../types';
import { parseALPN, detectUnmappedFields, processInvalidParams } from '../../utils';

export function adaptTrojanToMihomo(node: TrojanNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需密码校验
  if (!p.password || !p.password.trim()) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 Trojan 密码`,
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 Trojan 密码` }],
      unsupportedParams: ['password']
    };
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['password', 'server', 'port']));
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

  const config: Record<string, any> = {
    name: node.name,
    type: 'trojan',
    server: node.server,
    port: node.port,
    password: p.password.trim(),
    sni: p.sni || node.server,
    'skip-cert-verify': !!p.skipCertVerify,
    network: p.transport?.type || 'tcp',
    udp: node.udp !== false
  };

  const alpn = parseALPN(p.alpn);
  config.alpn = alpn && alpn.length > 0 ? alpn : ['h2', 'http/1.1'];

  if (p.fingerprint) {
    config['client-fingerprint'] = p.fingerprint;
  }

  const t = p.transport;
  if (t) {
    const net = String(t.type || 'tcp').toLowerCase();
    if (net === 'ws') {
      config['ws-opts'] = {
        path: t.path || '/',
        headers: t.headers || {}
      };
    } else if (net === 'grpc') {
      config['grpc-opts'] = {
        'grpc-service-name': t.serviceName || ''
      };
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
  const HANDLED_TROJAN_PROTOCOL_KEYS = new Set([
    'password', 'sni', 'alpn', 'skipCertVerify', 'fingerprint', 'transport', 'invalidParams', 'extras'
  ]);
  const HANDLED_TROJAN_TRANSPORT_KEYS = new Set([
    'type', 'path', 'headers', 'serviceName', 'mode', 'headerType'
  ]);
  const unmappedProto = detectUnmappedFields(p as Record<string, unknown>, HANDLED_TROJAN_PROTOCOL_KEYS);
  const unmappedTrans = p.transport ? detectUnmappedFields(p.transport as Record<string, unknown>, HANDLED_TROJAN_TRANSPORT_KEYS, 'transport') : [];
  for (const item of [...unmappedProto, ...unmappedTrans]) {
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
