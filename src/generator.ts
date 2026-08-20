// src/generator.ts
import yaml from 'js-yaml';
import { NodeEnvelope } from './types';
import { DEFAULT_CLASH_TEMPLATE, DEFAULT_SINGBOX_TEMPLATE } from './templates';
import { getRegionByNodeName, REGIONS } from './utils';
import { nodeToClashProxy, adaptNodeToMihomo } from './adapters/mihomo';
import { nodeToSingBoxOutbound } from './adapters/singbox';

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

  if (customTemplateYaml && customTemplateYaml.trim()) {
    try {
      config = yaml.load(customTemplateYaml);
    } catch {}
  }

  if (!config || typeof config !== 'object') {
    config = JSON.parse(JSON.stringify(DEFAULT_CLASH_TEMPLATE));
  }

  const proxies: Record<string, any>[] = [];
  for (const node of nodes) {
    const res = adaptNodeToMihomo(node);
    if (res.emitted && res.config) {
      proxies.push(res.config);
    } else {
      console.warn('[DEBUG][CLASH_NODE_DROPPED]', {
        name: node.name,
        protocol: node.protocol,
        reason: res.skipReason || 'Adapter fatal or not emitted',
        warnings: res.warnings
      });
    }
  }

  const protocolStats = nodes.reduce((acc, node) => {
    const proto = node.protocol || 'unknown';
    acc[proto] = (acc[proto] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('[DEBUG][CLASH_SUMMARY]', {
    inputNodes: nodes.length,
    outputProxies: proxies.length,
    skipped: nodes.length - proxies.length,
    protocols: protocolStats
  });

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
        ...(proxyNames.length > 0 ? proxyNames : ['DIRECT'])
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
    // 极简模式：免下载庞大外部规则集，极速启动，仅保留核心国内直连与代理
    config.rules = [
      'GEOIP,LAN,🎯 全球直连,no-resolve',
      'GEOIP,CN,🎯 全球直连',
      'MATCH,🚀 节点选择'
    ];
    delete config['rule-providers'];
  } else if (extraRules.length > 0 && Array.isArray(config.rules)) {
    config.rules = [...extraRules, ...config.rules];
  }

  const yamlContent = yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true });
  console.log('[DEBUG][CLASH_OUTPUT]', { yamlLength: yamlContent.length });
  return yamlContent;
}

/**
 * 转换为 Sing-Box 配置文件 (JSON)
 */
export function toSingBox(nodes: NodeEnvelope[], customTemplateJson?: string): string {
  let config: any = null;

  if (customTemplateJson && customTemplateJson.trim()) {
    try {
      config = JSON.parse(customTemplateJson);
    } catch {}
  }

  if (!config || typeof config !== 'object') {
    config = JSON.parse(JSON.stringify(DEFAULT_SINGBOX_TEMPLATE));
  }

  const outbounds = nodes.map(n => nodeToSingBoxOutbound(n));
  const nodeTags = nodes.map(n => n.name);

  const defaultOutbounds = [
    {
      tag: '🚀 节点选择',
      type: 'selector',
      outbounds: ['⚡ 自动选择', 'direct', ...(nodeTags.length > 0 ? nodeTags : ['direct'])]
    },
    {
      tag: '⚡ 自动选择',
      type: 'urltest',
      outbounds: nodeTags.length > 0 ? nodeTags : ['direct'],
      url: 'http://cp.cloudflare.com/generate_204',
      interval: '3m',
      tolerance: 50
    },
    {
      tag: 'direct',
      type: 'direct'
    },
    {
      tag: 'block',
      type: 'block'
    },
    {
      tag: 'dns-out',
      type: 'dns'
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
 * 转换为 Shadowrocket 配置文件 (.conf)
 */
export function toShadowrocketConf(nodes: NodeEnvelope[]): string {
  const lines: string[] = [
    '# Shadowrocket Configuration Profile',
    '# Generated by SubConverter Pro',
    '',
    '[General]',
    'bypass-system = true',
    'skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 127.0.0.1, localhost, *.local',
    'bypass-tun = 10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,192.0.2.0/24,192.88.99.0/24,192.168.0.0/16,198.18.0.0/15,198.51.100.0/24,203.0.113.0/24,224.0.0.0/4,255.255.255.255/32',
    'dns-server = system, 223.5.5.5, 119.29.29.29',
    'ipv6 = false',
    'update-url = ',
    '',
    '[Proxy]'
  ];

  for (const node of nodes) {
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

  const groupNodes = nodes.length > 0 ? nodes.map(n => n.name).join(', ') : 'DIRECT';

  lines.push(
    '',
    '[Proxy Group]',
    `🚀 节点选择 = select, ${groupNodes}, DIRECT`,
    '',
    '[Rule]',
    'DOMAIN-SUFFIX,cn,DIRECT',
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
