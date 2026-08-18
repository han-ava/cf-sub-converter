// src/adapters/mihomo/shadowsocks.ts
import { AdapterResult, ConversionWarning, ShadowsocksNode } from '../../types';

export function adaptShadowsocksToMihomo(node: ShadowsocksNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  if (!p.cipher || !p.password) {
    return {
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 Shadowsocks 密码或加密方式` }],
      unsupportedParams: ['password'],
      lossy: true,
      fatal: true
    };
  }

  const config: Record<string, any> = {
    name: node.name,
    type: 'ss',
    server: node.server,
    port: node.port,
    cipher: p.cipher,
    password: p.password,
    udp: node.udp !== false
  };

  if (p.plugin) {
    config.plugin = p.plugin;
    if (p.pluginOpts) {
      config['plugin-opts'] = p.pluginOpts;
    }
  }

  if (p.udpOverTcp !== undefined) {
    config['udp-over-tcp'] = p.udpOverTcp;
  }

  if (p.udpOverTcpVersion !== undefined) {
    config['udp-over-tcp-version'] = p.udpOverTcpVersion;
  }

  if (p.clientFingerprint) {
    config['client-fingerprint'] = p.clientFingerprint;
  }

  if (p.smux) {
    config.smux = p.smux;
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
    warnings,
    unsupportedParams,
    lossy: unsupportedParams.length > 0,
    fatal: false
  };
}
