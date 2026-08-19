// test/fixtures/nodes.ts
export const FIXTURES = {
  vless_reality: 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=yahoo.com&fp=chrome&pbk=f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY&sid=1a2b3c4d&spx=%2Ftest&type=tcp&packetEncoding=xudp&customParam=preserveMe#%E9%A6%99%E6%B8%AF%20VLESS%20Reality',
  vless_ws_ipv6: 'vless://uuid-vless-test@[2606:4700:4700::1111]:443?type=ws&security=tls&path=%2Fmyws%3Fkey%3Dval&host=cdn.example.com&sni=cdn.example.com&alpn=h2,http/1.1#%E6%97%A5%E6%9C%AC%20VLESS%20WS%20IPv6',
  vless_xhttp: 'vless://uuid-xhttp@5.6.7.8:443?type=xhttp&security=tls&path=%2Fxhttp-path&host=xhttp.example.com&mode=stream-up&extra=xhttp-extra#VLESS%20XHTTP%20Node',
  
  vmess_standard: 'vmess://' + Buffer.from(JSON.stringify({
    v: '2',
    ps: '美国 VMess WS',
    add: '9.8.7.6',
    port: 443,
    id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
    aid: 64,
    scy: 'auto',
    net: 'ws',
    type: 'none',
    host: 'us.example.com',
    path: '/vmessws',
    tls: 'tls',
    sni: 'us.example.com',
    alpn: 'h2,http/1.1',
    fp: 'firefox',
    packetEncoding: 'packet'
  })).toString('base64'),

  vmess_grpc: 'vmess://' + Buffer.from(JSON.stringify({
    v: '2',
    ps: '新加坡 VMess gRPC',
    add: 'sg.example.com',
    port: 443,
    id: 'a3d9059f-7db9-4674-8be0-b530263f848a',
    aid: 0,
    scy: 'zero',
    net: 'grpc',
    path: 'vmess-grpc-service',
    tls: 'tls',
    sni: 'sg.example.com'
  })).toString('base64'),

  ss_sip002_plugin: 'ss://' + Buffer.from('chacha20-ietf-poly1305:mypassword123!').toString('base64') + '@1.1.1.1:8388/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.ss.com%3Bpath%3D%2Fssws%3Btls&udp-over-tcp=1#%E9%A6%99%E6%B8%AF%20SS%20Plugin',
  ss_ss2022: 'ss://' + Buffer.from('2022-blake3-aes-128-gcm:dGVzdDEyMzQ1Njc4OTAxMg==').toString('base64') + '@2.2.2.2:8443/?udp-over-tcp=true&udp-over-tcp-version=2#SS2022%20Node',
  ss_ipv6_legacy: 'ss://' + Buffer.from('aes-256-gcm:pass123@[2400:3200::1]:8388').toString('base64') + '#%E6%97%A5%E6%9C%AC%20SS%20IPv6',

  hy2_full: 'hysteria2://my_hy2_password@[2001:db8::1]:443?sni=hy2.example.com&obfs=salamander&obfs-password=obfspass123&ports=20000-30000&hop-interval=30&up=100&down=500&alpn=h3&pinSHA256=f451ad6bd9404ff81fde262cc8bdf9b9da1e4a357edec4c17555c6f8bf1c3e2f&skip-cert-verify=true&customHy2Param=val#%E6%B3%95%E5%9B%BD%20HY2%20Full',
  hy2_gecko: 'hysteria2://my_gecko_password@hy2gecko.example.com:443?sni=hy2gecko.example.com&obfs=gecko&obfs-password=geckopass123&obfs-min-packet-size=64&obfs-max-packet-size=1024&ports=40000-50000#%E6%97%A5%E6%9C%AC%20HY2%20Gecko',
  
  anytls_standard: 'anytls://any_pass_123@anytls.example.com:8443?sni=anytls.example.com&alpn=h2,http/1.1&client-fingerprint=chrome&idle-session-timeout=60&min-idle-session=5&skip-cert-verify=true#%E9%A6%96%E5%B0%94%20AnyTLS',

  trojan_ws: 'trojan://trojan_pass_999@3.3.3.3:443?type=ws&path=%2Ftrws&host=tr.example.com&sni=tr.example.com&alpn=h2,http/1.1&fp=safari#%E5%8F%B0%E6%B9%BE%20Trojan%20WS',
  
  tuic_standard: 'tuic://tuic-uuid-123:tuic_pass_456@4.4.4.4:8443?sni=tuic.example.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&zero_rtt_handshake=1#%E5%BE%B7%E5%9B%BD%20TUIC'
};
