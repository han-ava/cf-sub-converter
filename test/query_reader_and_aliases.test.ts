// test/query_reader_and_aliases.test.ts
import { describe, expect, test } from 'bun:test';
import { QueryParamReader, parseRawQuery, getQueryBool, getQueryParam, parsePositiveIntOrRange, JsonFieldReader } from '../src/utils';
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

    // Invalid SHA-256 (e.g. not 64 hex characters) must be fatal (certificate pinning failure)
    const hy2BadPin = 'hysteria2://pass@1.2.3.4:443?sni=example.com&pinSHA256=not_a_valid_sha256#HY2%20Bad%20Pin';
    const nodeBad = parseSingleNode(hy2BadPin);
    expect(nodeBad).not.toBeNull();

    const resBad = adaptNodeToMihomo(nodeBad!);
    expect(resBad.fatal).toBe(true);
    expect(resBad.lossy).toBe(true);
    expect(resBad.emitted).toBe(false);
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

    // TUIC V5
    const tuicUri = 'tuic://my_uuid:my_pass@1.2.3.4:8443?congestion_control=cubic&udp_relay_mode=quic&zero_rtt_handshake=1&server_name=tuic.example.com#TUIC%20V5%20Aliases';
    const tuicNode = parseSingleNode(tuicUri);
    expect(tuicNode).not.toBeNull();
    expect(tuicNode!.protocolData.uuid).toBe('my_uuid');
    expect(tuicNode!.protocolData.password).toBe('my_pass');
    expect(tuicNode!.protocolData.congestionController).toBe('cubic');
    expect(tuicNode!.protocolData.udpRelayMode).toBe('quic');
    expect(tuicNode!.protocolData.reduceRtt).toBe(true);
    expect(tuicNode!.protocolData.sni).toBe('tuic.example.com');
    expect(Object.keys(tuicNode!.protocolData.extras).length).toBe(0);

    const tuicRes = adaptNodeToMihomo(tuicNode!);
    expect(tuicRes.fatal).toBe(false);
    expect(tuicRes.lossy).toBe(false);
    expect(tuicRes.config!.uuid).toBe('my_uuid');
    expect(tuicRes.config!.password).toBe('my_pass');
    expect(tuicRes.config!['congestion-controller']).toBe('cubic');
    expect(tuicRes.config!['udp-relay-mode']).toBe('quic');
    expect(tuicRes.config!['reduce-rtt']).toBe(true);
    expect(tuicRes.config!.sni).toBe('tuic.example.com');

    // TUIC V4
    const tuicV4Uri = 'tuic://my_token@1.2.3.4:8443?congestion_controller=bbr#TUIC%20V4';
    const tuicV4Node = parseSingleNode(tuicV4Uri);
    expect(tuicV4Node).not.toBeNull();
    const tuicV4Res = adaptNodeToMihomo(tuicV4Node!);
    expect(tuicV4Res.fatal).toBe(false);
    expect(tuicV4Res.config!.token).toBe('my_token');
    expect(tuicV4Res.config!.uuid).toBeUndefined();
    expect(tuicV4Res.config!.password).toBeUndefined();
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

  test('12. Transport Gate: Trojan H2/HTTP is fatal, Shadowsocks smux & plugins, VLESS transport parity', () => {
    // Trojan H2 is NOT supported by Mihomo Trojan (must be fatal)
    const trojanH2 = 'trojan://trojan_pass@1.2.3.4:443?type=h2&path=%2Fh2path&host=h2.example.com#Trojan%20H2';
    const trojanH2Node = parseSingleNode(trojanH2);
    expect(trojanH2Node).not.toBeNull();
    const trojanH2Res = adaptNodeToMihomo(trojanH2Node!);
    expect(trojanH2Res.fatal).toBe(true);
    expect(trojanH2Res.emitted).toBe(false);
    expect(trojanH2Res.unsupportedParams).toContain('transport.type');

    // Shadowsocks smux
    const ssSmux = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388?smux=true#SS%20Smux';
    const ssSmuxNode = parseSingleNode(ssSmux);
    expect(ssSmuxNode).not.toBeNull();
    expect(ssSmuxNode!.protocolData.smux).toEqual({ enabled: true });
    const ssSmuxRes = adaptNodeToMihomo(ssSmuxNode!);
    expect(ssSmuxRes.fatal).toBe(false);
    expect(ssSmuxRes.lossy).toBe(false);
    expect(ssSmuxRes.config!.smux).toEqual({ enabled: true });

    // Shadowsocks plugin normalization: obfs-local -> obfs
    const ssObfsLocal = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388?plugin=obfs-local%3Bobfs%3Dhttp#SS%20ObfsLocal';
    const ssObfsLocalNode = parseSingleNode(ssObfsLocal);
    expect(ssObfsLocalNode).not.toBeNull();
    const ssObfsRes = adaptNodeToMihomo(ssObfsLocalNode!);
    expect(ssObfsRes.fatal).toBe(false);
    expect(ssObfsRes.config!.plugin).toBe('obfs');

    // Shadowsocks plugin: gost-plugin & jls
    const ssGost = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388?plugin=gost-plugin#SS%20Gost';
    const ssGostNode = parseSingleNode(ssGost);
    const ssGostRes = adaptNodeToMihomo(ssGostNode!);
    expect(ssGostRes.fatal).toBe(false);
    expect(ssGostRes.config!.plugin).toBe('gost-plugin');

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

  test('13. Strict URI Endpoint & Port validation: 443abc must fail and trigger fatal gate', () => {
    const badPortUri = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443abc?security=tls#Bad%20Port';
    const node = parseSingleNode(badPortUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.invalidParams?.some(p => p.key === 'port')).toBe(true);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.warnings.some(w => w.field === 'port' && w.level === 'fatal')).toBe(true);
  });

  test('14. VMess JsonFieldReader strictness: malformed alterId & boolean flags trigger gate invalidParams', () => {
    // Malformed alterId "1abc" in VMess JSON
    const vmessObj = {
      v: '2',
      ps: 'VMess Strict Test',
      add: '1.2.3.4',
      port: '443',
      id: 'b831381d-6324-4d53-ad4f-8cda48b30811',
      aid: '1abc',
      net: 'ws',
      globalPadding: 'notABool'
    };
    const b64 = btoa(JSON.stringify(vmessObj));
    const uri = `vmess://${b64}`;
    const node = parseSingleNode(uri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.invalidParams?.some(p => p.key === 'aid')).toBe(true);
    expect(node!.protocolData.invalidParams?.some(p => p.key === 'globalPadding')).toBe(true);

    const res = adaptNodeToMihomo(node!);
    // aid is a critical key in VMess -> triggers fatal
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
  });

  test('15. Hysteria 2 invalid pinSHA256 triggers fatal gate', () => {
    // Non-64 hex pinSHA256
    const invalidFpUri = 'hysteria2://my_password@1.2.3.4:443?pinSHA256=invalid-fingerprint-not-64-hex#HY2%20Bad%20Pin';
    const node = parseSingleNode(invalidFpUri);
    expect(node).not.toBeNull();
    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
    expect(res.unsupportedParams).toContain('pinSHA256');

    // Valid 64-hex pinSHA256 passes
    const validFpUri = 'hysteria2://my_password@1.2.3.4:443?pinSHA256=f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f#HY2%20Good%20Pin';
    const validNode = parseSingleNode(validFpUri);
    expect(validNode).not.toBeNull();
    const validRes = adaptNodeToMihomo(validNode!);
    expect(validRes.fatal).toBe(false);
    expect(validRes.emitted).toBe(true);
    expect(validRes.config!.fingerprint).toBe('f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f');
  });

  test('16. TUIC V4 vs V5 credential mutual exclusion and completeness gate', () => {
    // V5 with only UUID (missing password) -> fatal
    const tuicOnlyUuidUri = 'tuic://my_uuid@1.2.3.4:8443?uuid=my_uuid#TUIC%20Only%20UUID';
    const node1 = parseSingleNode(tuicOnlyUuidUri);
    expect(node1).not.toBeNull();
    const res1 = adaptNodeToMihomo(node1!);
    expect(res1.fatal).toBe(true);
    expect(res1.emitted).toBe(false);

    // V4 and V5 conflict (token + password) -> fatal
    const tuicConflictUri = 'tuic://my_token:my_pass@1.2.3.4:8443?token=my_token&password=my_pass#TUIC%20Conflict';
    const node2 = parseSingleNode(tuicConflictUri);
    expect(node2).not.toBeNull();
    const res2 = adaptNodeToMihomo(node2!);
    expect(res2.fatal).toBe(true);
    expect(res2.emitted).toBe(false);
  });

  test('17. VMess host / SNI isolation & strict TLS validation', () => {
    // host=cdn.example.com without sni -> SNI must fallback to server (origin.example.com), NOT host!
    const vmessObj = {
      v: '2',
      ps: 'VMess Host SNI Isolation',
      add: 'origin.example.com',
      port: 443,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
      net: 'ws',
      host: 'cdn.example.com',
      tls: 'tls'
    };
    const uri = `vmess://${btoa(JSON.stringify(vmessObj))}`;
    const node = parseSingleNode(uri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.sni).toBe('origin.example.com');
    expect(node!.protocolData.transport?.headers?.Host).toBe('cdn.example.com');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!.servername).toBe('origin.example.com');
    expect(res.config!['ws-opts'].headers.Host).toBe('cdn.example.com');

    // Invalid TLS string "abc" triggers fatal gate
    const badTlsObj = {
      ...vmessObj,
      tls: 'abc'
    };
    const badTlsUri = `vmess://${btoa(JSON.stringify(badTlsObj))}`;
    const badNode = parseSingleNode(badTlsUri);
    expect(badNode).not.toBeNull();
    expect(badNode!.protocolData.invalidParams?.some(p => p.key === 'tls')).toBe(true);
    const badRes = adaptNodeToMihomo(badNode!);
    expect(badRes.fatal).toBe(true);
    expect(badRes.emitted).toBe(false);
  });

  test('18. SS plugin-opts preserve raw string passwords without guessing numbers', () => {
    // password="123456" in plugin-opts must stay string "123456"
    const ssUri = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388/?plugin=shadow-tls%3Bpassword%3D123456%3Bsni%3Dexample.com%3Bversion%3D3#SS%20Plugin%20Opts';
    const node = parseSingleNode(ssUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.pluginOpts?.password).toBe('123456');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!['plugin-opts'].password).toBe('123456');
    expect(res.config!['plugin-opts'].version).toBe(3);
    expect(typeof res.config!['plugin-opts'].password).toBe('string');
    expect(typeof res.config!['plugin-opts'].version).toBe('number');
  });

  test('19. HY2 hop-interval random range and obfs-salamander packet size warnings', () => {
    // hop-interval=15-30
    const hy2Uri = 'hysteria2://pass@1.2.3.4:443?hop-interval=15-30&obfs=salamander&obfs-min-packet-size=64#HY2%20Hop';
    const node = parseSingleNode(hy2Uri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.hopInterval).toBe('15-30');

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.config!['hop-interval']).toBe('15-30');
    // obfs-min-packet-size must be stripped for salamander
    expect(res.config!['obfs-min-packet-size']).toBeUndefined();
    expect(res.unsupportedParams).toContain('obfs-min-packet-size');

    // Invalid hop-interval 30abc -> invalidParams
    const badHopUri = 'hysteria2://pass@1.2.3.4:443?hop-interval=30abc#HY2%20Bad%20Hop';
    const badNode = parseSingleNode(badHopUri);
    expect(badNode).not.toBeNull();
    expect(badNode!.protocolData.invalidParams?.some(p => p.key === 'hop-interval')).toBe(true);
  });

  test('20. Protocol Enum validation Gates: TUIC, VMess, VLESS', () => {
    // TUIC: invalid congestion-controller
    const tuicBad = 'tuic://my_uuid:my_pass@1.2.3.4:8443?congestion_controller=invalid_cc#TUIC%20Bad%20CC';
    const tuicNode = parseSingleNode(tuicBad);
    expect(tuicNode).not.toBeNull();
    expect(tuicNode!.protocolData.invalidParams?.some(p => p.key === 'congestion_controller')).toBe(true);

    // VMess: invalid cipher
    const vmessBad = {
      v: '2',
      ps: 'VMess Bad Cipher',
      add: '1.2.3.4',
      port: 443,
      id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
      scy: 'unsupported-cipher'
    };
    const vmessNode = parseSingleNode(`vmess://${btoa(JSON.stringify(vmessBad))}`);
    expect(vmessNode).not.toBeNull();
    expect(vmessNode!.protocolData.invalidParams?.some(p => p.key === 'scy')).toBe(true);
    const vmessRes = adaptNodeToMihomo(vmessNode!);
    expect(vmessRes.fatal).toBe(true); // cipher/scy is critical

    // VLESS: invalid flow
    const vlessBad = 'vless://a3d9059f-7db9-4674-8be0-b530263f848a@1.2.3.4:443?flow=invalid-flow#VLESS%20Bad%20Flow';
    const vlessNode = parseSingleNode(vlessBad);
    expect(vlessNode).not.toBeNull();
    expect(vlessNode!.protocolData.invalidParams?.some(p => p.key === 'flow')).toBe(true);
  });

  test('21. AnyTLS Reality full alias rejection Gate', () => {
    const realityAliases = [
      'anytls://pass@1.2.3.4:8443?security=reality#AnyTLS%20Reality%201',
      'anytls://pass@1.2.3.4:8443?pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY#AnyTLS%20Reality%202',
      'anytls://pass@1.2.3.4:8443?reality-opts=some-opts#AnyTLS%20Reality%203',
      'anytls://pass@1.2.3.4:8443?publicKey=some-pubkey#AnyTLS%20Reality%204',
      'anytls://pass@1.2.3.4:8443?spiderX=%2F#AnyTLS%20Reality%205'
    ];

    for (const uri of realityAliases) {
      const node = parseSingleNode(uri);
      expect(node).not.toBeNull();
      const res = adaptNodeToMihomo(node!);
      expect(res.fatal).toBe(true);
      expect(res.emitted).toBe(false);
      expect(res.warnings.some(w => w.field === 'reality' && w.level === 'fatal')).toBe(true);
    }
  });

  test('22. parseStrictEndpoint: Unbracketed IPv6 with multiple colons must return strict error', () => {
    // Unbracketed IPv6 like 2001:db8::1 must NOT be parsed as host="2001:db8:" and port=1
    const unbracketedUri = 'vless://a3d9059f-7db9-4674-8be0-b530263f848a@2001:db8::1#Unbracketed%20IPv6';
    const node = parseSingleNode(unbracketedUri);
    expect(node).not.toBeNull();
    expect(node!.protocolData.invalidParams?.some(p => p.key === 'port')).toBe(true);

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(true);
    expect(res.emitted).toBe(false);
  });

  test('23. VLESS flow normalization & strict packet-encoding gating', () => {
    // 1. flow: xtls-rprx-vision-udp443 normalized to xtls-rprx-vision in Mihomo
    const uri1 = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=reality&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY&flow=xtls-rprx-vision-udp443&packet-encoding=packetaddr#VLESS%20Flow%20Normalize';
    const node1 = parseSingleNode(uri1);
    expect(node1).not.toBeNull();
    expect(node1!.protocolData.flow).toBe('xtls-rprx-vision-udp443');
    expect(node1!.protocolData.packetEncoding).toBe('packetaddr');

    const res1 = adaptNodeToMihomo(node1!);
    expect(res1.fatal).toBe(false);
    expect(res1.config!.flow).toBe('xtls-rprx-vision');
    expect(res1.config!['packet-encoding']).toBe('packetaddr');

    // 2. packet-encoding: legacy "packet" rejected into invalidParams
    const uri2 = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?security=tls&packet-encoding=packet#VLESS%20Legacy%20Packet';
    const node2 = parseSingleNode(uri2);
    expect(node2).not.toBeNull();
    expect(node2!.protocolData.invalidParams?.some(p => p.key === 'packet-encoding' && p.value === 'packet')).toBe(true);
    expect(node2!.protocolData.packetEncoding).toBeUndefined();

    const res2 = adaptNodeToMihomo(node2!);
    expect(res2.fatal).toBe(false);
    expect(res2.lossy).toBe(true);
    expect(res2.config!['packet-encoding']).toBeUndefined();
    expect(res2.unsupportedParams).toContain('packet-encoding');
  });

  test('24. XHTTP nested downloadSettings JsonFieldReader strict parsing', () => {
    // Nested downloadSettings inside XHTTP extra with strict types
    const extraObj = {
      downloadSettings: {
        server: 'dl.example.com',
        port: 8443,
        security: 'tls',
        tlsSettings: {
          serverName: 'sni.dl.example.com',
          allowInsecure: true,
          fingerprint: 'chrome',
          alpn: ['h2', 'http/1.1']
        },
        xhttpSettings: {
          path: '/dl-path',
          host: 'dl-host.example.com',
          mode: 'stream-up'
        }
      }
    };
    const uri = `vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=xhttp&path=%2Fmain&extra=${encodeURIComponent(JSON.stringify(extraObj))}#XHTTP%20Strict%20DL`;
    const node = parseSingleNode(uri);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.emitted).toBe(true);
    expect(res.config!['xhttp-opts']).toBeDefined();
    const dl = res.config!['xhttp-opts']['download-settings'];
    expect(dl).toBeDefined();
    expect(dl.server).toBe('dl.example.com');
    expect(dl.port).toBe(8443);
    expect(dl.tls).toBe(true);
    expect(dl.servername).toBe('sni.dl.example.com');
    expect(dl['skip-cert-verify']).toBe(true);
    expect(dl['client-fingerprint']).toBe('chrome');
    expect(dl.alpn).toEqual(['h2', 'http/1.1']);
    expect(dl.path).toBe('/dl-path');
    expect(dl.host).toBe('dl-host.example.com');
    expect(dl.mode).toBe('stream-up');

    // Invalid port in downloadSettings
    const badExtra = {
      downloadSettings: {
        server: 'dl.example.com',
        port: '443abc',
        tlsSettings: {
          allowInsecure: 'false' // String 'false' -> not true!
        }
      }
    };
    const badUri = `vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=xhttp&extra=${encodeURIComponent(JSON.stringify(badExtra))}#XHTTP%20Bad%20DL`;
    const badNode = parseSingleNode(badUri);
    expect(badNode).not.toBeNull();

    const badRes = adaptNodeToMihomo(badNode!);
    expect(badRes.fatal).toBe(false);
    expect(badRes.lossy).toBe(true);
    const badDl = badRes.config!['xhttp-opts']['download-settings'];
    expect(badDl.port).toBeUndefined(); // 443abc not coerced to 443
    expect(badDl['skip-cert-verify']).toBeUndefined(); // allowInsecure="false" not coerced to true
  });

  test('25. AnyTLS: Non-standard URI without auth@host is rejected by parser', () => {
    // Official spec: anytls://[auth@]hostname[:port]/?...
    // Base64 encoded payload without @ must return null directly
    const invalidAnytlsUri = 'anytls://YW55X3Bhc3N3b3JkXzEyM0Bhbnl0bHMuZXhhbXBsZS5jb206ODQ0Mw#NonStandard%20Base64';
    const node = parseSingleNode(invalidAnytlsUri);
    expect(node).toBeNull();

    // Standard AnyTLS with @ passes
    const validAnytlsUri = 'anytls://any_password_123@anytls.example.com:8443?sni=anytls.example.com#Valid%20AnyTLS';
    const validNode = parseSingleNode(validAnytlsUri);
    expect(validNode).not.toBeNull();
    expect(validNode!.protocolData.password).toBe('any_password_123');
  });

  test('26. Shadowsocks plugin-opts type mismatch gating', () => {
    // plugin-opts with invalid boolean tls=abc and invalid integer mtu=xyz
    const ssBadOptsUri = 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpteXBhc3N3b3JkMTIzIQ@1.2.3.4:8388/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Btls%3Dabc%3Bmtu%3Dxyz#SS%20Bad%20Plugin%20Opts';
    const node = parseSingleNode(ssBadOptsUri);
    expect(node).not.toBeNull();

    const res = adaptNodeToMihomo(node!);
    expect(res.fatal).toBe(false);
    expect(res.lossy).toBe(true);
    // Malformed types should be excluded from yaml plugin-opts and reported in unsupportedParams
    expect(res.config!['plugin-opts'].tls).toBeUndefined();
    expect(res.config!['plugin-opts'].mtu).toBeUndefined();
    expect(res.config!['plugin-opts'].mode).toBe('websocket');
    expect(res.unsupportedParams).toContain('plugin-opts.tls');
    expect(res.unsupportedParams).toContain('plugin-opts.mtu');
    expect(res.warnings.some(w => w.field === 'plugin-opts.tls')).toBe(true);
    expect(res.warnings.some(w => w.field === 'plugin-opts.mtu')).toBe(true);
  });

  test('27. parsePositiveIntOrRange, JsonFieldReader & QueryParamReader getIntOrRange tests', () => {
    // 1. parsePositiveIntOrRange unit tests
    expect(parsePositiveIntOrRange(600)).toEqual({ value: 600 });
    expect(parsePositiveIntOrRange('600')).toEqual({ value: 600 });
    expect(parsePositiveIntOrRange('600-900')).toEqual({ value: '600-900' });
    expect(parsePositiveIntOrRange(' 16 - 32 ')).toEqual({ value: '16-32' });
    expect(parsePositiveIntOrRange(0)).toEqual({ value: 0 });
    expect(parsePositiveIntOrRange('0')).toEqual({ value: 0 });
    expect(parsePositiveIntOrRange('0-100')).toEqual({ value: '0-100' });

    // Invalid values
    expect(parsePositiveIntOrRange(1.5).error).toBeDefined();
    expect(parsePositiveIntOrRange(-5).error).toBeDefined();
    expect(parsePositiveIntOrRange('-5').error).toBeDefined();
    expect(parsePositiveIntOrRange('900-600').error).toBeDefined(); // min > max
    expect(parsePositiveIntOrRange('abc').error).toBeDefined();
    expect(parsePositiveIntOrRange('1-2-3').error).toBeDefined();

    // 2. JsonFieldReader getIntOrRange
    const jr = new JsonFieldReader({
      sessionIDLength: '16-32',
      sessionLenInt: 16,
      hMaxReq: '600-900',
      badRange: '900-600',
      badStr: 'abc'
    });
    expect(jr.getIntOrRange('session-length', 'sessionIDLength')).toBe('16-32');
    expect(jr.getIntOrRange('sessionLenInt')).toBe(16);
    expect(jr.getIntOrRange('hMaxReq')).toBe('600-900');
    expect(jr.getIntOrRange('badRange')).toBeUndefined();
    expect(jr.getIntOrRange('badStr')).toBeUndefined();
    expect(jr.getInvalidFields().length).toBe(2);

    // 3. QueryParamReader getIntOrRange
    const qr = new QueryParamReader([
      { key: 'session-length', value: '16-32' },
      { key: 'concurrency', value: '5-10' },
      { key: 'bad', value: 'invalid-val' }
    ]);
    expect(qr.getIntOrRange('session-length')).toBe('16-32');
    expect(qr.getIntOrRange('concurrency')).toBe('5-10');
    expect(qr.getIntOrRange('bad')).toBeUndefined();
    expect(qr.getInvalidParams().length).toBe(1);
  });
});
