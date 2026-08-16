// src/generator.ts
import yaml from 'js-yaml';
import { ProxyNode } from './types';
import { DEFAULT_CLASH_TEMPLATE, DEFAULT_SINGBOX_TEMPLATE } from './templates';
import { safeBase64Encode, getRegionByNodeName, REGIONS } from './utils';

/**
 * 转换 ProxyNode 为 Clash Meta / Mihomo 节点对象
 */
export function nodeToClashProxy(node: ProxyNode): Record<string, any> {
  if (node.clashObj) {
    return { ...node.clashObj, name: node.name };
  }

  const base: Record<string, any> = {
    name: node.name,
    type: node.type,
    server: node.server,
    port: node.port,
    udp: node.udp !== false
  };

  switch (node.type) {
    case 'ss':
    case 'shadowsocks': {
      return {
        ...base,
        type: 'ss',
        cipher: node.cipher || 'aes-128-gcm',
        password: node.password || ''
      };
    }
    case 'ssr':
    case 'shadowsocksr': {
      return {
        ...base,
        type: 'ssr',
        cipher: node.cipher || 'aes-128-cfb',
        password: node.password || '',
        protocol: node.protocol || 'origin',
        obfs: node.obfs || 'plain',
        'protocol-param': node.protoParam || '',
        'obfs-param': node.obfsParam || ''
      };
    }
    case 'vmess': {
      const vmess: Record<string, any> = {
        ...base,
        type: 'vmess',
        uuid: node.uuid,
        alterId: 0,
        cipher: node.cipher || 'auto',
        tls: !!node.tls,
        servername: node.sni || node.server,
        network: node.network || 'tcp'
      };
      if (node.fingerprint) vmess['client-fingerprint'] = node.fingerprint;
      if (node.alpn) vmess.alpn = node.alpn;
      if (node.network === 'ws') {
        vmess['ws-opts'] = {
          path: node.wsPath || '/',
          headers: node.wsHeaders || {}
        };
      } else if (node.network === 'grpc') {
        vmess['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName || ''
        };
      }
      return vmess;
    }
    case 'vless': {
      const vless: Record<string, any> = {
        ...base,
        type: 'vless',
        uuid: node.uuid,
        tls: !!node.tls,
        servername: node.sni || node.server,
        network: node.network || 'tcp'
      };
      if (node.flow) vless.flow = node.flow;
      if (node.fingerprint) vless['client-fingerprint'] = node.fingerprint;
      if (node.alpn) vless.alpn = node.alpn;
      if (node.reality) {
        vless['reality-opts'] = {
          'public-key': node.reality.publicKey,
          'short-id': node.reality.shortId || '',
          'spider-x': node.reality.spiderX || ''
        };
      }
      if (node.network === 'ws') {
        vless['ws-opts'] = {
          path: node.wsPath || '/',
          headers: node.wsHeaders || {}
        };
      } else if (node.network === 'grpc') {
        vless['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName || ''
        };
      }
      return vless;
    }
    case 'trojan': {
      const trojan: Record<string, any> = {
        ...base,
        type: 'trojan',
        password: node.password,
        sni: node.sni || node.server,
        alpn: node.alpn || ['h2', 'http/1.1'],
        'skip-cert-verify': !!node.skipCertVerify,
        network: node.network || 'tcp'
      };
      if (node.fingerprint) trojan['client-fingerprint'] = node.fingerprint;
      if (node.network === 'ws') {
        trojan['ws-opts'] = {
          path: node.wsPath || '/',
          headers: node.wsHeaders || {}
        };
      } else if (node.network === 'grpc') {
        trojan['grpc-opts'] = {
          'grpc-service-name': node.grpcServiceName || ''
        };
      }
      return trojan;
    }
    case 'hysteria2':
    case 'hy2': {
      const hy2: Record<string, any> = {
        ...base,
        type: 'hysteria2',
        password: node.password,
        sni: node.sni || node.server,
        'skip-cert-verify': !!node.skipCertVerify
      };
      if (node.obfs) {
        hy2.obfs = node.obfs;
        if (node.obfsPassword) hy2['obfs-password'] = node.obfsPassword;
      }
      return hy2;
    }
    case 'tuic': {
      return {
        ...base,
        type: 'tuic',
        uuid: node.uuid,
        password: node.password,
        sni: node.sni || node.server,
        'congestion-controller': node.congestionControl || 'bbr',
        'udp-relay-mode': node.udpRelayMode || 'native',
        alpn: node.alpn || ['h3'],
        'skip-cert-verify': !!node.skipCertVerify
      };
    }
    default:
      return base;
  }
}

/**
 * 转换 ProxyNode 为 Sing-Box Outbound 对象
 */
export function nodeToSingBoxOutbound(node: ProxyNode): Record<string, any> {
  if (node.singboxObj) {
    return { ...node.singboxObj, tag: node.name };
  }

  const base: Record<string, any> = {
    tag: node.name,
    server: node.server,
    server_port: node.port
  };

  switch (node.type) {
    case 'ss':
    case 'shadowsocks': {
      return {
        ...base,
        type: 'shadowsocks',
        method: node.cipher || 'aes-128-gcm',
        password: node.password || ''
      };
    }
    case 'vmess': {
      const ob: Record<string, any> = {
        ...base,
        type: 'vmess',
        uuid: node.uuid,
        security: node.cipher || 'auto',
        alter_id: 0
      };
      if (node.tls) {
        ob.tls = {
          enabled: true,
          server_name: node.sni || node.server,
          alpn: node.alpn
        };
      }
      if (node.network === 'ws') {
        ob.transport = {
          type: 'ws',
          path: node.wsPath || '/',
          headers: node.wsHeaders || {}
        };
      } else if (node.network === 'grpc') {
        ob.transport = {
          type: 'grpc',
          service_name: node.grpcServiceName || ''
        };
      }
      return ob;
    }
    case 'vless': {
      const ob: Record<string, any> = {
        ...base,
        type: 'vless',
        uuid: node.uuid,
        flow: node.flow || undefined
      };
      if (node.tls) {
        ob.tls = {
          enabled: true,
          server_name: node.sni || node.server,
          alpn: node.alpn
        };
        if (node.fingerprint) {
          ob.tls.utls = { enabled: true, fingerprint: node.fingerprint };
        }
        if (node.reality) {
          ob.tls.reality = {
            enabled: true,
            public_key: node.reality.publicKey,
            short_id: node.reality.shortId || ''
          };
        }
      }
      if (node.network === 'ws') {
        ob.transport = {
          type: 'ws',
          path: node.wsPath || '/',
          headers: node.wsHeaders || {}
        };
      } else if (node.network === 'grpc') {
        ob.transport = {
          type: 'grpc',
          service_name: node.grpcServiceName || ''
        };
      }
      return ob;
    }
    case 'trojan': {
      const ob: Record<string, any> = {
        ...base,
        type: 'trojan',
        password: node.password,
        tls: {
          enabled: true,
          server_name: node.sni || node.server,
          alpn: node.alpn || ['h2', 'http/1.1'],
          insecure: !!node.skipCertVerify
        }
      };
      if (node.network === 'ws') {
        ob.transport = {
          type: 'ws',
          path: node.wsPath || '/',
          headers: node.wsHeaders || {}
        };
      } else if (node.network === 'grpc') {
        ob.transport = {
          type: 'grpc',
          service_name: node.grpcServiceName || ''
        };
      }
      return ob;
    }
    case 'hysteria2':
    case 'hy2': {
      const ob: Record<string, any> = {
        ...base,
        type: 'hysteria2',
        password: node.password,
        tls: {
          enabled: true,
          server_name: node.sni || node.server,
          insecure: !!node.skipCertVerify
        }
      };
      if (node.obfs) {
        ob.obfs = {
          type: node.obfs,
          password: node.obfsPassword || ''
        };
      }
      return ob;
    }
    case 'tuic': {
      return {
        ...base,
        type: 'tuic',
        uuid: node.uuid,
        password: node.password,
        congestion_control: node.congestionControl || 'bbr',
        udp_relay_mode: node.udpRelayMode || 'native',
        tls: {
          enabled: true,
          server_name: node.sni || node.server,
          alpn: node.alpn || ['h3'],
          insecure: !!node.skipCertVerify
        }
      };
    }
    default:
      return {
        ...base,
        type: node.type
      };
  }
}

/**
 * 转换为 Clash Meta / Mihomo 配置文件 (YAML)
 */
export function toClashMeta(
  nodes: ProxyNode[],
  customTemplateYaml?: string,
  preset: string = 'standard',
  testUrl: string = 'http://www.gstatic.com/generate_204'
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

  const proxies = nodes.map(n => nodeToClashProxy(n));
  const proxyNames = nodes.map(n => n.name);

  // 地区节点分组
  const regionNodeMap: Record<string, string[]> = {};

  for (const node of nodes) {
    const region = getRegionByNodeName(node.name);
    if (region) {
      if (!regionNodeMap[region.code]) regionNodeMap[region.code] = [];
      regionNodeMap[region.code]!.push(node.name);
    }
  }

  const regionalGroups: any[] = [];
  const regionalGroupNames: string[] = [];

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

  // 构建默认 Proxy Groups
  const defaultGroups = [
    {
      name: '🚀 节点选择',
      type: 'select',
      proxies: [
        '⚡ 自动选择',
        '🎯 全球直连',
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
      proxies: ['DIRECT', '🚀 节点选择']
    },
    {
      name: '🛑 全球拦截',
      type: 'select',
      proxies: ['REJECT', 'DIRECT']
    },
    {
      name: '🐟 漏网之鱼',
      type: 'select',
      proxies: ['🚀 节点选择', '🎯 全球直连', '⚡ 自动选择']
    }
  ];

  config.proxies = proxies;
  if (!config['proxy-groups'] || !Array.isArray(config['proxy-groups']) || config['proxy-groups'].length === 0) {
    config['proxy-groups'] = defaultGroups;
  }

  if (extraRules.length > 0 && Array.isArray(config.rules)) {
    config.rules = [...extraRules, ...config.rules];
  }

  return yaml.dump(config, { indent: 2, lineWidth: -1, noRefs: true });
}

/**
 * 转换为 Sing-Box 配置文件 (JSON)
 */
export function toSingBox(nodes: ProxyNode[], customTemplateJson?: string): string {
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
 * 转换为明文链接列表（一列一条节点）
 */
export function toRawLinks(nodes: ProxyNode[]): string {
  const links: string[] = [];

  for (const node of nodes) {
    try {
      if (node.type === 'vless') {
        const params = new URLSearchParams();
        params.set('security', node.reality ? 'reality' : (node.tls ? 'tls' : 'none'));
        params.set('type', node.network || 'tcp');
        if (node.flow) params.set('flow', node.flow);
        if (node.sni) params.set('sni', node.sni);
        if (node.fingerprint) params.set('fp', node.fingerprint);
        if (node.reality) {
          params.set('pbk', node.reality.publicKey);
          if (node.reality.shortId) params.set('sid', node.reality.shortId);
          if (node.reality.spiderX) params.set('spx', node.reality.spiderX);
        }
        if (node.network === 'ws') {
          if (node.wsPath) params.set('path', node.wsPath);
          if (node.wsHeaders?.Host) params.set('host', node.wsHeaders.Host);
        } else if (node.network === 'grpc' && node.grpcServiceName) {
          params.set('serviceName', node.grpcServiceName);
        }
        links.push(`vless://${node.uuid}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (node.type === 'hysteria2' || node.type === 'hy2') {
        const params = new URLSearchParams();
        if (node.sni) params.set('sni', node.sni);
        if (node.obfs) {
          params.set('obfs', node.obfs);
          if (node.obfsPassword) params.set('obfs-password', node.obfsPassword);
        }
        if (node.skipCertVerify) params.set('insecure', '1');
        links.push(`hysteria2://${node.password}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (node.type === 'vmess') {
        const vmessObj = {
          v: '2',
          ps: node.name,
          add: node.server,
          port: node.port,
          id: node.uuid,
          aid: 0,
          scy: node.cipher || 'auto',
          net: node.network || 'tcp',
          type: 'none',
          host: node.wsHeaders?.Host || '',
          path: node.wsPath || '',
          tls: node.tls ? 'tls' : '',
          sni: node.sni || '',
          fp: node.fingerprint || ''
        };
        links.push(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
      } else if (node.type === 'trojan') {
        const params = new URLSearchParams();
        if (node.sni) params.set('sni', node.sni);
        params.set('type', node.network || 'tcp');
        if (node.network === 'ws') {
          if (node.wsPath) params.set('path', node.wsPath);
          if (node.wsHeaders?.Host) params.set('host', node.wsHeaders.Host);
        }
        if (node.skipCertVerify) params.set('allowInsecure', '1');
        links.push(`trojan://${node.password}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (node.type === 'ss' || node.type === 'shadowsocks') {
        const userPass = safeBase64Encode(`${node.cipher}:${node.password}`);
        links.push(`ss://${userPass}@${node.server}:${node.port}#${encodeURIComponent(node.name)}`);
      } else if (node.type === 'tuic') {
        const params = new URLSearchParams();
        if (node.sni) params.set('sni', node.sni);
        if (node.congestionControl) params.set('congestion_control', node.congestionControl);
        if (node.udpRelayMode) params.set('udp_relay_mode', node.udpRelayMode);
        links.push(`tuic://${node.uuid}:${node.password}@${node.server}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (node.raw) {
        links.push(node.raw);
      }
    } catch {}
  }

  return links.join('\n');
}

/**
 * 转换为 Base64 订阅
 */
export function toBase64(nodes: ProxyNode[]): string {
  const rawLinks = toRawLinks(nodes);
  return safeBase64Encode(rawLinks);
}

/**
 * 转换为 Surge 代理配置
 */
export function toSurge(nodes: ProxyNode[]): string {
  const lines: string[] = ['[Proxy]'];

  for (const node of nodes) {
    if (node.type === 'ss' || node.type === 'shadowsocks') {
      lines.push(`${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${node.cipher}, password=${node.password}, udp-relay=true`);
    } else if (node.type === 'trojan') {
      lines.push(`${node.name} = trojan, ${node.server}, ${node.port}, password=${node.password}, sni=${node.sni || node.server}, skip-cert-verify=${node.skipCertVerify ? 'true' : 'false'}`);
    } else if (node.type === 'vmess') {
      lines.push(`${node.name} = vmess, ${node.server}, ${node.port}, username=${node.uuid}, ws=${node.network === 'ws'}, ws-path=${node.wsPath || '/'}, tls=${node.tls ? 'true' : 'false'}, sni=${node.sni || node.server}`);
    }
  }

  return lines.join('\n');
}

/**
 * 转换为 Shadowrocket 配置文件 (.conf)
 */
export function toShadowrocketConf(nodes: ProxyNode[]): string {
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

  // 将节点写入 [Proxy] 段
  for (const node of nodes) {
    if (node.type === 'ss' || node.type === 'shadowsocks') {
      lines.push(`${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${node.cipher}, password=${node.password}`);
    } else if (node.type === 'trojan') {
      lines.push(`${node.name} = trojan, ${node.server}, ${node.port}, password=${node.password}, over-tls=true, tls-name=${node.sni || node.server}`);
    } else if (node.type === 'vmess') {
      const wsParam = node.network === 'ws' ? `, obfs=websocket, obfs-uri=${node.wsPath || '/'}` : '';
      const tlsParam = node.tls ? `, tls=true, tls-name=${node.sni || node.server}` : '';
      lines.push(`${node.name} = vmess, ${node.server}, ${node.port}, method=${node.cipher || 'auto'}, password=${node.uuid}${wsParam}${tlsParam}`);
    } else if (node.type === 'vless') {
      // Shadowrocket 支持 VLESS 通过 URI 导入，.conf 中使用简化写法
      lines.push(`${node.name} = vless, ${node.server}, ${node.port}, password=${node.uuid}, over-tls=${node.tls ? 'true' : 'false'}, tls-name=${node.sni || node.server}`);
    } else if (node.type === 'hysteria2' || node.type === 'hy2') {
      lines.push(`${node.name} = hysteria2, ${node.server}, ${node.port}, password=${node.password}, over-tls=true, tls-name=${node.sni || node.server}`);
    } else if (node.type === 'tuic') {
      lines.push(`${node.name} = tuic, ${node.server}, ${node.port}, password=${node.password}, uuid=${node.uuid || ''}, tls-name=${node.sni || node.server}`);
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

