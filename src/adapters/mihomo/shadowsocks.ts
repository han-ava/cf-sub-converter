// src/adapters/mihomo/shadowsocks.ts
import { AdapterResult, ConversionWarning, ShadowsocksNode, InvalidQueryParam } from '../../types';
import { strictBase64Decode, detectUnmappedFields, processInvalidParams } from '../../utils';

const SUPPORTED_SS_PLUGINS = new Set([
  'obfs',
  'v2ray-plugin',
  'gost-plugin',
  'shadow-tls',
  'restls',
  'kcptun',
  'jls'
]);

function formatMihomoPluginOpts(
  plugin: string,
  rawOpts: Record<string, any>
): { opts: Record<string, any>; invalidParams: InvalidQueryParam[] } {
  const result: Record<string, any> = {};
  const invalidParams: InvalidQueryParam[] = [];
  const booleanKeys = new Set(['tls', 'mux', 'skip-cert-verify', 'skipcertverify', 'nocomp', 'quiet']);
  const numberKeys = new Set([
    'version', 'mtu', 'sndwnd', 'rcvwnd', 'datashard', 'parityshard', 'dscp', 'interval', 'resend', 'nc'
  ]);

  for (const [k, v] of Object.entries(rawOpts)) {
    const kLower = k.toLowerCase();
    if (v === true || v === false) {
      result[k] = v;
    } else if (typeof v === 'string') {
      const valTrimmed = v.trim();
      const valLower = valTrimmed.toLowerCase();
      if (booleanKeys.has(kLower)) {
        if (valLower === 'true' || valLower === '1' || valTrimmed === '') {
          result[k] = true;
        } else if (valLower === 'false' || valLower === '0') {
          result[k] = false;
        } else {
          invalidParams.push({
            key: `plugin-opts.${k}`,
            value: v,
            reason: `插件参数 [${k}] 期望布尔值 (true/false/1/0)，但实际值为 "${v}"`
          });
        }
      } else if (numberKeys.has(kLower)) {
        if (/^-?\d+$/.test(valTrimmed)) {
          result[k] = parseInt(valTrimmed, 10);
        } else {
          invalidParams.push({
            key: `plugin-opts.${k}`,
            value: v,
            reason: `插件参数 [${k}] 期望整数，但实际值为 "${v}"`
          });
        }
      } else {
        result[k] = valTrimmed;
      }
    } else {
      result[k] = v;
    }
  }
  return { opts: result, invalidParams };
}

export function adaptShadowsocksToMihomo(node: ShadowsocksNode): AdapterResult {
  const warnings: ConversionWarning[] = [];
  const unsupportedParams: string[] = [];
  const p = node.protocolData;

  // Compatibility Gate: 密码与加密基础校验
  if (!p.cipher || !p.password) {
    return {
      fatal: true,
      lossy: true,
      emitted: false,
      skipReason: `节点 [${node.name}] 缺少必需的 Shadowsocks 密码或加密算法`,
      warnings: [{ level: 'fatal', field: 'password', message: `节点 [${node.name}] 缺少必需的 Shadowsocks 密码或加密方式` }],
      unsupportedParams: ['password']
    };
  }

  // Compatibility Gate: 非法参数 (invalidParams) 分类拦截与警告
  const invRes = processInvalidParams(p.invalidParams, new Set(['password', 'cipher', 'server', 'port']));
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

  // Compatibility Gate: SS2022 严格 Base64 密钥长度校验 (SIP022 标准规范)
  if (p.isSS2022) {
    const decoded = strictBase64Decode(p.password);
    if (!decoded) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `节点 [${node.name}] SS2022 密码不是合法的 Base64 格式`,
        warnings: [{ level: 'fatal', field: 'password', message: `SS2022 密码 Base64 格式非法` }],
        unsupportedParams: ['password']
      };
    }

    if (p.cipher === '2022-blake3-aes-128-gcm' && decoded.length !== 16) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `节点 [${node.name}] SS2022 密钥长度错误: 2022-blake3-aes-128-gcm 必须为 16 字节 (当前为 ${decoded.length} 字节)`,
        warnings: [{ level: 'fatal', field: 'password', message: `SS2022 密钥长度不匹配: 期望 16 字节，实际 ${decoded.length} 字节` }],
        unsupportedParams: ['password']
      };
    }

    if ((p.cipher === '2022-blake3-aes-256-gcm' || p.cipher === '2022-blake3-chacha20-poly1305') && decoded.length !== 32) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `节点 [${node.name}] SS2022 密钥长度错误: ${p.cipher} 必须为 32 字节 (当前为 ${decoded.length} 字节)`,
        warnings: [{ level: 'fatal', field: 'password', message: `SS2022 密钥长度不匹配: 期望 32 字节，实际 ${decoded.length} 字节` }],
        unsupportedParams: ['password']
      };
    }
  }

  // Compatibility Gate: 插件协议规范化与支持检查
  let normalizedPlugin: string | undefined;
  if (p.plugin) {
    const pluginLower = p.plugin.toLowerCase().trim();
    if (pluginLower === 'obfs-local' || pluginLower === 'simple-obfs') {
      normalizedPlugin = 'obfs';
    } else if (pluginLower === 'v2ray') {
      normalizedPlugin = 'v2ray-plugin';
    } else {
      normalizedPlugin = pluginLower;
    }

    if (!SUPPORTED_SS_PLUGINS.has(normalizedPlugin)) {
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `Mihomo 客户端不支持该 Shadowsocks 插件: [${p.plugin}]`,
        warnings: [{ level: 'fatal', field: 'plugin', message: `不支持的 SS 插件: [${p.plugin}]` }],
        unsupportedParams: ['plugin']
      };
    }
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

  if (normalizedPlugin) {
    config.plugin = normalizedPlugin;
    if (p.pluginOpts) {
      const { opts: formattedOpts, invalidParams: pluginInv } = formatMihomoPluginOpts(normalizedPlugin, p.pluginOpts);
      config['plugin-opts'] = formattedOpts;
      if (pluginInv.length > 0) {
        for (const item of pluginInv) {
          unsupportedParams.push(item.key);
          warnings.push({
            level: 'warn',
            field: item.key,
            message: `参数 [${item.key}=${item.value}] 格式非法: ${item.reason}`
          });
        }
      }
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

  // 自动检测 known-but-unmapped：对比已解析字段集与适配器建模字段集
  const HANDLED_SS_PROTOCOL_KEYS = new Set([
    'cipher', 'password', 'isSS2022', 'plugin', 'pluginOpts',
    'udpOverTcp', 'udpOverTcpVersion', 'clientFingerprint', 'smux', 'invalidParams', 'extras'
  ]);
  const unmapped = detectUnmappedFields(p as Record<string, unknown>, HANDLED_SS_PROTOCOL_KEYS);
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
