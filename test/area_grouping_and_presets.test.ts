import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { toClashMeta, toSingBox } from '../src/generator';
import { NodeEnvelope } from '../src/types';
import { getRegionByNodeName, filterNodesByRegions, processNodes, ANNOUNCEMENT_NODE_REGEX } from '../src/utils';

function createMockNode(name: string, server = '1.1.1.1', port = 443): NodeEnvelope {
  return {
    name,
    server,
    port,
    protocol: 'shadowsocks',
    protocolData: { cipher: 'aes-128-gcm', password: 'pwd' },
    source: { format: 'raw', raw: `ss://${name}` }
  };
}

describe('Area Grouping and Multi-Preset Combinations', () => {
  // 模拟一组节点，包含亚太多个国家、美洲、欧洲及冷门单节点
  const sampleNodes: NodeEnvelope[] = [
    // 亚太核心大国 (香港 4个, 日本 4个, 新加坡 4个)
    createMockNode('🇭🇰 香港 01'),
    createMockNode('🇭🇰 香港 02'),
    createMockNode('🇭🇰 香港 03'),
    createMockNode('🇭🇰 香港 04'),
    createMockNode('🇯🇵 日本 01'),
    createMockNode('🇯🇵 日本 02'),
    createMockNode('🇯🇵 日本 03'),
    createMockNode('🇯🇵 日本 04'),
    createMockNode('🇸🇬高速流媒体1'),
    createMockNode('🇸🇬高速流媒体2'),
    createMockNode('🇸🇬 新加坡 03'),
    createMockNode('🇸🇬 新加坡 04'),
    // 亚太单节点国家 (韩国 1个, 台湾 1个, 泰国 1个, 澳洲 1个)
    createMockNode('🇰🇷 韩国专线 01'),
    createMockNode('🇹🇼 台湾 01'),
    createMockNode('🇹🇭 泰国 01'),
    createMockNode('🇦🇺 澳大利亚 01'),
    // 美洲核心大国 (美国 4个)
    createMockNode('🇺🇸 美国 01'),
    createMockNode('🇺🇸 美国 02'),
    createMockNode('🇺🇸 美国 03'),
    createMockNode('🇺🇸 美国 04'),
    // 美洲单节点国家 (加拿大 1个, 巴西 1个)
    createMockNode('🇨🇦 加拿大 01'),
    createMockNode('🇧🇷 巴西 01'),
    // 欧洲核心大国 (英国 3个)
    createMockNode('🇬🇧 英国 01'),
    createMockNode('🇬🇧 英国 02'),
    createMockNode('🇬🇧 英国 03'),
    // 欧洲单节点国家 (德国 1个, 瑞士 1个)
    createMockNode('🇩🇪 德国 01'),
    createMockNode('🇨🇭 瑞士 01'),
    // 其他冷门/信息节点
    createMockNode('🇿🇦 南非 01'),
    createMockNode('🇦🇪 阿联酋 01'),
    createMockNode('剩余流量：1019.5 GB'),
    createMockNode('套餐到期：2027-08-07')
  ];

  test('GB traffic regex does not misclassify bandwidth notices as United Kingdom', () => {
    const noticeNode = createMockNode('剩余流量：1019.5 GB');
    const region = getRegionByNodeName(noticeNode.name);
    // 流量单位 GB 绝不可判定为英国 (GB)
    expect(region?.code).not.toBe('GB');
  });

  test('Flag emoji in node name correctly identifies country and macro area', () => {
    const sgNode = createMockNode('🇸🇬高速流媒体1');
    const region = getRegionByNodeName(sgNode.name);
    expect(region).not.toBeNull();
    expect(region?.code).toBe('SG');
    expect(region?.name).toBe('新加坡');
  });

  test('filterNodesByRegions supports macro region code and alias (APAC / 亚太)', () => {
    const apacNodes = filterNodesByRegions(sampleNodes, 'APAC');
    const apacNames = apacNodes.map(n => n.name);
    expect(apacNames).toContain('🇭🇰 香港 01');
    expect(apacNames).toContain('🇯🇵 日本 01');
    expect(apacNames).toContain('🇰🇷 韩国专线 01');
    expect(apacNames).toContain('🇦🇺 澳大利亚 01');
    // 美洲和欧洲节点不应出现在亚太中
    expect(apacNames).not.toContain('🇺🇸 美国 01');
    expect(apacNames).not.toContain('🇬🇧 英国 01');

    // 中文别名测试
    const apacChinese = filterNodesByRegions(sampleNodes, '亚太');
    expect(apacChinese.length).toBe(apacNodes.length);
  });

  test('Hybrid mode (Scheme A - default) groups macro areas and core countries, eliminating single-node groups', () => {
    const configYaml = toClashMeta(sampleNodes, undefined, 'standard', undefined, 'hybrid');
    const config: any = yaml.load(configYaml);
    const groupNames = config['proxy-groups'].map((g: any) => g.name);

    // 应该包含宏观大区组
    expect(groupNames).toContain('🌏 亚太节点');
    expect(groupNames).toContain('🌎 美洲节点');
    expect(groupNames).toContain('🌍 欧洲节点');
    expect(groupNames).toContain('🌐 其他地区');

    // 节点数 >= 3 的核心大国应该有独立分组
    expect(groupNames).toContain('🇭🇰 香港节点');
    expect(groupNames).toContain('🇯🇵 日本节点');
    expect(groupNames).toContain('🇸🇬 新加坡节点');
    expect(groupNames).toContain('🇺🇸 美国节点');
    expect(groupNames).toContain('🇬🇧 英国节点');

    // 只有 1 个节点的冷门国家绝不应有独立单节点组 (它们已收拢在亚太/美洲/欧洲/其他大区中)
    expect(groupNames).not.toContain('🇰🇷 韩国节点');
    expect(groupNames).not.toContain('🇦🇺 澳大利亚节点');
    expect(groupNames).not.toContain('🇹🇭 泰国节点');
    expect(groupNames).not.toContain('🇨🇦 加拿大节点');
    expect(groupNames).not.toContain('🇧🇷 巴西节点');
    expect(groupNames).not.toContain('🇩🇪 德国节点');
    expect(groupNames).not.toContain('🇨🇭 瑞士节点');
    expect(groupNames).not.toContain('🇿🇦 南非节点');
    expect(groupNames).not.toContain('🇦🇪 阿联酋节点');

    // 验证大区内包含的节点
    const apacGroup = config['proxy-groups'].find((g: any) => g.name === '🌏 亚太节点');
    expect(apacGroup).toBeDefined();
    expect(apacGroup.proxies).toContain('🇭🇰 香港 01');
    expect(apacGroup.proxies).toContain('🇰🇷 韩国专线 01');
    expect(apacGroup.proxies).toContain('🇦🇺 澳大利亚 01');
    expect(apacGroup.proxies).toContain('🇹🇭 泰国 01');
  });

  test('Area mode (Scheme B - pure macro area) generates only macro area groups', () => {
    const configYaml = toClashMeta(sampleNodes, undefined, 'standard', undefined, 'area');
    const config: any = yaml.load(configYaml);
    const groupNames = config['proxy-groups'].map((g: any) => g.name);

    // 仅包含基础组 + 大区组，完全没有任何单一国家分组（全球直连已移除，国内流量直接走内核 DIRECT）
    expect(groupNames).toContain('🚀 节点选择');
    expect(groupNames).toContain('⚡ 自动选择');
    expect(groupNames).toContain('🌏 亚太节点');
    expect(groupNames).toContain('🌎 美洲节点');
    expect(groupNames).toContain('🌍 欧洲节点');
    expect(groupNames).toContain('🌐 其他地区');
    expect(groupNames).not.toContain('🎯 全球直连');
    expect(groupNames).toContain('🛑 全球拦截');
    expect(groupNames).toContain('🐟 漏网之鱼');

    expect(groupNames).not.toContain('🇭🇰 香港节点');
    expect(groupNames).not.toContain('🇯🇵 日本节点');
    expect(groupNames).not.toContain('🇺🇸 美国节点');

    // 总共仅 8 个策略组
    expect(config['proxy-groups'].length).toBe(8);
  });

  test('Multi-preset combination: preset="ai,media" injects both AI and Media groups and rules', () => {
    const configYaml = toClashMeta(sampleNodes, undefined, 'ai,media', undefined, 'hybrid');
    const config: any = yaml.load(configYaml);
    const groupNames = config['proxy-groups'].map((g: any) => g.name);

    expect(groupNames).toContain('🤖 智算 AI');
    expect(groupNames).toContain('🎬 国际流媒体');

    const rules = config.rules as string[];
    expect(rules.some(r => r.includes('🤖 智算 AI'))).toBe(true);
    expect(rules.some(r => r.includes('openai.com'))).toBe(true);
    expect(rules.some(r => r.includes('claude.ai'))).toBe(true);

    expect(rules.some(r => r.includes('🎬 国际流媒体'))).toBe(true);
    expect(rules.some(r => r.includes('youtube.com'))).toBe(true);
    expect(rules.some(r => r.includes('netflix.com'))).toBe(true);
  });

  test('Sing-box supports area groupType options', () => {
    const configJson = toSingBox(sampleNodes, undefined, { groupType: 'area' });
    const config = JSON.parse(configJson);
    const outboundTags = config.outbounds.map((o: any) => o.tag);

    expect(outboundTags).toContain('🌏 亚太节点');
    expect(outboundTags).toContain('🌎 美洲节点');
    expect(outboundTags).toContain('🌍 欧洲节点');
    expect(outboundTags).toContain('🌐 其他地区');

    const selector = config.outbounds.find((o: any) => o.tag === '🚀 节点选择');
    expect(selector.outbounds).toContain('🌏 亚太节点');
    expect(selector.outbounds).toContain('🌎 美洲节点');
  });

  test('processNodes filters out announcement / fake dead nodes by default', () => {
    const rawNodes = [
      createMockNode('🇭🇰 香港 01'),
      createMockNode('🌐 666中秋快乐666'),
      createMockNode('剩余流量：1019.5 GB'),
      createMockNode('🌐 套餐到期：长期有效'),
      createMockNode('🌐 节点超时请手动更新订阅'),
      createMockNode('🌐 Gemini解锁请使用VLESS节点'),
      createMockNode('🌐 [naa.la] 镜像官网 1000B#S1'),
      createMockNode('🇯🇵 日本 01')
    ];

    // 默认开启过滤
    const cleaned = processNodes(rawNodes, {});
    expect(cleaned.length).toBe(2);
    expect(cleaned.map(n => n.name)).toEqual(['🇭🇰 香港 01', '🇯🇵 日本 01']);

    // 显式关闭过滤
    const kept = processNodes(rawNodes, { filterNotices: false });
    expect(kept.length).toBe(rawNodes.length);
  });

  test('Main selector group maintains pure hierarchical tree structure without dumping 100+ raw proxies', () => {
    const configYaml = toClashMeta(sampleNodes, undefined, 'standard', undefined, 'hybrid');
    const config: any = yaml.load(configYaml);
    const mainGroup = config['proxy-groups'].find((g: any) => g.name === '🚀 节点选择');

    expect(mainGroup).toBeDefined();
    // 应该只包含自动选择、各大区/国家策略组、DIRECT
    expect(mainGroup.proxies).toContain('⚡ 自动选择');
    expect(mainGroup.proxies).toContain('🌏 亚太节点');
    expect(mainGroup.proxies).toContain('DIRECT');

    // 绝不应该直接平铺所有单节点名字
    expect(mainGroup.proxies).not.toContain('🇭🇰 香港 01');
    expect(mainGroup.proxies).not.toContain('🇯🇵 日本 01');
    expect(mainGroup.proxies).not.toContain('🇺🇸 美国 01');
  });
});
