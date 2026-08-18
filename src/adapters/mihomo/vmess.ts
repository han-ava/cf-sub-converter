// src/adapters/mihomo/vmess.ts
import { AdapterResult, ConversionWarning, VmessNode } from '../../types';
import { parseALPN } from '../../utils';

const SUPPORTED_VMESS_TRANSPORTS = new Set(['tcp', 'ws', 'grpc', 'http', 'h2']);

export function adaptVmessToMihomo(node: VmessNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 必需凭据校验
  if (!p.uuid || !p.uuid.trim()) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 VMess UUID`,
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 VMess UUID` }],
      unsupportedParams: ['uuid']
    };
  }

  // Compatibility Gate: 传输协议支持检查
  const transportType = (p.transport?.type || 'tcp').toLowerCase();
  if (!SUPPORTED_VMESS_TRANSPORTS.has(transportType)) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `Mihomo 客户端不支持的 VMess 传输协议: [${transportType}]`,
      warnings: [{ level: 'fatal', field: 'transport.type', message: `不支持的 VMess 传输类型: [${transportType}]` }],
      unsupportedParams: ['transport.type']
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'vmess',
    server: node.server,
    port: node.port,
    uuid: p.uuid.trim(),
    alterId: p.alterId !== undefined ? p.alterId : 0,
    cipher: p.cipher || 'auto',
    tls: !!p.tls,
    servername: p.sni || node.server,
    network: transportType,
    udp: node.udp !== false
  };

  if (p.skipCertVerify) {
    config['skip-cert-verify'] = true;
  }

  if (p.fingerprint) {
    config['client-fingerprint'] = p.fingerprint;
  }

  const alpn = parseALPN(p.alpn);
  if (alpn && alpn.length > 0) {
    config.alpn = alpn;
  }

  if (p.packetEncoding) {
    config['packet-encoding'] = p.packetEncoding;
  }

  if (p.globalPadding !== undefined) {
    config['global-padding'] = p.globalPadding;
  }

  if (p.authenticatedLength !== undefined) {
    config['authenticated-length'] = p.authenticatedLength;
  }

  const t = p.transport;
  if (t) {
    const net = transportType;
    if (net === 'ws') {
      config['ws-opts'] = {
        path: t.path || '/',
        headers: t.headers || {}
      };
    } else if (net === 'grpc') {
      config['grpc-opts'] = {
        'grpc-service-name': t.serviceName || ''
      };
    } else if (net === 'http' || net === 'h2') {
      config['http-opts'] = {
        path: t.httpPath || (t.path ? [t.path] : ['/']),
        headers: t.httpHost ? { Host: t.httpHost } : undefined
      };
    }
  }

  if (p.extras && Object.keys(p.extras).length > 0) {
    for (const [k, v] of Object.entries(p.extras)) {
      unsupportedParams.push(k);
      warnings.push({
        level: 'warn',
        field: k,
        message: `参数 [${k}=${v}] 已保留在原始 VMess JSON 中，但 Mihomo 官方无对应字段映射`
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
