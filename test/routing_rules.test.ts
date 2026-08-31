import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { toClashMeta, toShadowrocketConf, toSingBox } from '../src/generator';

function indexOfRule(rules: string[], prefix: string): number {
  return rules.findIndex(rule => rule.startsWith(prefix));
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

describe('generated routing rules', () => {
  test('Mihomo standard rules prioritize local/LAN and direct domains before proxy rules', () => {
    const config: any = yaml.load(toClashMeta([], undefined, 'standard'));
    const rules = config.rules as string[];
    const providers = config['rule-providers'] as Record<string, any>;

    expect(rules.slice(0, 7)).toEqual([
      'DOMAIN,localhost,🎯 全球直连',
      'DOMAIN-SUFFIX,localhost,🎯 全球直连',
      'DOMAIN-SUFFIX,local,🎯 全球直连',
      'DOMAIN-SUFFIX,lan,🎯 全球直连',
      'DOMAIN-SUFFIX,localdomain,🎯 全球直连',
      'DOMAIN-SUFFIX,internal,🎯 全球直连',
      'DOMAIN-SUFFIX,home.arpa,🎯 全球直连'
    ]);
    expect(indexOfRule(rules, 'IP-CIDR,10.0.0.0/8,')).toBeLessThan(indexOfRule(rules, 'RULE-SET,reject,'));
    expect(indexOfRule(rules, 'IP-CIDR6,fc00::/7,')).toBeLessThan(indexOfRule(rules, 'RULE-SET,reject,'));
    expect(indexOfRule(rules, 'RULE-SET,private,')).toBeLessThan(indexOfRule(rules, 'RULE-SET,reject,'));
    expect(indexOfRule(rules, 'RULE-SET,reject,')).toBeLessThan(indexOfRule(rules, 'DOMAIN-SUFFIX,cn,'));
    expect(indexOfRule(rules, 'DOMAIN-SUFFIX,cn,')).toBeLessThan(indexOfRule(rules, 'RULE-SET,direct,'));
    expect(indexOfRule(rules, 'RULE-SET,direct,')).toBeLessThan(indexOfRule(rules, 'RULE-SET,proxy,'));
    expect(indexOfRule(rules, 'RULE-SET,cncidr,')).toBeLessThan(indexOfRule(rules, 'MATCH,'));
    expect(indexOfRule(rules, 'GEOIP,CN,')).toBeLessThan(indexOfRule(rules, 'MATCH,'));
    expect(rules.at(-1)).toBe('MATCH,🐟 漏网之鱼');

    const expectedProviders = {
      reject: {
        behavior: 'domain',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/category-ads-all.mrs'
      },
      direct: {
        behavior: 'domain',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs'
      },
      private: {
        behavior: 'domain',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/private.mrs'
      },
      lancidr: {
        behavior: 'ipcidr',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/private.mrs'
      },
      cncidr: {
        behavior: 'ipcidr',
        url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs'
      }
    } as const;

    for (const [tag, expected] of Object.entries(expectedProviders)) {
      expect(providers[tag]).toEqual(expect.objectContaining({
        type: 'http',
        behavior: expected.behavior,
        format: 'mrs',
        url: expected.url,
        interval: 86400
      }));
      expect(providers[tag].path.endsWith('.mrs')).toBe(true);
      expect(indexOfRule(rules, `RULE-SET,${tag},`)).toBeGreaterThan(-1);
    }

    expect(config.dns['use-hosts']).toBe(true);
    expect(config.dns['use-system-hosts']).toBe(true);
    expect(config.dns['direct-nameserver']).toEqual(['system']);
    expect(config.dns['fake-ip-filter']).toEqual(expect.arrayContaining([
      'localhost',
      '*.local',
      '*.lan',
      '*.home.arpa'
    ]));
  });

  test.each(['ai', 'media'])('Mihomo %s preset keeps local/LAN rules ahead of preset overrides', preset => {
    const config: any = yaml.load(toClashMeta([], undefined, preset));
    const rules = config.rules as string[];
    const presetRuleIndex = rules.findIndex(rule => rule.includes(preset === 'ai' ? '🤖 智算 AI' : '🎬 国际流媒体'));

    expect(presetRuleIndex).toBeGreaterThan(indexOfRule(rules, 'RULE-SET,reject,'));
    expect(indexOfRule(rules, 'RULE-SET,private,')).toBeLessThan(presetRuleIndex);
    expect(indexOfRule(rules, 'RULE-SET,lancidr,')).toBeLessThan(presetRuleIndex);
    expect(indexOfRule(rules, 'GEOIP,LAN,')).toBeLessThan(presetRuleIndex);
    expect(presetRuleIndex).toBeLessThan(indexOfRule(rules, 'DOMAIN-SUFFIX,cn,'));
    expect(rules.at(-1)).toBe('MATCH,🐟 漏网之鱼');
  });

  test('Mihomo minimal rules avoid rule providers and still bypass local/LAN and China traffic', () => {
    const config: any = yaml.load(toClashMeta([], undefined, 'minimal'));
    const rules = config.rules as string[];

    expect(config['rule-providers']).toBeUndefined();
    expect(rules).toEqual(expect.arrayContaining([
      'DOMAIN,localhost,🎯 全球直连',
      'DOMAIN-SUFFIX,local,🎯 全球直连',
      'DOMAIN-SUFFIX,lan,🎯 全球直连',
      'IP-CIDR,10.0.0.0/8,🎯 全球直连,no-resolve',
      'IP-CIDR,172.16.0.0/12,🎯 全球直连,no-resolve',
      'IP-CIDR,192.168.0.0/16,🎯 全球直连,no-resolve',
      'IP-CIDR,198.18.0.0/15,🎯 全球直连,no-resolve',
      'IP-CIDR,224.0.0.0/3,🎯 全球直连,no-resolve',
      'IP-CIDR6,fc00::/7,🎯 全球直连,no-resolve',
      'IP-CIDR6,ff00::/8,🎯 全球直连,no-resolve',
      'DOMAIN-SUFFIX,cn,🎯 全球直连',
      'GEOSITE,CN,🎯 全球直连',
      'GEOIP,CN,🎯 全球直连'
    ]));
    expect(rules.at(-1)).toBe('MATCH,🚀 节点选择');
  });

  test('Sing-box uses current rule sets and explicit local/China/final routing', () => {
    const config = JSON.parse(toSingBox([]));
    const allKeys = collectKeys(config);
    const ruleSetTags = new Set(config.route.rule_set.map((item: any) => item.tag));
    const ruleSetsByTag = new Map(config.route.rule_set.map((item: any) => [item.tag, item]));
    const referencedRuleSets = new Set<string>();

    for (const rule of [...config.dns.rules, ...config.route.rules]) {
      const tags = Array.isArray(rule.rule_set) ? rule.rule_set : rule.rule_set ? [rule.rule_set] : [];
      for (const tag of tags) referencedRuleSets.add(tag);
    }

    expect(config.dns.servers.every((server: any) => server.address === undefined)).toBe(true);
    expect(allKeys.has('geosite')).toBe(false);
    expect(allKeys.has('geoip')).toBe(false);
    expect(config.inbounds.every((inbound: any) => inbound.sniff === undefined)).toBe(true);
    expect(config.outbounds.some((outbound: any) => ['block', 'dns'].includes(outbound.type))).toBe(false);
    expect(config.dns.servers.map((server: any) => server.type)).toEqual(['local', 'udp', 'https']);
    expect(config.dns.servers.find((server: any) => server.tag === 'dns-cn').detour).toBeUndefined();
    expect(config.dns.final).toBe('dns-remote');
    expect(config.route.rules[0]).toEqual({ action: 'sniff' });
    expect(config.route.rules[1]).toEqual({ protocol: 'dns', action: 'hijack-dns' });
    expect(config.route.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: ['localhost'], outbound: 'direct' }),
      expect.objectContaining({ ip_is_private: true, outbound: 'direct' }),
      expect.objectContaining({ rule_set: ['geosite-private', 'geoip-private'], outbound: 'direct' }),
      expect.objectContaining({ rule_set: ['geosite-cn', 'geoip-cn'], outbound: 'direct' }),
      expect.objectContaining({ rule_set: 'geosite-category-ads-all', action: 'reject' })
    ]));
    expect(config.route.final).toBe('🚀 节点选择');
    expect([...referencedRuleSets].every(tag => ruleSetTags.has(tag))).toBe(true);
    expect(config.experimental.cache_file.enabled).toBe(true);

    const expectedRuleSetUrls = {
      'geosite-private': 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/private.srs',
      'geoip-private': 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/private.srs',
      'geosite-cn': 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs',
      'geoip-cn': 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs',
      'geosite-category-ads-all': 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/category-ads-all.srs'
    } as const;

    for (const [tag, url] of Object.entries(expectedRuleSetUrls)) {
      expect(ruleSetsByTag.get(tag)).toEqual(expect.objectContaining({
        tag,
        type: 'remote',
        format: 'binary',
        url,
        download_detour: 'direct',
        update_interval: '1d'
      }));
      expect(referencedRuleSets.has(tag)).toBe(true);
    }

    const selector = config.outbounds.find((outbound: any) => outbound.tag === '🚀 节点选择');
    expect(selector.outbounds).toEqual(['⚡ 自动选择', 'direct']);
  });

  test('Shadowrocket config sends local/LAN and China rules direct before proxy fallback', () => {
    const config = toShadowrocketConf([]);
    const ruleSection = config.split('[Rule]\n')[1]!.split('\n\n[Host]')[0]!.split('\n');

    expect(ruleSection.slice(0, 4)).toEqual([
      'DOMAIN,localhost,DIRECT',
      'DOMAIN-SUFFIX,localhost,DIRECT',
      'DOMAIN-SUFFIX,local,DIRECT',
      'DOMAIN-SUFFIX,lan,DIRECT'
    ]);
    expect(ruleSection).toEqual(expect.arrayContaining([
      'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
      'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
      'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
      'IP-CIDR,fc00::/7,DIRECT,no-resolve',
      'DOMAIN-SUFFIX,cn,DIRECT',
      'GEOIP,CN,DIRECT'
    ]));

    const chinaDomainSet = indexOfRule(ruleSection, 'DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China_Domain.list,DIRECT');
    const chinaRuleSet = indexOfRule(ruleSection, 'RULE-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Shadowrocket/China/China.list,DIRECT');
    const googleRule = indexOfRule(ruleSection, 'DOMAIN-KEYWORD,google,');
    expect(chinaDomainSet).toBeGreaterThan(-1);
    expect(chinaRuleSet).toBeGreaterThan(chinaDomainSet);
    expect(chinaRuleSet).toBeLessThan(googleRule);
    expect(ruleSection.at(-1)).toBe('FINAL,🚀 节点选择');
    expect(config).toContain('🚀 节点选择 = select, DIRECT');
    expect(config).not.toContain('🚀 节点选择 = select, DIRECT, DIRECT');
  });
});
