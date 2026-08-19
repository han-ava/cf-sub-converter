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

/**
 * 插件连接关键字段门禁表 (Critical Field Gate)
 * 当用户提供了这些关键字段但值非法或无法安全转换时，必须升级为 Fatal 拦截，禁止静默丢弃
 */
const PLUGIN_CRITICAL_FIELDS: Record<string, Set<string>> = {
  'shadow-tls':   new Set(['host', 'password', 'version']),
  'obfs':         new Set(['mode', 'host']),
  'v2ray-plugin': new Set(['mode']),
  'restls':       new Set(['host', 'password']),
  'gost-plugin':  new Set(['mode']),
  'kcptun':       new Set([])
};

function formatMihomoPluginOpts(
  plugin: string,
  rawOpts: Record<string, any>
): { opts: Record<string, any>; invalidParams: InvalidQueryParam[] } {
  const result: Record<string, any> = {};
  const invalidParams: InvalidQueryParam[] = [];
  const booleanKeys = new Set(['tls', 'mux', 'skip-cert-verify', 'skipcertverify', 'nocomp', 'quiet', 'insecure', 'allowinsecure']);
  const numberKeys = new Set([
    'version', 'mtu', 'sndwnd', 'rcvwnd', 'datashard', 'parityshard', 'dscp', 'interval', 'resend', 'nc'
  ]);

  for (const [rawK, v] of Object.entries(rawOpts)) {
    const kTrimmed = rawK.trim();
    const kLower = kTrimmed.toLowerCase();

    // 插件别名规范化映射
    let targetKey = kTrimmed;
    if (plugin === 'obfs') {
      if (kLower === 'obfs') targetKey = 'mode';
      else if (kLower === 'obfs-host' || kLower === 'obfshost') targetKey = 'host';
    } else if (plugin === 'shadow-tls') {
      if (kLower === 'sni' || kLower === 'server-name' || kLower === 'servername') targetKey = 'host';
      else if (kLower === 'pass' || kLower === 'pwd') targetKey = 'password';
      else if (kLower === 'ver') targetKey = 'version';
    } else if (plugin === 'restls') {
      if (kLower === 'sni' || kLower === 'server-name' || kLower === 'servername') targetKey = 'host';
      else if (kLower === 'pass' || kLower === 'pwd') targetKey = 'password';
      else if (kLower === 'version_hint' || kLower === 'versionhint') targetKey = 'version-hint';
    } else if (plugin === 'v2ray-plugin') {
      if (kLower === 'skipcertverify' || kLower === 'insecure' || kLower === 'allowinsecure') targetKey = 'skip-cert-verify';
    }

    const targetKeyLower = targetKey.toLowerCase();

    // 1. obfs mode 枚举校验 (仅支持 http 或 tls)
    if (plugin === 'obfs' && targetKeyLower === 'mode') {
      const modeStr = String(v).trim().toLowerCase();
      if (modeStr === 'http' || modeStr === 'tls') {
        result[targetKey] = modeStr;
      } else {
        invalidParams.push({
          key: `plugin-opts.${targetKey}`,
          value: String(v),
          reason: `obfs 插件 mode 仅支持 http 或 tls (当前为: "${v}")`
        });
      }
      continue;
    }

    // 2. v2ray-plugin mode 枚举校验 (仅支持 websocket 或 http)
    if (plugin === 'v2ray-plugin' && targetKeyLower === 'mode') {
      const modeStr = String(v).trim().toLowerCase();
      if (modeStr === 'websocket' || modeStr === 'http') {
        result[targetKey] = modeStr;
      } else {
        invalidParams.push({
          key: `plugin-opts.${targetKey}`,
          value: String(v),
          reason: `v2ray-plugin 插件 mode 仅支持 websocket 或 http (当前为: "${v}")`
        });
      }
      continue;
    }

    // 3. shadow-tls version 校验 (必须为 1, 2 或 3)
    if (plugin === 'shadow-tls' && targetKeyLower === 'version') {
      let verNum: number | undefined;
      if (typeof v === 'number' && Number.isInteger(v)) {
        verNum = v;
      } else if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
        verNum = parseInt(v.trim(), 10);
      }
      if (verNum !== undefined && (verNum === 1 || verNum === 2 || verNum === 3)) {
        result[targetKey] = verNum;
      } else {
        invalidParams.push({
          key: `plugin-opts.${targetKey}`,
          value: String(v),
          reason: `shadow-tls 插件 version 必须为 1, 2 或 3 (当前为: "${v}")`
        });
      }
      continue;
    }

    // 4. shadow-tls & restls password 保持纯字符串格式
    if ((plugin === 'shadow-tls' || plugin === 'restls') && targetKeyLower === 'password') {
      const passStr = String(v).trim();
      if (passStr) {
        result[targetKey] = passStr;
      } else {
        invalidParams.push({
          key: `plugin-opts.${targetKey}`,
          value: String(v),
          reason: `插件 [${plugin}] password 不能为空`
        });
      }
      continue;
    }

    // 5. 布尔字段严格校验
    if (booleanKeys.has(targetKeyLower)) {
      if (v === true || v === false) {
        result[targetKey] = v;
      } else if (typeof v === 'string') {
        const valTrimmed = v.trim();
        const valLower = valTrimmed.toLowerCase();
        if (valLower === 'true' || valLower === '1' || valTrimmed === '') {
          result[targetKey] = true;
        } else if (valLower === 'false' || valLower === '0') {
          result[targetKey] = false;
        } else {
          invalidParams.push({
            key: `plugin-opts.${targetKey}`,
            value: v,
            reason: `插件参数 [${targetKey}] 期望布尔值 (true/false/1/0)，但实际值为 "${v}"`
          });
        }
      } else {
        result[targetKey] = Boolean(v);
      }
      continue;
    }

    // 6. 整数字段严格校验
    if (numberKeys.has(targetKeyLower)) {
      if (typeof v === 'number' && Number.isInteger(v)) {
        result[targetKey] = v;
      } else if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
        result[targetKey] = parseInt(v.trim(), 10);
      } else {
        invalidParams.push({
          key: `plugin-opts.${targetKey}`,
          value: String(v),
          reason: `插件参数 [${targetKey}] 期望整数，但实际值为 "${v}"`
        });
      }
      continue;
    }

    // 7. 通用字符串
    if (typeof v === 'string') {
      result[targetKey] = v.trim();
    } else {
      result[targetKey] = v;
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
    const { opts: formattedOpts, invalidParams: pluginInv } = formatMihomoPluginOpts(normalizedPlugin, p.pluginOpts || {});

    // P0-3: 检查是否有连接关键参数非法，若有则升级为 Fatal
    const criticalSet = PLUGIN_CRITICAL_FIELDS[normalizedPlugin] || new Set();
    const fatalPluginInv = pluginInv.filter(inv => {
      const rawField = inv.key.replace(/^plugin-opts\./, '').toLowerCase();
      return criticalSet.has(rawField);
    });

    if (fatalPluginInv.length > 0) {
      const firstFatal = fatalPluginInv[0]!;
      return {
        fatal: true,
        lossy: true,
        emitted: false,
        skipReason: `节点 [${node.name}] 的 Shadowsocks 插件 [${normalizedPlugin}] 关键参数 [${firstFatal.key}] 非法: ${firstFatal.reason}`,
        warnings: [{ level: 'fatal', field: firstFatal.key, message: firstFatal.reason }],
        unsupportedParams: [firstFatal.key]
      };
    }

    // 检查 shadow-tls 等插件必需的关键凭据
    if (normalizedPlugin === 'shadow-tls') {
      if (!formattedOpts.password || !String(formattedOpts.password).trim()) {
        return {
          fatal: true,
          lossy: true,
          emitted: false,
          skipReason: `节点 [${node.name}] 的 Shadowsocks 插件 [shadow-tls] 缺少必需的关键参数 [password]`,
          warnings: [{ level: 'fatal', field: 'plugin-opts.password', message: 'shadow-tls 缺少必需的 password' }],
          unsupportedParams: ['plugin-opts.password']
        };
      }
      if (!formattedOpts.host || !String(formattedOpts.host).trim()) {
        return {
          fatal: true,
          lossy: true,
          emitted: false,
          skipReason: `节点 [${node.name}] 的 Shadowsocks 插件 [shadow-tls] 缺少必需的关键参数 [host]`,
          warnings: [{ level: 'fatal', field: 'plugin-opts.host', message: 'shadow-tls 缺少必需的 host (SNI)' }],
          unsupportedParams: ['plugin-opts.host']
        };
      }
    }

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
