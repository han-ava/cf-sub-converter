// src/templates.ts

/**
 * 默认内置的 Clash Meta / Mihomo 模板框架
 */
export const DEFAULT_CLASH_TEMPLATE = {
  port: 7890,
  'socks-port': 7891,
  'allow-lan': false,
  mode: 'rule',
  'log-level': 'info',
  ipv6: false,
  'find-process-mode': 'strict',
  'external-controller': '127.0.0.1:9090',
  dns: {
    enable: true,
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'default-nameserver': ['223.5.5.5', '119.29.29.29', '1.1.1.1'],
    nameserver: [
      '223.5.5.5',
      '119.29.29.29',
      'https://doh.pub/dns-query',
      'https://dns.alidns.com/dns-query'
    ],
    fallback: [
      'https://doh.dns.sb/dns-query',
      'https://dns.cloudflare.com/dns-query',
      'https://dns.google/dns-query'
    ],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      ipcidr: ['240.0.0.0/4', '0.0.0.0/32']
    }
  },
  rules: [
    'RULE-SET,applications,🎯 全球直连',
    'RULE-SET,private,🎯 全球直连',
    'RULE-SET,reject,🛑 全球拦截',
    'RULE-SET,icloud,🎯 全球直连',
    'RULE-SET,apple,🎯 全球直连',
    'RULE-SET,google,🚀 节点选择',
    'RULE-SET,proxy,🚀 节点选择',
    'RULE-SET,direct,🎯 全球直连',
    'RULE-SET,lancidr,🎯 全球直连,no-resolve',
    'RULE-SET,cncidr,🎯 全球直连,no-resolve',
    'RULE-SET,telegramcidr,🚀 节点选择,no-resolve',
    'GEOIP,LAN,🎯 全球直连,no-resolve',
    'GEOIP,CN,🎯 全球直连',
    'MATCH,🐟 漏网之鱼'
  ],
  'rule-providers': {
    reject: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt',
      path: './ruleset/reject.yaml',
      interval: 86400
    },
    icloud: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/icloud.txt',
      path: './ruleset/icloud.yaml',
      interval: 86400
    },
    apple: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/apple.txt',
      path: './ruleset/apple.yaml',
      interval: 86400
    },
    google: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/google.txt',
      path: './ruleset/google.yaml',
      interval: 86400
    },
    proxy: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt',
      path: './ruleset/proxy.yaml',
      interval: 86400
    },
    direct: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt',
      path: './ruleset/direct.yaml',
      interval: 86400
    },
    private: {
      type: 'http',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/private.txt',
      path: './ruleset/private.yaml',
      interval: 86400
    },
    applications: {
      type: 'http',
      behavior: 'classical',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/applications.txt',
      path: './ruleset/applications.yaml',
      interval: 86400
    },
    lancidr: {
      type: 'http',
      behavior: 'ipcidr',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/lancidr.txt',
      path: './ruleset/lancidr.yaml',
      interval: 86400
    },
    cncidr: {
      type: 'http',
      behavior: 'ipcidr',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt',
      path: './ruleset/cncidr.yaml',
      interval: 86400
    },
    telegramcidr: {
      type: 'http',
      behavior: 'ipcidr',
      url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt',
      path: './ruleset/telegramcidr.yaml',
      interval: 86400
    }
  }
};

/**
 * 默认内置的 Sing-Box 模板
 */
export const DEFAULT_SINGBOX_TEMPLATE = {
  log: {
    level: 'info',
    timestamp: true
  },
  dns: {
    servers: [
      {
        tag: 'dns-remote',
        address: 'https://1.1.1.1/dns-query',
        address_resolver: 'dns-local',
        strategy: 'prefer_ipv4'
      },
      {
        tag: 'dns-local',
        address: '223.5.5.5',
        detour: 'direct',
        strategy: 'prefer_ipv4'
      },
      {
        tag: 'dns-block',
        address: 'rcode://success'
      }
    ],
    rules: [
      {
        outbound: 'any',
        server: 'dns-local'
      },
      {
        geosite: ['category-ads-all'],
        server: 'dns-block'
      },
      {
        geosite: ['cn'],
        server: 'dns-local'
      }
    ]
  },
  inbounds: [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: 2080,
      sniff: true
    }
  ],
  route: {
    rules: [
      {
        protocol: 'dns',
        outbound: 'dns-out'
      },
      {
        geosite: ['category-ads-all'],
        outbound: 'block'
      },
      {
        geosite: ['cn', 'private'],
        outbound: 'direct'
      },
      {
        geoip: ['cn', 'private'],
        outbound: 'direct'
      }
    ],
    auto_detect_interface: true
  }
};
