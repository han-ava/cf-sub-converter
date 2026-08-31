import { describe, expect, test } from 'bun:test';
import { toLoon, toQuantumultX } from '../src/generator';
import worker from '../src/index';
import { parseSingleNode } from '../src/parser';
import { adaptNodeToTarget } from '../src/adapters/target';

const ENV = { AUTH_TOKEN: 'test-token' };
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

const SS = 'ss://' + Buffer.from('aes-128-gcm:secret').toString('base64') + '@ss.example.com:8388#SS%20Node';
const VMESS_WS_TLS = 'vmess://' + Buffer.from(JSON.stringify({
  v: '2',
  ps: 'VMess WS',
  add: 'vmess.example.com',
  port: 443,
  id: '23ad6b10-8d1a-40f7-8ad0-e3e35cd32291',
  aid: 0,
  scy: 'auto',
  net: 'ws',
  host: 'cdn.example.com',
  path: '/ws',
  tls: 'tls',
  sni: 'cdn.example.com'
})).toString('base64');
const VLESS_REALITY = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=tcp&security=reality&sni=www.example.com&pbk=publicKey&sid=0123456789abcdef&flow=xtls-rprx-vision#VLESS%20Reality';
const TROJAN_WS = 'trojan://password@trojan.example.com:443?type=ws&sni=cdn.example.com&host=cdn.example.com&path=%2Ftrojan#Trojan%20WS';
const SSR = 'ssr://' + Buffer.from('ssr.example.com:8388:origin:aes-128-cfb:plain:c2VjcmV0/?remarks=U1NSIE5vZGU').toString('base64');
const HY2 = 'hysteria2://password@hy2.example.com:443?sni=sni.example.com&insecure=1#HY2%20Node';
const VLESS_GRPC = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@1.2.3.4:443?type=grpc&security=tls&sni=example.com&serviceName=test#VLESS%20gRPC';
const HY2_OBFS = 'hysteria2://password@hy2.example.com:443?sni=sni.example.com&obfs=salamander&obfs-password=secret#HY2%20Obfs';
const VMESS_SPLIT_WSS = 'vmess://' + Buffer.from(JSON.stringify({
  v: '2',
  ps: 'Split WSS',
  add: 'vmess.example.com',
  port: 443,
  id: '23ad6b10-8d1a-40f7-8ad0-e3e35cd32291',
  aid: 0,
  net: 'ws',
  host: 'http-host.example.com',
  path: '/ws',
  tls: 'tls',
  sni: 'tls-sni.example.com'
})).toString('base64');

function nodes(...uris: string[]) {
  return uris.map(uri => parseSingleNode(uri)!);
}

async function convert(uri: string, target: string): Promise<Response> {
  const url = new URL('http://localhost/sub');
  url.searchParams.set('url', uri);
  url.searchParams.set('target', target);
  url.searchParams.set('token', 'test-token');
  url.searchParams.set('emoji', '0');
  return worker.fetch(new Request(url), ENV, CTX);
}

describe('native Quantumult X and Loon subscription targets', () => {
  test('serializes Quantumult X native server lines without a full profile wrapper', () => {
    const output = toQuantumultX(nodes(SS, VMESS_WS_TLS, VLESS_REALITY, TROJAN_WS));

    expect(output).toContain('shadowsocks=ss.example.com:8388, method=aes-128-gcm, password=secret,');
    expect(output).toContain('tag=SS Node');
    expect(output).toContain('vmess=vmess.example.com:443, method=none, password=23ad6b10-8d1a-40f7-8ad0-e3e35cd32291, obfs=wss, obfs-host=cdn.example.com, obfs-uri=/ws,');
    expect(output).toContain('vless=1.2.3.4:443, method=none, password=b831381d-6324-4d53-ad4f-8cda48b30811, obfs=over-tls, obfs-host=www.example.com, tls-verification=true, reality-base64-pubkey=publicKey, reality-hex-shortid=0123456789abcdef, vless-flow=xtls-rprx-vision,');
    expect(output).toContain('trojan=trojan.example.com:443, password=password, obfs=wss, obfs-host=cdn.example.com, obfs-uri=/trojan,');
    expect(output).not.toContain('[server_local]');
  });

  test('serializes Loon native node lines for its documented first-party protocols', () => {
    const output = toLoon(nodes(SS, VMESS_WS_TLS, TROJAN_WS, SSR, HY2));

    expect(output).toContain('SS Node = Shadowsocks,ss.example.com,8388,aes-128-gcm,"secret",');
    expect(output).toContain('VMess WS = vmess,vmess.example.com,443,auto,"23ad6b10-8d1a-40f7-8ad0-e3e35cd32291",transport=ws,alterId=0,path=/ws,host=cdn.example.com,over-tls=true,skip-cert-verify=false,tls-name=cdn.example.com');
    expect(output).toContain('Trojan WS = trojan,trojan.example.com,443,"password",transport=ws,path=/trojan,host=cdn.example.com,skip-cert-verify=false,tls-name=cdn.example.com,udp=true');
    expect(output).toContain('SSR Node = ShadowsocksR,ssr.example.com,8388,aes-128-cfb,"secret",protocol=origin,obfs=plain,');
    expect(output).toContain('HY2 Node = Hysteria2,hy2.example.com,443,"password",skip-cert-verify=true,tls-name=sni.example.com,udp=true,fast-open=false');
  });

  test('API exposes the native targets and refuses an all-unsupported conversion', async () => {
    const qxResponse = await convert(VMESS_WS_TLS, 'quantumult-x');
    expect(qxResponse.status).toBe(200);
    expect(qxResponse.headers.get('Content-Type')).toContain('text/plain');
    expect(await qxResponse.text()).toContain('vmess=vmess.example.com:443');

    const loonResponse = await convert(HY2, 'loon');
    expect(loonResponse.status).toBe(200);
    expect(loonResponse.headers.get('Content-Type')).toContain('text/plain');
    expect(await loonResponse.text()).toContain('HY2 Node = Hysteria2');

    for (const target of ['quantumult-x', 'loon']) {
      const response = await convert(VLESS_GRPC, target);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ target, totalMatched: 1, fatalCount: 1 });
    }
  });

  test('rejects connection-critical combinations that native formats cannot express', () => {
    const cases = [
      { node: parseSingleNode(VMESS_SPLIT_WSS)!, target: 'quantumult-x' as const, param: 'sni' },
      { node: parseSingleNode(VLESS_REALITY)!, target: 'loon' as const, param: 'reality' },
      { node: parseSingleNode(HY2_OBFS)!, target: 'loon' as const, param: 'obfs' }
    ];

    for (const { node, target, param } of cases) {
      const result = adaptNodeToTarget(node, target);
      expect(result.fatal).toBe(true);
      expect(result.emitted).toBe(false);
      expect(result.unsupportedParams).toContain(param);
      expect(target === 'quantumult-x' ? toQuantumultX([node]) : toLoon([node])).toBe('');
    }
  });
});
