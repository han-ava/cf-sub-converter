// test/vless_base64_authority.test.ts
import { describe, expect, test } from 'bun:test';
import { parseContent, parseSingleNode, parseVless } from '../src/parser';
import { adaptNodeToMihomo } from '../src/adapters/mihomo';
import { nodeToSingBoxOutbound } from '../src/adapters/singbox';
import { toRawLinks, toBase64 } from '../src/adapters/raw';
import { safeBase64Encode } from '../src/utils';

describe('VLESS Base64 Authority & Legacy Query Parameter Suite (yuyun.mhlnf.cn)', () => {
  // 生成单个 yuyun 格式的 VLESS URI：vless://BASE64(auto:UUID@server:port)?remark=...&tls=1&xtls=2...
  function makeYuyunVlessUri(name: string, ip: string, port: number, uuid: string = '32c1b4d3-84be-11ef-bb6b-bc241111d95d') {
    const rawAuthority = `auto:${uuid}@${ip}:${port}`;
    const base64Authority = safeBase64Encode(rawAuthority);
    const query = [
      `remark=${encodeURIComponent(name)}`,
      'tls=1',
      'xtls=2',
      `sni=sni.${ip}.nip.io`,
      'pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY',
      'sid=1a2b3c4d',
      'fp=chrome',
      'type=tcp'
    ].join('&');

    return `vless://${base64Authority}?${query}`;
  }

  // 模拟 yuyun.mhlnf.cn 包含 28 个 VLESS 节点的订阅
  const yuyunNodeNames = [
    '香港01', '香港02', '香港03', '香港04', '香港05', '香港06',
    '日本01', '日本02', '日本03', '日本04', '日本05', '日本06',
    '新加坡01', '新加坡02', '新加坡03', '新加坡04',
    '美国01', '美国02', '美国03', '美国04', '美国05', '美国06',
    '韩国01', '韩国02',
    '台湾01', '台湾02',
    '德国01', '英国01'
  ];

  const yuyunUris = yuyunNodeNames.map((name, idx) =>
    makeYuyunVlessUri(name, `18.136.212.${idx + 1}`, 50000 + idx)
  );

  const yuyunDecodedText = yuyunUris.join('\n');
  const yuyunBase64Subscription = safeBase64Encode(yuyunDecodedText);

  test('1. parses single VLESS URI with Base64 authority and auto: prefix', () => {
    const uri = makeYuyunVlessUri('香港01', '18.136.212.107', 50284);
    const node = parseSingleNode(uri);

    expect(node).not.toBeNull();
    expect(node!.protocol).toBe('vless');
    expect(node!.name).toBe('香港01');
    expect(node!.server).toBe('18.136.212.107');
    expect(node!.port).toBe(50284);
    expect(node!.protocolData.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
    expect(node!.protocolData.security).toBe('reality');
    expect(node!.protocolData.realityOpts?.publicKey).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
    expect(node!.protocolData.realityOpts?.shortId).toBe('1a2b3c4d');
    expect(node!.protocolData.fingerprint).toBe('chrome');
    expect(node!.protocolData.sni).toBe('sni.18.136.212.107.nip.io');

    // 确认 node.source.raw 经过了规范化，标准客户端可直接解析
    expect(node!.source.raw).toContain('vless://32c1b4d3-84be-11ef-bb6b-bc241111d95d@18.136.212.107:50284?');
  });

  test('2. parses full yuyun Base64 subscription with 28 VLESS nodes (28 -> 28)', async () => {
    // 经外层 Base64 解码 -> 28 行带有 Base64 authority 的 VLESS URI
    const nodes = await parseContent(yuyunBase64Subscription);
    expect(nodes.length).toBe(28);

    for (let i = 0; i < 28; i++) {
      const node = nodes[i]!;
      expect(node.protocol).toBe('vless');
      expect(node.name).toBe(yuyunNodeNames[i]);
      expect(node.server).toBe(`18.136.212.${i + 1}`);
      expect(node.port).toBe(50000 + i);
      expect(node.protocolData.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
      expect(node.protocolData.security).toBe('reality');
    }
  });

  test('3. converts all 28 Yuyun VLESS nodes to Mihomo without fatal errors', async () => {
    const nodes = await parseContent(yuyunBase64Subscription);
    expect(nodes.length).toBe(28);

    for (const node of nodes) {
      const res = adaptNodeToMihomo(node);
      expect(res.fatal).toBe(false);
      expect(res.emitted).toBe(true);
      expect(res.config).toBeDefined();
      expect(res.config!.type).toBe('vless');
      expect(res.config!.server).toBe(node.server);
      expect(res.config!.port).toBe(node.port);
      expect(res.config!.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
      expect(res.config!.tls).toBe(true);
      expect(res.config!['reality-opts']).toBeDefined();
      expect(res.config!['reality-opts']['public-key']).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
      expect(res.config!['client-fingerprint']).toBe('chrome');
    }
  });

  test('4. converts all 28 Yuyun VLESS nodes to Sing-box outbounds', async () => {
    const nodes = await parseContent(yuyunBase64Subscription);
    expect(nodes.length).toBe(28);

    for (const node of nodes) {
      const outbound = nodeToSingBoxOutbound(node);
      expect(outbound).toBeDefined();
      expect(outbound.type).toBe('vless');
      expect(outbound.server).toBe(node.server);
      expect(outbound.server_port).toBe(node.port);
      expect(outbound.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
      expect(outbound.tls?.reality?.enabled).toBe(true);
      expect(outbound.tls?.reality?.public_key).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
    }
  });

  test('5. produces normalized Raw Links and Base64 subscription without node drop', async () => {
    const nodes = await parseContent(yuyunBase64Subscription);
    expect(nodes.length).toBe(28);

    const raw = toRawLinks(nodes);
    const lines = raw.split('\n').filter(Boolean);
    expect(lines.length).toBe(28);

    for (const line of lines) {
      // 确认每一行都是标准可被客户端直连的 VLESS 格式 (包含 UUID@server:port)
      expect(line).toMatch(/^vless:\/\/32c1b4d3-84be-11ef-bb6b-bc241111d95d@18\.136\.212\.\d+:\d+\?/);
    }

    const b64 = toBase64(nodes);
    const roundtripNodes = await parseContent(b64);
    expect(roundtripNodes.length).toBe(28);
  });

  test('6. handles entirely Base64-encoded VLESS URL without query delimiter', () => {
    // 整个 vless://BASE64(uuid@server:port?query#name)
    const plain = '32c1b4d3-84be-11ef-bb6b-bc241111d95d@1.2.3.4:443?security=tls&sni=example.com#Full%20B64%20VLESS';
    const fullB64Uri = `vless://${safeBase64Encode(plain)}`;

    const node = parseSingleNode(fullB64Uri);
    expect(node).not.toBeNull();
    expect(node!.name).toBe('Full B64 VLESS');
    expect(node!.server).toBe('1.2.3.4');
    expect(node!.port).toBe(443);
    expect(node!.protocolData.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
    expect(node!.protocolData.security).toBe('tls');
    expect(node!.protocolData.sni).toBe('example.com');
  });
});
