// test/query_reader_and_aliases.test.ts
import { describe, expect, test } from 'bun:test';
import { QueryParamReader, parseRawQuery, getQueryBool, getQueryParam } from '../src/utils';
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

  test('2. QueryParamReader: Strict getInt & getBool and invalidParams tracking', () => {
    const raw = 'port=8443&badNum=30abc&bool1=1&bool2=true&bool3=True&bool4=false&bool5=0&bool6=other&bool7=abc';
    const rawQuery = parseRawQuery(raw);
    const q = new QueryParamReader(rawQuery.entries);

    // Valid integer
    expect(q.getInt('port')).toBe(8443);

    // Invalid integer (e.g. 30abc) must return undefined and be tracked in invalidParams
    expect(q.getInt('badNum')).toBeUndefined();
    expect(q.getInt('nonexistent')).toBeUndefined();

    // Valid booleans
    expect(q.getBool('bool1')).toBe(true);
    expect(q.getBool('bool2')).toBe(true);
    expect(q.getBool('bool3')).toBe(true);
    expect(q.getBool('bool4')).toBe(false);
    expect(q.getBool('bool5')).toBe(false);

    // Invalid booleans (e.g. other, abc) must return undefined and be tracked in invalidParams
    expect(q.getBool('bool6')).toBeUndefined();
    expect(q.getBool('bool7')).toBeUndefined();
    expect(q.getBool('nonexistent')).toBeUndefined();

    const invalidParams = q.getInvalidParams();
    expect(invalidParams.length).toBe(3);
    expect(invalidParams.some(p => p.key === 'badNum' && p.value === '30abc')).toBe(true);
    expect(invalidParams.some(p => p.key === 'bool6' && p.value === 'other')).toBe(true);
    expect(invalidParams.some(p => p.key === 'bool7' && p.value === 'abc')).toBe(true);
  });

  test('3. Compatibility Gate: Non-critical invalid parameters trigger lossy=true / warning and are not silently consumed', () => {
    // VLESS with invalid boolean insecure=abc
    const uri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&sni=example.com&insecure=abc#Invalid%20Insecure';
    const node = parseSingleNode(uri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.skipCertVerify).toBeUndefined();
    expect(node!.protocolData.invalidParams?.length).toBe(1);
    expect(node!.protocolData.invalidParams![0]!.key).toBe('insecure');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(true);
    expect(res.emitted).toBe(true);
    expect(res.unsupportedParams).toContain('insecure');
    expect(res.warnings.some(w => w.field === 'insecure' && w.message.includes('不是合法的布尔值'))).toBe(true);
  });

  test('4. Hysteria 2: Invalid hop-interval (e.g. 30abc) triggers warning and is not guessed as 30', () => {
    const hy2Uri = 'hysteria2://pass@1.2.3.4:443?sni=example.com&hop-interval=30abc#HY2%20Bad%20Hop';
    const node = parseSingleNode(hy2Uri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.hopInterval).toBeUndefined();
    expect(node!.protocolData.invalidParams?.length).toBe(1);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(true);
    expect(res.emitted).toBe(true);
    expect(res.config!['hop-interval']).toBeUndefined();
    expect(res.unsupportedParams).toContain('hop-interval');
    expect(res.warnings.some(w => w.field === 'hop-interval' && w.message.includes('不是合法的整数'))).toBe(true);
  });

  test('5. Hysteria 2 Fingerprint Tightening: fp=chrome is NOT treated as certificate SHA256 pin', () => {
    const hy2FpUri = 'hysteria2://pass@1.2.3.4:443?sni=example.com&fp=chrome#HY2%20uTLS%20FP';
    const node = parseSingleNode(hy2FpUri);
    expect(node).not.toBeNull();
    // fp should NOT be parsed into certificateFingerprint
    expect(node!.protocolData.certificateFingerprint).toBeUndefined();
    // fp should remain in extras
    expect(node!.protocolData.extras).toHaveProperty('fp', 'chrome');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(true);
    expect(res.emitted).toBe(true);
    expect(res.config!.fingerprint).toBeUndefined();
    expect(res.unsupportedParams).toContain('fp');
    expect(res.warnings.some(w => w.field === 'fp')).toBe(true);
  });

  test('6. Hysteria 2: Valid and Invalid pinSHA256 behavior', () => {
    // Valid 64-hex SHA-256 certificate pin
    const validSha = '3697e0996f7c813a40879555c2ff1b0689b919fb9a6e3db98f8021c33be8b3be';
    const hy2ValidPin = `hysteria2://pass@1.2.3.4:443?sni=example.com&pinSHA256=${validSha}#HY2%20Valid%20Pin`;
    const nodeValid = parseSingleNode(hy2ValidPin);
    expect(nodeValid).not.toBeNull();
    expect(nodeValid!.protocolData.certificateFingerprint).toBe(validSha);

    const resValid = adaptNodeToMihomo(nodeValid!);
    expect(resValid.fatal).toBe(false);
    expect(resValid.lossy).toBe(false);
    expect(resValid.emitted).toBe(true);
    expect(resValid.config!.fingerprint).toBe(validSha);

    // Invalid SHA-256 (e.g. not 64 hex characters)
    const hy2BadPin = 'hysteria2://pass@1.2.3.4:443?sni=example.com&pinSHA256=not_a_valid_sha256#HY2%20Bad%20Pin';
    const nodeBad = parseSingleNode(hy2BadPin);
    expect(nodeBad).not.toBeNull();

    const resBad = adaptNodeToMihomo(nodeBad!);
    expect(resBad.fatal).toBe(false);
    expect(resBad.lossy).toBe(true);
    expect(resBad.unsupportedParams).toContain('pinSHA256');
    expect(resBad.warnings.some(w => w.field === 'pinSHA256' && w.message.includes('64 位十六进制'))).toBe(true);
  });

  test('7. Hysteria 2 Gecko: obfs=gecko with packet size options produces valid Mihomo proxy', () => {
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

  test('8. VLESS Reality: all lowercase/snake_case aliases map correctly and avoid false Gate clean/warning', () => {
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

  test('9. Shadowsocks & TUIC: boolean / integer aliases map correctly', () => {
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

    const tuicUri = 'tuic://my_uuid:my_pass@1.2.3.4:8443?congestion_control=cubic&udp_relay_mode=quic&zero_rtt_handshake=1&server_name=tuic.example.com#TUIC%20Aliases';
    const tuicNode = parseSingleNode(tuicUri);
    expect(tuicNode).not.toBeNull();
    expect(tuicNode!.protocolData.congestionControl).toBe('cubic');
    expect(tuicNode!.protocolData.udpRelayMode).toBe('quic');
    expect(tuicNode!.protocolData.zeroRttHandshake).toBe(true);
    expect(tuicNode!.protocolData.sni).toBe('tuic.example.com');
    expect(Object.keys(tuicNode!.protocolData.extras).length).toBe(0);

    const tuicRes = adaptNodeToMihomo(tuicNode!);
    expect(tuicRes.fatal).toBe(false);
    expect(tuicRes.lossy).toBe(false);
    expect(tuicRes.config!['congestion-controller']).toBe('cubic');
    expect(tuicRes.config!['udp-relay-mode']).toBe('quic');
    expect(tuicRes.config!['zero-rtt-handshake']).toBe(true);
    expect(tuicRes.config!.sni).toBe('tuic.example.com');
  });

  test('10. Multi-protocol invalid parameter behavior: Shadowsocks, TUIC, Trojan, AnyTLS', () => {
    // Shadowsocks: invalid udp_over_tcp=abc and invalid udp_over_tcp_version=verX
    const ssBad = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388?udp_over_tcp=abc&udp_over_tcp_version=verX#SS%20Bad';
    const ssNode = parseSingleNode(ssBad);
    expect(ssNode).not.toBeNull();
    const ssRes = adaptNodeToMihomo(ssNode!);
    expect(ssRes.fatal).toBe(false);
    expect(ssRes.lossy).toBe(true);
    expect(ssRes.unsupportedParams).toContain('udp_over_tcp');
    expect(ssRes.unsupportedParams).toContain('udp_over_tcp_version');

    // TUIC: invalid zero_rtt_handshake=notBool
    const tuicBad = 'tuic://my_uuid:my_pass@1.2.3.4:8443?zero_rtt_handshake=notBool#TUIC%20Bad';
    const tuicNode = parseSingleNode(tuicBad);
    expect(tuicNode).not.toBeNull();
    const tuicRes = adaptNodeToMihomo(tuicNode!);
    expect(tuicRes.fatal).toBe(false);
    expect(tuicRes.lossy).toBe(true);
    expect(tuicRes.unsupportedParams).toContain('zero_rtt_handshake');

    // Trojan: invalid allowInsecure=notABool
    const trojanBad = 'trojan://pass@1.2.3.4:443?allowInsecure=notABool#Trojan%20Bad';
    const trojanNode = parseSingleNode(trojanBad);
    expect(trojanNode).not.toBeNull();
    const trojanRes = adaptNodeToMihomo(trojanNode!);
    expect(trojanRes.fatal).toBe(false);
    expect(trojanRes.lossy).toBe(true);
    expect(trojanRes.unsupportedParams).toContain('allowInsecure');

    // AnyTLS: invalid insecure=badBool
    const anytlsBad = 'anytls://pass@1.2.3.4:443?insecure=badBool#AnyTLS%20Bad';
    const anytlsNode = parseSingleNode(anytlsBad);
    expect(anytlsNode).not.toBeNull();
    const anytlsRes = adaptNodeToMihomo(anytlsNode!);
    expect(anytlsRes.fatal).toBe(false);
    expect(anytlsRes.lossy).toBe(true);
    expect(anytlsRes.unsupportedParams).toContain('insecure');
  });

  test('11. UI Warning text verification', () => {
    const html = renderHtmlPage('3.0.0-hardened');
    expect(html).toContain('节点仍输出到最终配置中');
    expect(html).toContain('存在未映射参数，可能影响连接语义，请根据警告详情确认');
    expect(html).not.toContain('已自动剔除未映射参数以确保连接不报错');
  });

  test('12. Transport AST parity: Trojan H2/HTTP, Shadowsocks smux, VLESS/Trojan headerType & mode', () => {
    // Trojan H2
    const trojanH2 = 'trojan://trojan_pass@1.2.3.4:443?type=h2&path=%2Fh2path&host=h2.example.com#Trojan%20H2';
    const trojanH2Node = parseSingleNode(trojanH2);
    expect(trojanH2Node).not.toBeNull();
    expect(trojanH2Node!.protocolData.transport?.type).toBe('h2');
    expect(trojanH2Node!.protocolData.transport?.path).toBe('/h2path');
    expect(trojanH2Node!.protocolData.transport?.headers?.Host).toBe('h2.example.com');
    const trojanH2Res = adaptNodeToMihomo(trojanH2Node!);
    expect(trojanH2Res.fatal).toBe(false);
    expect(trojanH2Res.lossy).toBe(false);
    expect(trojanH2Res.config!['h2-opts']).toEqual({
      host: ['h2.example.com'],
      path: '/h2path'
    });

    // Shadowsocks smux
    const ssSmux = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388?smux=true#SS%20Smux';
    const ssSmuxNode = parseSingleNode(ssSmux);
    expect(ssSmuxNode).not.toBeNull();
    expect(ssSmuxNode!.protocolData.smux).toEqual({ enabled: true });
    const ssSmuxRes = adaptNodeToMihomo(ssSmuxNode!);
    expect(ssSmuxRes.fatal).toBe(false);
    expect(ssSmuxRes.lossy).toBe(false);
    expect(ssSmuxRes.config!.smux).toEqual({ enabled: true });

    // VLESS transport headerType & authority
    const vlessProto = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=grpc&serviceName=my-service&mode=gun&authority=grpc.example.com&headerType=none#VLESS%20Transport%20Parity';
    const vlessNode = parseSingleNode(vlessProto);
    expect(vlessNode).not.toBeNull();
    expect(vlessNode!.protocolData.transport?.mode).toBe('gun');
    expect(vlessNode!.protocolData.transport?.authority).toBe('grpc.example.com');
    expect(vlessNode!.protocolData.transport?.headerType).toBe('none');
    const vlessRes = adaptNodeToMihomo(vlessNode!);
    expect(vlessRes.fatal).toBe(false);
    expect(vlessRes.lossy).toBe(false);
    expect(vlessRes.warnings.length).toBe(0);
  });
});
