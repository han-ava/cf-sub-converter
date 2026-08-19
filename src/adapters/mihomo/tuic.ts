// src/adapters/mihomo/tuic.ts
import { AdapterResult, ConversionWarning, TuicNode } from '../../types';
import { parseALPN, detectUnmappedFields, processInvalidParams } from '../../utils';

export function adaptTuicToMihomo(node: TuicNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 凭据与版本校验 (TUIC V4: token; TUIC V5: uuid + password)
  const hasToken = !!(p.token && p.token.trim());
  const hasUuid = !!(p.uuid && p.uuid.trim());
  const hasPassword = !!(p.password && p.password.trim());

  if (hasToken && (hasUuid || hasPassword)) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] TUIC 凭据冲突：TUIC V4 (token) 与 V5 (uuid/password) 不可混用`,
      warnings: [{ level: 'fatal', field: 'token', message: 'TUIC V4 (token) 与 V5 (uuid/password) 凭据冲突' }],
      unsupportedParams: ['token', 'uuid', 'password']
    };
  }

  if (!hasToken && !hasUuid && !hasPassword) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 TUIC 凭据 (V4 需要 token，V5 需要 uuid 与 password)`,
      warnings: [{ level: 'fatal', field: 'uuid', message: `节点 [${node.name}] 缺少必需的 TUIC 凭据` }],
      unsupportedParams: ['uuid', 'password', 'token']
    };
  }

  if (!hasToken) {
    if (hasUuid && !hasPassword) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `节点 [${node.name}] TUIC V5 缺少必需的 password`,
        warnings: [{ level: 'fatal', field: 'password', message: 'TUIC V5 缺少必需的 password' }],
        unsupportedParams: ['password']
      };
    }
    if (!hasUuid && hasPassword) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `节点 [${node.name}] TUIC V5 缺少必需的 uuid`,
        warnings: [{ level: 'fatal', field: 'uuid', message: 'TUIC V5 缺少必需的 uuid' }],
        unsupportedParams: ['uuid']
      };
    }
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['uuid', 'password', 'token', 'server', 'port']));
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
    'congestion-controller': p.congestionController || 'bbr',
    'udp-relay-mode': p.udpRelayMode || 'native',
    alpn: alpn && alpn.length > 0 ? alpn : ['h3'],
    'skip-cert-verify': !!p.skipCertVerify,
    udp: node.udp !== false
  };

  if (hasToken) {
    config.token = p.token!.trim();
  } else {
    config.uuid = p.uuid!.trim();
    config.password = p.password!.trim();
  }

  if (p.ip) {
    config.ip = p.ip;
  }

  if (p.heartbeatInterval !== undefined) {
    config['heartbeat-interval'] = p.heartbeatInterval;
  }

  if (p.reduceRtt !== undefined) {
    config['reduce-rtt'] = p.reduceRtt;
  }

  if (p.requestTimeout !== undefined) {
    config['request-timeout'] = p.requestTimeout;
  }

  if (p.disableSni !== undefined) {
    config['disable-sni'] = p.disableSni;
  }

  if (!p.disableSni) {
    config.sni = p.sni || node.server;
  }

  if (p.fastOpen !== undefined) {
    config['fast-open'] = p.fastOpen;
  }

  if (p.maxOpenStreams !== undefined) {
    config['max-open-streams'] = p.maxOpenStreams;
  }

  if (p.maxUdpRelayPacketSize !== undefined) {
    config['max-udp-relay-packet-size'] = p.maxUdpRelayPacketSize;
  }

  // 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
  const HANDLED_TUIC_PROTOCOL_KEYS = new Set([
    'uuid', 'password', 'token', 'version', 'ip', 'heartbeatInterval',
    'reduceRtt', 'requestTimeout', 'disableSni', 'fastOpen', 'maxOpenStreams',
    'maxUdpRelayPacketSize', 'congestionController', 'udpRelayMode', 'alpn',
    'sni', 'skipCertVerify', 'invalidParams', 'extras'
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
