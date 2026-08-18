// test/fixtures/regression/index.ts
export const REGRESSION_FIXTURES = {
  // 1. SS2022 真实测试节点（16字节base64 key）
  ss2022: 'ss://' + Buffer.from('2022-blake3-aes-128-gcm:dGVzdDEyMzQ1Njc4OTAxMg==').toString('base64') + '@2.2.2.2:8443/?udp-over-tcp=true&udp-over-tcp-version=2#%E9%A6%99%E6%B8%AF%20SS2022%20Regression',

  // 2. SS SIP002 带 v2ray-plugin 插件与复杂 URI query
  ss_plugin: 'ss://' + Buffer.from('chacha20-ietf-poly1305:secret_pass_123').toString('base64') + '@1.2.3.4:8388/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.domain.com%3Bpath%3D%2Fws%3Btls&udp-over-tcp=1#%E6%97%A5%E6%9C%AC%20SS%20v2ray-plugin',

  // 3. VLESS Reality + Vision + xudp + 复杂 query
  vless_reality: 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=yahoo.com&fp=chrome&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY&sid=1a2b3c4d&spx=%2Ftest&type=tcp&packetEncoding=xudp&customParam=preserveMe#%E6%96%B0%E5%8A%A0%E5%9坡%20VLESS%20Reality',

  // 4. VLESS XHTTP (splithttp)
  vless_xhttp: 'vless://c921381d-6324-4d53-ad4f-8cda48b30822@5.6.7.8:443?type=xhttp&security=tls&path=%2Fxhttp-path&host=xhttp.example.com&mode=stream-up&extra=xhttp-extra#%E7%BE%8E%E5%9B%BD%20VLESS%20XHTTP',

  // 5. VMess 自定义 aid=64, packetEncoding 与 globalPadding
  vmess_custom_aid: 'vmess://' + Buffer.from(JSON.stringify({
    v: '2',
    ps: '德国 VMess aid=64',
    add: '9.8.7.6',
    port: 443,
    id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
    aid: 64,
    scy: 'auto',
    net: 'ws',
    type: 'none',
    host: 'de.example.com',
    path: '/vmessws',
    tls: 'tls',
    sni: 'de.example.com',
    alpn: 'h2,http/1.1',
    fp: 'chrome',
    packetEncoding: 'packet'
  })).toString('base64'),

  // 6. Hysteria 2 真实多端口、obfs-salamander 与参数
  hy2_provider: 'hysteria2://provider_pass_123@[2001:db8::1]:443?sni=hy2.provider.com&obfs=salamander&obfs-password=obfspass123&obfs-min-packet-size=64&obfs-max-packet-size=1024&ports=20000-30000&hop-interval=30&up=100&down=500&alpn=h3&fp=chrome&skip-cert-verify=true#%E6%B3%95%E5%9B%BD%20HY2%20Provider',

  // 7. AnyTLS 官方规范格式 (无 Reality，含官方 sni & insecure)
  anytls_official: 'anytls://any_pass_999@anytls.provider.com:8443?sni=anytls.provider.com&insecure=1&alpn=h2,http/1.1&client-fingerprint=chrome&idle-session-timeout=60#%E9%A6%96%E5%B0%94%20AnyTLS%20Official',

  // 8. Clash YAML 带特殊符号密码与多传输
  clash_special_pass: `
proxies:
  - name: "Clash Special Characters Node"
    type: ss
    server: 8.8.8.8
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: "p@ss%2Fwith+symbols=456&special=true"
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: clash.domain.com
`
};
