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
  ipv6: true,
  'find-process-mode': 'strict',
  'external-controller': '127.0.0.1:9090',
  dns: {
    enable: true,
    ipv6: true,
    'use-hosts': true,
    'use-system-hosts': true,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': [
      'localhost',
      '*.local',
      '*.lan',
      '*.localdomain',
      '*.internal',
      '*.home.arpa'
    ],
    'default-nameserver': ['223.5.5.5', '119.29.29.29', '1.1.1.1'],
    'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29'],
    'direct-nameserver': ['system'],
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
  // Mihomo 自上而下首条命中：本地/LAN 必须保持在预设与代理规则之前。
  rules: [
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
    'RULE-SET,applications,🎯 全球直连',
    'RULE-SET,private,🎯 全球直连',
    'RULE-SET,lancidr,🎯 全球直连,no-resolve',
    'GEOIP,LAN,🎯 全球直连,no-resolve',
    'RULE-SET,reject,🛑 全球拦截',
    'DOMAIN-SUFFIX,cn,🎯 全球直连',
    'RULE-SET,icloud,🎯 全球直连',
    'RULE-SET,apple,🎯 全球直连',
    'RULE-SET,direct,🎯 全球直连',
    'RULE-SET,google,🚀 节点选择',
    'RULE-SET,proxy,🚀 节点选择',
    'RULE-SET,cncidr,🎯 全球直连,no-resolve',
    'RULE-SET,telegramcidr,🚀 节点选择,no-resolve',
    'GEOIP,CN,🎯 全球直连',
    'MATCH,🐟 漏网之鱼'
  ],
  'rule-providers': {
    reject: {
      type: 'http',
      behavior: 'domain',
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ads-all.mrs',
      path: './ruleset/metacubex-category-ads-all.mrs',
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
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs',
      path: './ruleset/metacubex-geosite-cn.mrs',
      interval: 86400
    },
    private: {
      type: 'http',
      behavior: 'domain',
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/private.mrs',
      path: './ruleset/metacubex-geosite-private.mrs',
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
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/private.mrs',
      path: './ruleset/metacubex-geoip-private.mrs',
      interval: 86400
    },
    cncidr: {
      type: 'http',
      behavior: 'ipcidr',
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs',
      path: './ruleset/metacubex-geoip-cn.mrs',
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
 * 默认内置的 Sing-Box 1.12+ 模板。
 * 使用 rule-set 与 route action，避免已删除的 GeoIP/Geosite 和特殊出站语法。
 */
export const DEFAULT_SINGBOX_TEMPLATE = {
  log: {
    level: 'info',
    timestamp: true
  },
  dns: {
    servers: [
      {
        type: 'local',
        tag: 'dns-system'
      },
      {
        type: 'udp',
        tag: 'dns-cn',
        server: '223.5.5.5',
        server_port: 53
      },
      {
        type: 'https',
        tag: 'dns-remote',
        server: '1.1.1.1',
        server_port: 443,
        path: '/dns-query',
        tls: {
          enabled: true,
          server_name: 'cloudflare-dns.com'
        },
        detour: '🚀 节点选择'
      }
    ],
    rules: [
      {
        domain: ['localhost'],
        domain_suffix: ['localhost', 'local', 'lan', 'localdomain', 'internal', 'home.arpa'],
        action: 'route',
        server: 'dns-system'
      },
      {
        rule_set: 'geosite-private',
        action: 'route',
        server: 'dns-system'
      },
      {
        rule_set: 'geosite-category-ads-all',
        action: 'reject'
      },
      {
        rule_set: 'geosite-cn',
        action: 'route',
        server: 'dns-cn'
      }
    ],
    final: 'dns-remote',
    strategy: 'prefer_ipv4'
  },
  inbounds: [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: 2080
    }
  ],
  route: {
    rules: [
      {
        action: 'sniff'
      },
      {
        protocol: 'dns',
        action: 'hijack-dns'
      },
      {
        domain: ['localhost'],
        domain_suffix: ['localhost', 'local', 'lan', 'localdomain', 'internal', 'home.arpa'],
        action: 'route',
        outbound: 'direct'
      },
      {
        ip_is_private: true,
        action: 'route',
        outbound: 'direct'
      },
      {
        rule_set: ['geosite-private', 'geoip-private'],
        action: 'route',
        outbound: 'direct'
      },
      {
        rule_set: 'geosite-category-ads-all',
        action: 'reject'
      },
      {
        rule_set: ['geosite-cn', 'geoip-cn'],
        action: 'route',
        outbound: 'direct'
      }
    ],
    rule_set: [
      {
        tag: 'geosite-private',
        type: 'remote',
        format: 'binary',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/private.srs',
        download_detour: 'direct',
        update_interval: '1d'
      },
      {
        tag: 'geoip-private',
        type: 'remote',
        format: 'binary',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/private.srs',
        download_detour: 'direct',
        update_interval: '1d'
      },
      {
        tag: 'geosite-cn',
        type: 'remote',
        format: 'binary',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs',
        download_detour: 'direct',
        update_interval: '1d'
      },
      {
        tag: 'geoip-cn',
        type: 'remote',
        format: 'binary',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs',
        download_detour: 'direct',
        update_interval: '1d'
      },
      {
        tag: 'geosite-category-ads-all',
        type: 'remote',
        format: 'binary',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/category-ads-all.srs',
        download_detour: 'direct',
        update_interval: '1d'
      }
    ],
    final: '🚀 节点选择',
    default_domain_resolver: 'dns-cn',
    auto_detect_interface: true
  },
  experimental: {
    cache_file: {
      enabled: true
    }
  }
};
