// src/generator.ts
import yaml from 'js-yaml';
import { NodeEnvelope } from './types';
import { DEFAULT_CLASH_TEMPLATE, DEFAULT_SINGBOX_TEMPLATE } from './templates';
import { getRegionByNodeName, REGIONS } from './utils';
import { nodeToClashProxy, adaptNodeToMihomo } from './adapters/mihomo';
import { adaptNodesToSingBox, nodeToSingBoxOutbound } from './adapters/singbox';
import { adaptNodeToTarget } from './adapters/target';

export { nodeToClashProxy, nodeToSingBoxOutbound };

/**
 * 转换为 Clash Meta / Mihomo 配置文件 (YAML)
 */
export function toClashMeta(
  nodes: NodeEnvelope[],
  customTemplateYaml?: string,
  preset: string = 'standard',
  testUrl: string = 'https://cp.cloudflare.com/generate_204'
): string {
  let config: any = null;
  let usesDefaultTemplate = false;

  if (customTemplateYaml && customTemplateYaml.trim()) {
    try {
      config = yaml.load(customTemplateYaml);
    } catch {}
  }

  if (!config || typeof config !== 'object') {
    config = JSON.parse(JSON.stringify(DEFAULT_CLASH_TEMPLATE));
    usesDefaultTemplate = true;
  }

  const proxies: Record<string, any>[] = [];
  const droppedNodeSamples: Array<{ name: string; protocol: string; reason: string }> = [];
  let droppedNodeCount = 0;
  for (const node of nodes) {
    const res = adaptNodeToMihomo(node);
    if (res.emitted && res.config) {
      proxies.push(res.config);
    } else {
      droppedNodeCount++;
      if (droppedNodeSamples.length < 3) {
        droppedNodeSamples.push({
          name: node.name,
          protocol: node.protocol,
          reason: res.skipReason || 'Adapter fatal or not emitted'
        });
      }
    }
  }
  if (droppedNodeCount > 0) {
    console.warn('[CLASH_NODES_DROPPED]', { count: droppedNodeCount, samples: droppedNodeSamples });
  }

  const proxyNames = proxies.map(p => p.name);

  const isMinimal = preset === 'minimal';

  // 地区节点分组 (非极简模式下自动按国家/地区生成 url-test 自动测速组)
  const regionNodeMap: Record<string, string[]> = {};
  const regionalGroups: any[] = [];
  const regionalGroupNames: string[] = [];

  if (!isMinimal) {
    for (const proxy of proxies) {
      const region = getRegionByNodeName(proxy.name);
      if (region) {
        if (!regionNodeMap[region.code]) regionNodeMap[region.code] = [];
        regionNodeMap[region.code]!.push(proxy.name);
      }
    }

    for (const region of REGIONS) {
      const matchedNodes = regionNodeMap[region.code];
      if (matchedNodes && matchedNodes.length > 0) {
        const groupName = `${region.flag} ${region.name}节点`;
        regionalGroupNames.push(groupName);
        regionalGroups.push({
          name: groupName,
          type: 'url-test',
          url: testUrl,
          interval: 300,
          tolerance: 50,
          proxies: matchedNodes
        });
      }
    }
  }

  // 额外策略组与规则注入
  const extraGroups: any[] = [];
  const extraRules: string[] = [];

  if (preset === 'ai') {
    extraGroups.push({
      name: '🤖 智算 AI',
      type: 'select',
      proxies: ['🚀 节点选择', '⚡ 自动选择', ...regionalGroupNames, ...(proxyNames.length > 0 ? proxyNames : ['DIRECT'])]
    });
    extraRules.push(
      'DOMAIN-SUFFIX,openai.com,🤖 智算 AI',
      'DOMAIN-SUFFIX,oaistatic.com,🤖 智算 AI',
      'DOMAIN-SUFFIX,oaiusercontent.com,🤖 智算 AI',
      'DOMAIN-SUFFIX,chatgpt.com,🤖 智算 AI',
      'DOMAIN-SUFFIX,anthropic.com,🤖 智算 AI',
      'DOMAIN-SUFFIX,claude.ai,🤖 智算 AI',
      'DOMAIN-SUFFIX,perplexity.ai,🤖 智算 AI',
      'DOMAIN-KEYWORD,copilot,🤖 智算 AI',
      'DOMAIN-SUFFIX,groq.com,🤖 智算 AI'
    );
  } else if (preset === 'media') {
    extraGroups.push({
      name: '🎬 国际流媒体',
      type: 'select',
      proxies: ['🚀 节点选择', '⚡ 自动选择', ...regionalGroupNames, ...(proxyNames.length > 0 ? proxyNames : ['DIRECT'])]
    });
    extraRules.push(
      'DOMAIN-SUFFIX,youtube.com,🎬 国际流媒体',
      'DOMAIN-SUFFIX,googlevideo.com,🎬 国际流媒体',
      'DOMAIN-SUFFIX,netflix.com,🎬 国际流媒体',
      'DOMAIN-SUFFIX,nflxvideo.net,🎬 国际流媒体',
      'DOMAIN-SUFFIX,disneyplus.com,🎬 国际流媒体',
      'DOMAIN-SUFFIX,spotify.com,🎬 国际流媒体',
      'DOMAIN-SUFFIX,tiktok.com,🎬 国际流媒体'
    );
  }

  // 构建默认 Proxy Groups (严格保持有向无环图 DAG，避免 Clash 报 loop is detected 错误)
  const defaultGroups = [
    {
      name: '🚀 节点选择',
      type: 'select',
      proxies: [
        '⚡ 自动选择',
        'DIRECT',
        ...regionalGroupNames,
        ...(proxyNames.length > 0 ? proxyNames : [])
      ]
    },
    {
      name: '⚡ 自动选择',
      type: 'url-test',
      url: testUrl,
      interval: 300,
      tolerance: 50,
      proxies: proxyNames.length > 0 ? proxyNames : ['DIRECT']
    },
    ...regionalGroups,
    ...extraGroups,
    {
      name: '🎯 全球直连',
      type: 'select',
      proxies: ['DIRECT']
    },
    {
      name: '🛑 全球拦截',
      type: 'select',
      proxies: ['REJECT', 'DIRECT']
    },
    {
      name: '🐟 漏网之鱼',
      type: 'select',
      proxies: ['🚀 节点选择', '⚡ 自动选择', 'DIRECT']
    }
  ];

  config.proxies = proxies;
  if (!config['proxy-groups'] || !Array.isArray(config['proxy-groups']) || config['proxy-groups'].length === 0) {
    config['proxy-groups'] = defaultGroups;
  }

  if (isMinimal) {
    // 极简模式：不使用 rule-provider，内联本地/LAN 与国内直连规则
    config.rules = [
      'DOMAIN,localhost,🎯 全球直连',
      'DOMAIN-SUFFIX,localhost,🎯 全球直连',
      'DOMAIN-SUFFIX,local,🎯 全球直连',
      'DOMAIN-SUFFIX,lan,🎯 全球直连',
      'DOMAIN-SUFFIX,localdomain,🎯 全球直连',
      'DOMAIN-SUFFIX,internal,🎯 全球直连',
      'DOMAIN-SUFFIX,home.arpa,🎯 全球直连',
      'IP-CIDR,0.0.0.0/8,🎯 全球直连,no-resolve',
      'IP-CIDR,10.0.0.0/8,🎯 全球直连,no-resolve',
      'IP-CIDR,100.64.0.0/10,🎯 全球直连,no-resolve',
      'IP-CIDR,127.0.0.0/8,🎯 全球直连,no-resolve',
      'IP-CIDR,169.254.0.0/16,🎯 全球直连,no-resolve',
      'IP-CIDR,172.16.0.0/12,🎯 全球直连,no-resolve',
      'IP-CIDR,192.168.0.0/16,🎯 全球直连,no-resolve',
      'IP-CIDR,198.18.0.0/15,🎯 全球直连,no-resolve',
      'IP-CIDR,224.0.0.0/3,🎯 全球直连,no-resolve',
      'IP-CIDR6,::1/128,🎯 全球直连,no-resolve',
      'IP-CIDR6,fc00::/7,🎯 全球直连,no-resolve',
      'IP-CIDR6,fe80::/10,🎯 全球直连,no-resolve',
      'IP-CIDR6,ff00::/8,🎯 全球直连,no-resolve',
      'GEOIP,LAN,🎯 全球直连,no-resolve',
      'DOMAIN-SUFFIX,cn,🎯 全球直连',
      'GEOSITE,CN,🎯 全球直连',
      'GEOIP,CN,🎯 全球直连',
      'MATCH,🚀 节点选择'
    ];
    delete config['rule-providers'];
  } else if (extraRules.length > 0 && Array.isArray(config.rules)) {
    const rejectRuleIndex = usesDefaultTemplate
      ? config.rules.findIndex((rule: unknown) =>
          typeof rule === 'string' && rule.startsWith('RULE-SET,reject,')
        )
      : -1;
    const insertionIndex = usesDefaultTemplate && rejectRuleIndex >= 0 ? rejectRuleIndex + 1 : 0;
    config.rules = [
      ...config.rules.slice(0, insertionIndex),
      ...extraRules,
      ...config.rules.slice(insertionIndex)
    ];
  }

  return yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true });
}

/**
 * 转换为 Sing-Box 配置文件 (JSON)
 */
export function toSingBox(
  nodes: NodeEnvelope[],
  customTemplateJson?: string,
  options: { includeTun?: boolean } = {}
): string {
  let config: any = null;
  let usesDefaultTemplate = false;

  if (customTemplateJson && customTemplateJson.trim()) {
    try {
      config = JSON.parse(customTemplateJson);
    } catch {}
  }

  if (!config || typeof config !== 'object') {
    config = JSON.parse(JSON.stringify(DEFAULT_SINGBOX_TEMPLATE));
    usesDefaultTemplate = true;
  }

  if (usesDefaultTemplate && options.includeTun) {
    config.inbounds.unshift({
      type: 'tun',
      tag: 'tun-in',
      address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
      auto_route: true,
      stack: 'system'
    });
  }

  const allowedDomainResolvers = new Set<string>(
    Array.isArray(config.dns?.servers)
      ? config.dns.servers
          .map((server: unknown) => (
            server && typeof server === 'object'
              ? (server as Record<string, unknown>).tag
              : undefined
          ))
          .filter((tag: unknown): tag is string => typeof tag === 'string' && tag.length > 0)
      : []
  );
  const adaptationResults = adaptNodesToSingBox(nodes, { allowedDomainResolvers });
  const emittedNodes = nodes.filter((_, index) => adaptationResults[index]?.emitted);
  const usedTags = new Set(['🚀 节点选择', '⚡ 自动选择', 'direct']);
  const outboundTagMap = new Map<string, string>();
  const nativeScopedTag = (node: NodeEnvelope, tag: string): string => (
    `${node.source.configId || `legacy:${node.source.raw}`}\u0000${tag}`
  );
  const taggedNodes = emittedNodes.map(node => {
    const baseTag = node.name.trim() || 'Node';
    let tag = baseTag;
    let suffix = 2;
    while (usedTags.has(tag)) {
      tag = `${baseTag} ${String(suffix).padStart(2, '0')}`;
      suffix++;
    }
    usedTags.add(tag);

    if (node.source.format === 'singbox') {
      const nativeData = node.protocolData as Record<string, any>;
      if (typeof nativeData.tag === 'string' && nativeData.tag.length > 0) {
        const scopedTag = nativeScopedTag(node, nativeData.tag);
        if (!outboundTagMap.has(scopedTag)) outboundTagMap.set(scopedTag, tag);
      }
    }
    return { node, tag };
  });

  const outbounds = taggedNodes.map(({ node, tag }) => {
    const protocolData: Record<string, any> = node.source.format === 'singbox'
      ? { ...(node.protocolData as Record<string, any>) }
      : node.protocolData as Record<string, any>;
    if (node.source.format === 'singbox' && typeof protocolData.detour === 'string') {
      protocolData.detour = outboundTagMap.get(nativeScopedTag(node, protocolData.detour))
        || protocolData.detour;
    }
    return nodeToSingBoxOutbound({ ...node, name: tag, protocolData } as NodeEnvelope);
  });
  const nodeTags = taggedNodes.map(({ tag }) => tag);

  const defaultOutbounds = [
    {
      tag: '🚀 节点选择',
      type: 'selector',
      outbounds: ['⚡ 自动选择', 'direct', ...(nodeTags.length > 0 ? nodeTags : [])]
    },
    {
      tag: '⚡ 自动选择',
      type: 'urltest',
      outbounds: nodeTags.length > 0 ? nodeTags : ['direct'],
      url: 'https://cp.cloudflare.com/generate_204',
      interval: '3m',
      tolerance: 50
    },
    {
      tag: 'direct',
      type: 'direct'
    },
    ...outbounds
  ];

  config.outbounds = defaultOutbounds;

  return JSON.stringify(config, null, 2);
}

/**
 * 转换为 Surge 代理配置
 */
export function toSurge(nodes: NodeEnvelope[]): string {
  const lines: string[] = ['[Proxy]'];

  for (const node of nodes) {
    if (!adaptNodeToTarget(node, 'surge').emitted) continue;
    const proto = (node.protocol || '').toLowerCase();
    const p: any = node.protocolData || {};
    if (proto === 'ss' || proto === 'shadowsocks') {
      lines.push(`${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${p.cipher || 'chacha20-ietf-poly1305'}, password=${p.password || ''}, udp-relay=true`);
    } else if (proto === 'trojan') {
      lines.push(`${node.name} = trojan, ${node.server}, ${node.port}, password=${p.password || ''}, sni=${p.sni || node.server}, skip-cert-verify=${p.skipCertVerify ? 'true' : 'false'}`);
    } else if (proto === 'vmess') {
      const isWs = (p.network || p.net) === 'ws';
      lines.push(`${node.name} = vmess, ${node.server}, ${node.port}, username=${p.uuid || p.id}, ws=${isWs}, ws-path=${p.wsPath || p.path || '/'}, tls=${p.tls ? 'true' : 'false'}, sni=${p.sni || node.server}`);
    }
  }

  return lines.join('\n');
}

/**
 * 转换为可直接导入 Surge 的完整配置文件。
 * 保留 toSurge() 作为仅含 [Proxy] 的可引用片段，避免破坏现有订阅。
 */
export function toSurgeConf(nodes: NodeEnvelope[]): string {
  const emittedNodes = nodes.filter(node => adaptNodeToTarget(node, 'surge-conf').emitted);
  const proxySection = toSurge(nodes);
  const groupNodes = [...new Set([...emittedNodes.map(node => node.name), 'DIRECT'])].join(', ');

  return [
    '[General]',
    'loglevel = notify',
    'dns-server = system, 223.5.5.5, 119.29.29.29',
    '',
    proxySection,
    '',
    '[Proxy Group]',
    `🚀 节点选择 = select, ${groupNodes}`,
    '',
    '[Rule]',
    'DOMAIN,localhost,DIRECT',
    'DOMAIN-SUFFIX,localhost,DIRECT',
    'DOMAIN-SUFFIX,local,DIRECT',
    'DOMAIN-SUFFIX,lan,DIRECT',
    'DOMAIN-SUFFIX,localdomain,DIRECT',
    'DOMAIN-SUFFIX,internal,DIRECT',
    'DOMAIN-SUFFIX,home.arpa,DIRECT',
    'IP-CIDR,0.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,100.64.0.0/10,DIRECT,no-resolve',
    'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,169.254.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,198.18.0.0/15,DIRECT,no-resolve',
    'IP-CIDR,224.0.0.0/3,DIRECT,no-resolve',
    'IP-CIDR6,::1/128,DIRECT,no-resolve',
    'IP-CIDR6,fc00::/7,DIRECT,no-resolve',
    'IP-CIDR6,fe80::/10,DIRECT,no-resolve',
    'IP-CIDR6,ff00::/8,DIRECT,no-resolve',
    'RULE-SET,SYSTEM,DIRECT',
    'RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/AdvertisingLite/AdvertisingLite.list,REJECT,update-interval=86400',
    'DOMAIN-SUFFIX,cn,DIRECT',
    'DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/China/China_Domain.list,DIRECT,update-interval=86400',
    'RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/China/China.list,DIRECT,update-interval=86400',
    'GEOIP,CN,DIRECT',
    'FINAL,🚀 节点选择,dns-failed'
  ].join('\n');
}

function clientLineName(name: string): string {
  return String(name || 'Proxy')
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, '，')
    .replace(/=/g, '-')
    .trim() || 'Proxy';
}

function clientEndpoint(node: NodeEnvelope): string {
  const host = node.server.includes(':') && !node.server.startsWith('[')
    ? `[${node.server}]`
    : node.server;
  return `${host}:${node.port}`;
}

function cleanClientValue(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function quantumultValue(value: unknown): string {
  const cleaned = cleanClientValue(value);
  return /[,\"]/.test(cleaned)
    ? `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : cleaned;
}

function loonValue(value: unknown): string {
  return `"${cleanClientValue(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function nativeTransport(node: NodeEnvelope): { type: string; path: string; host: string } {
  const p: any = node.protocolData || {};
  const type = String(p.transport?.type || p.network || p.net || 'tcp').toLowerCase();
  const path = cleanClientValue(
    p.transport?.path
    || p.path
    || p['ws-opts']?.path
    || (type === 'ws' || type === 'http' ? '/' : '')
  );
  const host = cleanClientValue(
    p.transport?.headers?.Host
    || p.transport?.headers?.host
    || p.host
    || p['ws-opts']?.headers?.Host
    || ''
  );
  return { type, path, host };
}

function nativeTls(node: NodeEnvelope): boolean {
  const protocol = (node.protocol || '').toLowerCase();
  const p: any = node.protocolData || {};
  if (protocol === 'trojan' || protocol === 'hysteria2' || protocol === 'hy2') return true;
  if (protocol === 'vless') return p.security === 'tls' || p.security === 'reality' || !!p.realityOpts;
  if (p.tls?.enabled !== undefined) return !!p.tls.enabled;
  return p.tls === true || p.tls === 'tls' || p.tls === 'true' || p.tls === 1;
}

function simpleObfsOptions(protocolData: any): { name: string; host: string; uri: string } | null {
  if (!protocolData.plugin) return null;
  const options = protocolData.pluginOpts || {};
  return {
    name: cleanClientValue(options.obfs || options.mode || ''),
    host: cleanClientValue(options['obfs-host'] || options.host || ''),
    uri: cleanClientValue(options['obfs-uri'] || options.path || '')
  };
}

/**
 * Quantumult X server_remote 节点片段，不包含完整配置段。
 */
export function toQuantumultX(nodes: NodeEnvelope[]): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (!adaptNodeToTarget(node, 'quantumult-x').emitted) continue;
    const protocol = (node.protocol || '').toLowerCase();
    const p: any = node.protocolData || {};
    const endpoint = clientEndpoint(node);
    const name = clientLineName(node.name);
    const udp = node.udp === false ? 'false' : 'true';

    if (protocol === 'ss' || protocol === 'shadowsocks') {
      const parts = [
        `shadowsocks=${endpoint}`,
        `method=${quantumultValue(p.cipher || p.method)}`,
        `password=${quantumultValue(p.password)}`
      ];
      const obfs = simpleObfsOptions(p);
      if (obfs?.name) parts.push(`obfs=${quantumultValue(obfs.name)}`);
      if (obfs?.host) parts.push(`obfs-host=${quantumultValue(obfs.host)}`);
      if (obfs?.uri) parts.push(`obfs-uri=${quantumultValue(obfs.uri)}`);
      parts.push('fast-open=false', `udp-relay=${udp}`, `tag=${quantumultValue(name)}`);
      lines.push(parts.join(', '));
      continue;
    }

    const transport = nativeTransport(node);
    const tls = nativeTls(node);
    const sni = cleanClientValue(p.sni || p.servername || p['server-name'] || node.server);
    const tlsVerification = p.skipCertVerify || p.insecure ? 'false' : 'true';
    const parts: string[] = [];

    if (protocol === 'vmess') {
      const cipher = ['auto', 'zero'].includes(String(p.cipher || p.security || '').toLowerCase())
        ? 'none'
        : (p.cipher || p.security || 'none');
      parts.push(
        `vmess=${endpoint}`,
        `method=${quantumultValue(cipher)}`,
        `password=${quantumultValue(p.uuid || p.id)}`
      );
    } else if (protocol === 'vless') {
      parts.push(
        `vless=${endpoint}`,
        'method=none',
        `password=${quantumultValue(p.uuid || p.id)}`
      );
    } else if (protocol === 'trojan') {
      parts.push(`trojan=${endpoint}`, `password=${quantumultValue(p.password)}`);
    }

    if (transport.type === 'ws') {
      parts.push(`obfs=${tls ? 'wss' : 'ws'}`);
      const wsHost = transport.host || (tls ? sni : '');
      if (wsHost) parts.push(`obfs-host=${quantumultValue(wsHost)}`);
      if (transport.path) parts.push(`obfs-uri=${quantumultValue(transport.path)}`);
      if (tls) parts.push(`tls-verification=${tlsVerification}`);
    } else if (transport.type === 'http') {
      parts.push('obfs=http');
      if (transport.host) parts.push(`obfs-host=${quantumultValue(transport.host)}`);
      if (transport.path) parts.push(`obfs-uri=${quantumultValue(transport.path)}`);
    } else if (tls) {
      if (protocol === 'trojan') {
        parts.push('over-tls=true', `tls-host=${quantumultValue(sni)}`);
      } else {
        parts.push('obfs=over-tls', `obfs-host=${quantumultValue(sni)}`);
      }
      parts.push(`tls-verification=${tlsVerification}`);
    }

    if (p.realityOpts) {
      parts.push(`reality-base64-pubkey=${quantumultValue(p.realityOpts.publicKey)}`);
      if (p.realityOpts.shortId) {
        parts.push(`reality-hex-shortid=${quantumultValue(p.realityOpts.shortId)}`);
      }
    }
    if (protocol === 'vless' && p.flow) parts.push(`vless-flow=${quantumultValue(p.flow)}`);
    parts.push('fast-open=false', `udp-relay=${udp}`, `tag=${quantumultValue(name)}`);
    lines.push(parts.join(', '));
  }

  return lines.join('\n');
}

/**
 * Loon nodelist 节点片段，不包含完整配置段。
 */
export function toLoon(nodes: NodeEnvelope[]): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (!adaptNodeToTarget(node, 'loon').emitted) continue;
    const protocol = (node.protocol || '').toLowerCase();
    const p: any = node.protocolData || {};
    const name = clientLineName(node.name);
    const server = cleanClientValue(node.server);
    const udp = node.udp === false ? 'false' : 'true';

    if (protocol === 'ss' || protocol === 'shadowsocks') {
      const parts = [
        `${name} = Shadowsocks`,
        server,
        String(node.port),
        cleanClientValue(p.cipher || p.method),
        loonValue(p.password)
      ];
      const obfs = simpleObfsOptions(p);
      if (obfs?.name) parts.push(`obfs-name=${cleanClientValue(obfs.name)}`);
      if (obfs?.host) parts.push(`obfs-host=${cleanClientValue(obfs.host)}`);
      if (obfs?.uri) parts.push(`obfs-uri=${cleanClientValue(obfs.uri)}`);
      parts.push('fast-open=false', `udp=${udp}`);
      lines.push(parts.join(','));
      continue;
    }

    if (protocol === 'ssr' || protocol === 'shadowsocksr') {
      const parts = [
        `${name} = ShadowsocksR`,
        server,
        String(node.port),
        cleanClientValue(p.cipher),
        loonValue(p.password),
        `protocol=${cleanClientValue(p.protocol || 'origin')}`
      ];
      if (p.protoParam) parts.push(`protocol-param=${cleanClientValue(p.protoParam)}`);
      parts.push(`obfs=${cleanClientValue(p.obfs || 'plain')}`);
      if (p.obfsParam) parts.push(`obfs-param=${cleanClientValue(p.obfsParam)}`);
      parts.push('fast-open=false', `udp=${udp}`);
      lines.push(parts.join(','));
      continue;
    }

    if (protocol === 'hysteria2' || protocol === 'hy2') {
      lines.push([
        `${name} = Hysteria2`,
        server,
        String(node.port),
        loonValue(p.password),
        `skip-cert-verify=${p.skipCertVerify || p.insecure ? 'true' : 'false'}`,
        `tls-name=${cleanClientValue(p.sni || node.server)}`,
        `udp=${udp}`,
        'fast-open=false'
      ].join(','));
      continue;
    }

    if (protocol === 'http' || protocol === 'https') {
      const tls = protocol === 'https' || nativeTls(node);
      const parts = [`${name} = ${tls ? 'https' : 'http'}`, server, String(node.port)];
      if (p.username || p.password) parts.push(cleanClientValue(p.username), loonValue(p.password));
      if (tls) {
        parts.push(
          `skip-cert-verify=${p.skipCertVerify || p.insecure ? 'true' : 'false'}`,
          `tls-name=${cleanClientValue(p.sni || node.server)}`
        );
      }
      lines.push(parts.join(','));
      continue;
    }

    const transport = nativeTransport(node);
    const tls = nativeTls(node);
    const sni = cleanClientValue(p.sni || p.servername || p['server-name'] || node.server);
    const host = transport.host;
    const parts: string[] = [];

    if (protocol === 'vmess') {
      parts.push(
        `${name} = vmess`,
        server,
        String(node.port),
        cleanClientValue(p.cipher || p.security || 'auto'),
        loonValue(p.uuid || p.id),
        `transport=${transport.type}`,
        `alterId=${Number(p.alterId ?? p.aid ?? 0)}`
      );
    } else if (protocol === 'vless') {
      parts.push(
        `${name} = VLESS`,
        server,
        String(node.port),
        loonValue(p.uuid || p.id),
        `transport=${transport.type}`
      );
    } else if (protocol === 'trojan') {
      parts.push(
        `${name} = trojan`,
        server,
        String(node.port),
        loonValue(p.password)
      );
      if (transport.type !== 'tcp') parts.push(`transport=${transport.type}`);
    }

    if (transport.type !== 'tcp') {
      if (transport.path) parts.push(`path=${transport.path}`);
      if (host) parts.push(`host=${host}`);
    }
    if (protocol !== 'trojan') parts.push(`over-tls=${tls ? 'true' : 'false'}`);
    if (tls) {
      parts.push(
        `skip-cert-verify=${p.skipCertVerify || p.insecure ? 'true' : 'false'}`,
        `tls-name=${sni}`
      );
    }
    parts.push(`udp=${udp}`);
    lines.push(parts.join(','));
  }

  return lines.join('\n');
}

/**
 * 转换为 Shadowrocket 配置文件 (.conf)
 */
export function toShadowrocketConf(nodes: NodeEnvelope[]): string {
  const emittedNodes = nodes.filter(n => adaptNodeToTarget(n, 'shadowrocket-conf').emitted);
  const lines: string[] = [
    '# Shadowrocket Configuration Profile',
    '# Generated by SubConverter Pro',
    '',
    '[General]',
    'bypass-system = true',
    'skip-proxy = 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, localhost, *.localhost, *.local, *.lan, *.home.arpa',
    'bypass-tun = 10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,192.0.2.0/24,192.88.99.0/24,192.168.0.0/16,198.18.0.0/15,198.51.100.0/24,203.0.113.0/24,224.0.0.0/4,255.255.255.255/32,::1/128,fc00::/7,fe80::/10',
    'dns-server = system, 223.5.5.5, 119.29.29.29',
    'ipv6 = false',
    'update-url = ',
    '',
    '[Proxy]'
  ];

  for (const node of emittedNodes) {
    const proto = (node.protocol || '').toLowerCase();
    const p: any = node.protocolData || {};
    if (proto === 'ss' || proto === 'shadowsocks') {
      lines.push(`${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${p.cipher || 'chacha20-ietf-poly1305'}, password=${p.password || ''}`);
    } else if (proto === 'trojan') {
      lines.push(`${node.name} = trojan, ${node.server}, ${node.port}, password=${p.password || ''}, over-tls=true, tls-name=${p.sni || node.server}`);
    } else if (proto === 'vmess') {
      const isWs = (p.network || p.net) === 'ws';
      const wsParam = isWs ? `, obfs=websocket, obfs-uri=${p.wsPath || p.path || '/'}` : '';
      const tlsParam = p.tls ? `, tls=true, tls-name=${p.sni || node.server}` : '';
      lines.push(`${node.name} = vmess, ${node.server}, ${node.port}, method=${p.cipher || p.scy || 'auto'}, password=${p.uuid || p.id}${wsParam}${tlsParam}`);
    } else if (proto === 'vless') {
      lines.push(`${node.name} = vless, ${node.server}, ${node.port}, password=${p.uuid || p.id}, over-tls=${p.tls ? 'true' : 'false'}, tls-name=${p.sni || node.server}`);
    } else if (proto === 'hysteria2' || proto === 'hy2') {
      lines.push(`${node.name} = hysteria2, ${node.server}, ${node.port}, password=${p.password || ''}, over-tls=true, tls-name=${p.sni || node.server}`);
    } else if (proto === 'anytls') {
      lines.push(`${node.name} = anytls, ${node.server}, ${node.port}, password=${p.password || ''}, tls-name=${p.sni || node.server}`);
    } else if (proto === 'tuic') {
      lines.push(`${node.name} = tuic, ${node.server}, ${node.port}, password=${p.password || ''}, uuid=${p.uuid || ''}, tls-name=${p.sni || node.server}`);
    }
  }

  const groupNodes = [...new Set([...emittedNodes.map(n => n.name), 'DIRECT'])].join(', ');

  lines.push(
    '',
    '[Proxy Group]',
    `🚀 节点选择 = select, ${groupNodes}`,
    '',
    '[Rule]',
    'DOMAIN,localhost,DIRECT',
    'DOMAIN-SUFFIX,localhost,DIRECT',
    'DOMAIN-SUFFIX,local,DIRECT',
    'DOMAIN-SUFFIX,lan,DIRECT',
    'DOMAIN-SUFFIX,localdomain,DIRECT',
    'DOMAIN-SUFFIX,internal,DIRECT',
    'DOMAIN-SUFFIX,home.arpa,DIRECT',
    'IP-CIDR,0.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,100.64.0.0/10,DIRECT,no-resolve',
    'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,169.254.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,198.18.0.0/15,DIRECT,no-resolve',
    'IP-CIDR,224.0.0.0/3,DIRECT,no-resolve',
    'IP-CIDR,::/127,DIRECT,no-resolve',
    'IP-CIDR,fc00::/7,DIRECT,no-resolve',
    'IP-CIDR,fe80::/10,DIRECT,no-resolve',
    'IP-CIDR,ff00::/8,DIRECT,no-resolve',
    'DOMAIN-SUFFIX,cn,DIRECT',
    'DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China_Domain.list,DIRECT',
    'RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China.list,DIRECT',
    'DOMAIN-KEYWORD,google,🚀 节点选择',
    'DOMAIN-KEYWORD,github,🚀 节点选择',
    'DOMAIN-KEYWORD,telegram,🚀 节点选择',
    'DOMAIN-KEYWORD,twitter,🚀 节点选择',
    'GEOIP,CN,DIRECT',
    'FINAL,🚀 节点选择',
    '',
    '[Host]',
    'localhost = 127.0.0.1',
    '',
    '[URL Rewrite]',
    '',
    '[Header Rewrite]',
    '',
    '[MITM]'
  );

  return lines.join('\n');
}
