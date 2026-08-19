// test/query_reader_and_aliases.test.ts
import { describe, expect, test } from 'bun:test';
import { QueryParamReader, parseRawQuery } from '../src/utils';
import { parseSingleNode } from '../src/parser';
import { adaptNodeToMihomo } from '../src/adapters/mihomo';
import { renderHtmlPage } from '../src/ui';

describe('QueryParamReader & Universal Alias Suite', () => {
  test('1. QueryParamReader: Case-insensitivity, aliases, and getUnusedExtras isolation', () => {
    const raw = 'Server_Name=example.com&PublicKey=abcPBK123&ShortID=sid999&SPIDER_X=%2Flogin&ALLOWINSECURE=1&unknown_opt=customValue&mport=30000-40000';
    const rawQuery = parseRawQuery(raw);
    const q = new QueryParamReader(rawQuery.entries);

    // Read recognized aliases
    const sni = q.get('sni', 'servername', 'server-name', 'server_name', 'peer');
    expect(sni).toBe('example.com');

    const pbk = q.get('pbk', 'public-key', 'publicKey', 'public_key', 'publickey');
    expect(pbk).toBe('abcPBK123');

    const sid = q.get('sid', 'short-id', 'shortId', 'short_id', 'shortid');
    expect(sid).toBe('sid999');

    const spx = q.get('spx', 'spider-x', 'spiderX', 'spider_x', 'spiderx');
    expect(spx).toBe('/login');

    const insecure = q.getBool('insecure', 'allowinsecure', 'allow_insecure', 'allowInsecure', 'skip-cert-verify');
    expect(insecure).toBe(true);

    const ports = q.get('ports', 'mport', 'mports');
    expect(ports).toBe('30000-40000');

    // Extras should only contain the unread unknown_opt
    const extras = q.getUnusedExtras();
    expect(extras).toEqual({
      unknown_opt: 'customValue'
    });
  });

  test('2. QueryParamReader: getInt & getBool edge cases', () => {
    const raw = 'port=8443&badNum=notANum&bool1=1&bool2=true&bool3=True&bool4=false&bool5=0&bool6=other';
    const rawQuery = parseRawQuery(raw);
    const q = new QueryParamReader(rawQuery.entries);

    expect(q.getInt('port')).toBe(8443);
    expect(q.getInt('badNum')).toBeUndefined();
    expect(q.getInt('nonexistent')).toBeUndefined();

    expect(q.getBool('bool1')).toBe(true);
    expect(q.getBool('bool2')).toBe(true);
    expect(q.getBool('bool3')).toBe(true);
    expect(q.getBool('bool4')).toBe(false);
    expect(q.getBool('bool5')).toBe(false);
    expect(q.getBool('bool6')).toBe(false);
    expect(q.getBool('nonexistent')).toBe(false);
  });

  test('3. Hysteria 2 Gecko: obfs=gecko with packet size options produces valid Mihomo proxy', () => {
    const hy2GeckoUri = 'hysteria2://gecko_pass@1.2.3.4:443?sni=gecko.example.com&obfs=gecko&obfs-password=my_gecko_pass&obfs-min-packet-size=64&obfs-max-packet-size=1280&mport=20000-30000#HY2%20Gecko%20Node';
    const node = parseSingleNode(hy2GeckoUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.obfs).toBe('gecko');
    expect(node!.protocolData.obfsPassword).toBe('my_gecko_pass');
    expect(node!.protocolData.obfsMinPacketSize).toBe(64);
    expect(node!.protocolData.obfsMaxPacketSize).toBe(1280);
    expect(node!.protocolData.ports).toBe('20000-30000');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.warnings.length).toBe(0);
    expect(res.unsupportedParams.length).toBe(0);

    expect(res.config!.type).toBe('hysteria2');
    expect(res.config!.obfs).toBe('gecko');
    expect(res.config!['obfs-password']).toBe('my_gecko_pass');
    expect(res.config!['obfs-min-packet-size']).toBe(64);
    expect(res.config!['obfs-max-packet-size']).toBe(1280);
    expect(res.config!.ports).toBe('20000-30000');
  });

  test('4. VLESS Reality: all lowercase/snake_case aliases map correctly and avoid false Gate clean/warning', () => {
    // lowercase aliases: publickey, shortid, spiderx, server_name, packet_encoding, servicename
    const uri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=grpc&security=reality&server_name=reality.example.com&publickey=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY&shortid=1a2b3c4d&spiderx=%2Ftest&servicename=my-grpc-service&packet_encoding=xudp#VLESS%20Reality%20Aliases';
    const node = parseSingleNode(uri);
    expect(node).not.toBeNull();

    expect(node!.protocolData.sni).toBe('reality.example.com');
    expect(node!.protocolData.realityOpts?.publicKey).toBe('f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY');
    expect(node!.protocolData.realityOpts?.shortId).toBe('1a2b3c4d');
    expect(node!.protocolData.realityOpts?.spiderX).toBe('/test');
    expect(node!.protocolData.transport?.serviceName).toBe('my-grpc-service');
    expect(node!.protocolData.packetEncoding).toBe('xudp');
    expect(Object.keys(node!.protocolData.extras).length).toBe(0);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.warnings.length).toBe(0);
    expect(res.unsupportedParams.length).toBe(0);

    expect(res.config!.servername).toBe('reality.example.com');
    expect(res.config!['reality-opts']).toEqual({
      'public-key': 'f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY',
      'short-id': '1a2b3c4d',
      'spider-x': '/test'
    });
    expect(res.config!['grpc-opts']).toEqual({
      'grpc-service-name': 'my-grpc-service'
    });
    expect(res.config!['packet-encoding']).toBe('xudp');
  });

  test('5. Shadowsocks: udp_over_tcp and client_fingerprint aliases map correctly', () => {
    const ssUri = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388?udp_over_tcp=true&udp_over_tcp_version=2&client_fingerprint=chrome#SS%20Aliases';
    const node = parseSingleNode(ssUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.udpOverTcp).toBe(true);
    expect(node!.protocolData.udpOverTcpVersion).toBe(2);
    expect(node!.protocolData.clientFingerprint).toBe('chrome');
    expect(Object.keys(node!.protocolData.extras).length).toBe(0);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(false);
    expect(res.config!['udp-over-tcp']).toBe(true);
    expect(res.config!['udp-over-tcp-version']).toBe(2);
    expect(res.config!['client-fingerprint']).toBe('chrome');
  });

  test('6. TUIC: congestion_control, udp_relay_mode, zero_rtt_handshake aliases map correctly', () => {
    const tuicUri = 'tuic://my_uuid:my_pass@1.2.3.4:8443?congestion_control=cubic&udp_relay_mode=quic&zero_rtt_handshake=1&server_name=tuic.example.com#TUIC%20Aliases';
    const node = parseSingleNode(tuicUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.congestionControl).toBe('cubic');
    expect(node!.protocolData.udpRelayMode).toBe('quic');
    expect(node!.protocolData.zeroRttHandshake).toBe(true);
    expect(node!.protocolData.sni).toBe('tuic.example.com');
    expect(Object.keys(node!.protocolData.extras).length).toBe(0);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(false);
    expect(res.config!['congestion-controller']).toBe('cubic');
    expect(res.config!['udp-relay-mode']).toBe('quic');
    expect(res.config!['zero-rtt-handshake']).toBe(true);
    expect(res.config!.sni).toBe('tuic.example.com');
  });

  test('7. Unknown parameters trigger lossy=true and unmapped warnings properly', () => {
    const uri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&sni=example.com&totally_unknown_parameter=some_value#Unknown%20Param';
    const node = parseSingleNode(uri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.extras).toHaveProperty('totally_unknown_parameter', 'some_value');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(true);
    expect(res.emitted).toBe(true);
    expect(res.unsupportedParams).toContain('totally_unknown_parameter');
    expect(res.warnings.some(w => w.field === 'totally_unknown_parameter')).toBe(true);
  });

  test('8. UI Warning text verification', () => {
    const html = renderHtmlPage('3.0.0-hardened');
    expect(html).toContain('节点仍输出到最终配置中');
    expect(html).toContain('存在未映射参数，可能影响连接语义，请根据警告详情确认');
    expect(html).not.toContain('已自动剔除未映射参数以确保连接不报错');
  });
});
