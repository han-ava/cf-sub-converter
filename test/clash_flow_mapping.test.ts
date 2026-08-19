// test/clash_flow_mapping.test.ts
import { describe, expect, test } from 'bun:test';
import { parseContent, parseSingleNode } from '../src/parser';
import { adaptNodeToMihomo } from '../src/adapters/mihomo';
import { nodeToSingBoxOutbound } from '../src/adapters/singbox';
import { toRawLinks, toBase64 } from '../src/adapters/raw';
import { toClashMeta } from '../src/generator';

describe('Clash YAML Flow-Mapping & Inline JSON Proxies Suite (sub.7511111.xyz)', () => {
  // 模拟 sub.7511111.xyz 真实的 23 个节点（17 VLESS, 4 Hysteria2, 1 SS, 1 VMess）
  const mock7511111Yaml = `
port: 7890
socks-port: 7891
allow-lan: false
mode: rule
log-level: info
proxies:
  - {"name":"🇭🇰 香港 01 [Reality]","type":"vless","server":"104.21.1.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"hk01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇭🇰 香港 02 [Reality]","type":"vless","server":"104.21.1.2","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"hk02.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇭🇰 香港 03 [Reality]","type":"vless","server":"104.21.1.3","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"hk03.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇭🇰 香港 04 [Reality]","type":"vless","server":"104.21.1.4","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"hk04.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇯🇵 日本 01 [Reality]","type":"vless","server":"104.21.2.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"jp01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇯🇵 日本 02 [Reality]","type":"vless","server":"104.21.2.2","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"jp02.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇯🇵 日本 03 [Reality]","type":"vless","server":"104.21.2.3","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"jp03.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇸🇬 新加坡 01 [Reality]","type":"vless","server":"104.21.3.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"sg01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇸🇬 新加坡 02 [Reality]","type":"vless","server":"104.21.3.2","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"sg01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇺🇸 美国 01 [Reality]","type":"vless","server":"104.21.4.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"us01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇺🇸 美国 02 [Reality]","type":"vless","server":"104.21.4.2","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"us02.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇺🇸 美国 03 [Reality]","type":"vless","server":"104.21.4.3","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"us03.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇰🇷 韩国 01 [Reality]","type":"vless","server":"104.21.5.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"kr01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇹🇼 台湾 01 [Reality]","type":"vless","server":"104.21.6.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"tw01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇩🇪 德国 01 [Reality]","type":"vless","server":"104.21.7.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"de01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇬🇧 英国 01 [Reality]","type":"vless","server":"104.21.8.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"uk01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇫🇷 法国 01 [Reality]","type":"vless","server":"104.21.9.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","tls":true,"servername":"fr01.example.com","reality-opts":{"public-key":"f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY","short-id":"1a2b3c4d"},"client-fingerprint":"chrome","network":"tcp","flow":"xtls-rprx-vision"}
  - {"name":"🇭🇰 香港 HY2 01","type":"hysteria2","server":"hy2-hk.example.com","port":443,"password":"pass-hy2-hk-01","sni":"hy2-hk.example.com","skip-cert-verify":true}
  - {"name":"🇯🇵 日本 HY2 01","type":"hysteria2","server":"hy2-jp.example.com","port":443,"password":"pass-hy2-jp-01","sni":"hy2-jp.example.com","skip-cert-verify":true}
  - {"name":"🇺🇸 美国 HY2 01","type":"hysteria2","server":"hy2-us.example.com","port":443,"password":"pass-hy2-us-01","sni":"hy2-us.example.com","skip-cert-verify":true}
  - {"name":"🇸🇬 新加坡 HY2 01","type":"hysteria2","server":"hy2-sg.example.com","port":443,"password":"pass-hy2-sg-01","sni":"hy2-sg.example.com","skip-cert-verify":true}
  - {"name":"🇭🇰 香港 SS 01","type":"ss","server":"ss-hk.example.com","port":8388,"cipher":"2022-blake3-aes-128-gcm","password":"dGVzdDEyMzQ1Njc4OTAxMg=="}
  - {"name":"🇭🇰 香港 VMess 01","type":"vmess","server":"vmess-hk.example.com","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d","alterId":0,"cipher":"auto","tls":true,"network":"ws","ws-opts":{"path":"/ws","headers":{"Host":"vmess-hk.example.com"}}}
proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - DIRECT
`;

  test('1. parses all 23 nodes accurately from Clash YAML flow mapping', async () => {
    const nodes = await parseContent(mock7511111Yaml);
    expect(nodes.length).toBe(23);

    const vlessNodes = nodes.filter(n => n.protocol === 'vless');
    const hy2Nodes = nodes.filter(n => n.protocol === 'hysteria2');
    const ssNodes = nodes.filter(n => n.protocol === 'ss' || n.protocol === 'shadowsocks');
    const vmessNodes = nodes.filter(n => n.protocol === 'vmess');

    expect(vlessNodes.length).toBe(17);
    expect(hy2Nodes.length).toBe(4);
    expect(ssNodes.length).toBe(1);
    expect(vmessNodes.length).toBe(1);
  });

  test('2. verifies protocolData and parameters of parsed flow-mapping nodes', async () => {
    const nodes = await parseContent(mock7511111Yaml);
    const firstVless = nodes[0]!;
    expect(firstVless.name).toBe('🇭🇰 香港 01 [Reality]');
    expect(firstVless.server).toBe('104.21.1.1');
    expect(firstVless.port).toBe(443);
    expect(firstVless.protocolData.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
    expect(firstVless.protocolData.flow).toBe('xtls-rprx-vision');

    const firstHy2 = nodes.find(n => n.protocol === 'hysteria2')!;
    expect(firstHy2.name).toBe('🇭🇰 香港 HY2 01');
    expect(firstHy2.server).toBe('hy2-hk.example.com');
    expect(firstHy2.port).toBe(443);
    expect(firstHy2.protocolData.password).toBe('pass-hy2-hk-01');

    const ssNode = nodes.find(n => n.protocol === 'ss' || n.protocol === 'shadowsocks')!;
    expect(ssNode.name).toBe('🇭🇰 香港 SS 01');
    expect(ssNode.server).toBe('ss-hk.example.com');
    expect(ssNode.port).toBe(8388);
    expect(ssNode.protocolData.cipher).toBe('2022-blake3-aes-128-gcm');

    const vmessNode = nodes.find(n => n.protocol === 'vmess')!;
    expect(vmessNode.name).toBe('🇭🇰 香港 VMess 01');
    expect(vmessNode.server).toBe('vmess-hk.example.com');
    expect(vmessNode.port).toBe(443);
    expect(vmessNode.protocolData.uuid).toBe('32c1b4d3-84be-11ef-bb6b-bc241111d95d');
  });

  test('3. generates clean Raw Links and Base64 subscription without node drop', async () => {
    const nodes = await parseContent(mock7511111Yaml);
    expect(nodes.length).toBe(23);

    const rawLinks = toRawLinks(nodes);
    const lines = rawLinks.split('\n').filter(Boolean);
    expect(lines.length).toBe(23);

    const base64 = toBase64(nodes);
    expect(base64).toBeDefined();
    expect(base64.length).toBeGreaterThan(500);

    // Reparse the generated Base64 subscription
    const reParsed = await parseContent(base64);
    expect(reParsed.length).toBe(23);
  });

  test('4. converts flow-mapping Clash YAML nodes into valid Mihomo and Sing-box configs', async () => {
    const nodes = await parseContent(mock7511111Yaml);

    for (const node of nodes) {
      const mihomoRes = adaptNodeToMihomo(node);
      expect(mihomoRes.fatal).toBe(false);
      expect(mihomoRes.config).toBeDefined();
      expect(mihomoRes.config!.name).toBe(node.name);
      expect(mihomoRes.config!.server).toBe(node.server);
      expect(mihomoRes.config!.port).toBe(node.port);

      const singboxOutbound = nodeToSingBoxOutbound(node);
      expect(singboxOutbound).toBeDefined();
      expect(singboxOutbound.tag).toBe(node.name);
      expect(singboxOutbound.server).toBe(node.server);
    }
  });

  test('5. handles malformed YAML with flow-mapping fallback gracefully', async () => {
    // Malformed YAML: syntax error in rules section, but proxies has flow mappings
    const badYaml = `
proxies:
  - {"name":"Node 1","type":"vless","server":"1.1.1.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d"}
  - {"name":"Node 2","type":"hysteria2","server":"2.2.2.2","port":443,"password":"pass"}
rules:
  - %INVALID_YAML_SYNTAX% ::: [[
`;
    const nodes = await parseContent(badYaml);
    expect(nodes.length).toBe(2);
    expect(nodes[0]!.name).toBe('Node 1');
    expect(nodes[1]!.name).toBe('Node 2');
  });

  test('6. single line JSON / flow mapping node parsed via parseSingleNode', () => {
    const line1 = '- {"name":"Node Single","type":"vless","server":"1.1.1.1","port":443,"uuid":"32c1b4d3-84be-11ef-bb6b-bc241111d95d"}';
    const node1 = parseSingleNode(line1);
    expect(node1).not.toBeNull();
    expect(node1!.name).toBe('Node Single');
    expect(node1!.server).toBe('1.1.1.1');
    expect(node1!.port).toBe(443);

    const line2 = '{"name":"Node No Dash","type":"hysteria2","server":"2.2.2.2","port":443,"password":"pass"}';
    const node2 = parseSingleNode(line2);
    expect(node2).not.toBeNull();
    expect(node2!.name).toBe('Node No Dash');
    expect(node2!.server).toBe('2.2.2.2');
  });
});
