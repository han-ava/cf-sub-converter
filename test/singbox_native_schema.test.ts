import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adaptNodesToSingBox, adaptNodeToSingBox } from '../src/adapters/singbox';
import { toSingBox } from '../src/generator';
import { parseContent, parseSingleNode } from '../src/parsers';
import { parseSingboxOutbound } from '../src/parsers/singbox';
import { NodeEnvelope } from '../src/types';

const UUID = 'b831381d-6324-4d53-ad4f-8cda48b30811';
const REALITY_PUBLIC_KEY = 'f6Hq_u8bL6ZtD3yL5p1bUv8tH9zQ6wK7nJ4mP2sE5rY';
const SS_2022_KEY_A = btoa('0123456789abcdef');
const SS_2022_KEY_B = btoa('fedcba9876543210');
const singBoxBin = process.env.SING_BOX_BIN ?? 'sing-box';

type NativeSchemaCase = {
  name: string;
  field: string;
  outbound: Record<string, any>;
};

function nativeNode(outbound: Record<string, any>, configId = 'native-schema'): NodeEnvelope {
  const node = parseSingboxOutbound(outbound, configId);
  expect(node).not.toBeNull();
  return node!;
}

const invalidCases: NativeSchemaCase[] = [
  {
    name: 'rejects numeric HTTP username',
    field: 'username',
    outbound: { type: 'http', tag: 'http-username', server: 'http.example.com', server_port: 8080, username: 123 }
  },
  {
    name: 'rejects boolean HTTP password',
    field: 'password',
    outbound: { type: 'http', tag: 'http-password', server: 'http.example.com', server_port: 8080, password: true }
  },
  {
    name: 'rejects numeric HTTP path',
    field: 'path',
    outbound: { type: 'http', tag: 'http-path', server: 'http.example.com', server_port: 8080, path: 123 }
  },
  {
    name: 'rejects numeric SOCKS version',
    field: 'version',
    outbound: { type: 'socks', tag: 'socks-version', server: 'socks.example.com', server_port: 1080, version: 5 }
  },
  {
    name: 'rejects numeric SOCKS username',
    field: 'username',
    outbound: { type: 'socks', tag: 'socks-username', server: 'socks.example.com', server_port: 1080, username: 123 }
  },
  {
    name: 'rejects boolean SOCKS password',
    field: 'password',
    outbound: { type: 'socks', tag: 'socks-password', server: 'socks.example.com', server_port: 1080, password: false }
  },
  {
    name: 'rejects string SOCKS UDP-over-TCP enabled',
    field: 'udp_over_tcp.enabled',
    outbound: {
      type: 'socks', tag: 'socks-uot-enabled', server: 'socks.example.com', server_port: 1080,
      udp_over_tcp: { enabled: 'true', version: 2 }
    }
  },
  {
    name: 'rejects string Shadowsocks UDP-over-TCP enabled',
    field: 'udp_over_tcp.enabled',
    outbound: {
      type: 'shadowsocks', tag: 'ss-uot-enabled', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      udp_over_tcp: { enabled: 'true', version: 2 }
    }
  },
  {
    name: 'rejects string Shadowsocks UDP-over-TCP version',
    field: 'udp_over_tcp.version',
    outbound: {
      type: 'shadowsocks', tag: 'ss-uot-version', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      udp_over_tcp: { enabled: true, version: '2' }
    }
  },
  {
    name: 'rejects malformed native Shadowsocks plugin options',
    field: 'plugin_opts',
    outbound: {
      type: 'shadowsocks', tag: 'ss-plugin-syntax', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      plugin: 'obfs-local', plugin_opts: 'obfs=http\\'
    }
  },
  {
    name: 'rejects an unsupported native Shadowsocks obfs mode',
    field: 'plugin_opts.obfs',
    outbound: {
      type: 'shadowsocks', tag: 'ss-plugin-obfs', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      plugin: 'obfs-local', plugin_opts: 'obfs=quic'
    }
  },
  {
    name: 'rejects V2Ray plugin QUIC without TLS',
    field: 'plugin_opts.tls',
    outbound: {
      type: 'shadowsocks', tag: 'ss-plugin-quic', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      plugin: 'v2ray-plugin', plugin_opts: 'mode=quic'
    }
  },
  {
    name: 'rejects invalid V2Ray plugin mux',
    field: 'plugin_opts.mux',
    outbound: {
      type: 'shadowsocks', tag: 'ss-plugin-mux', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      plugin: 'v2ray-plugin', plugin_opts: 'mode=websocket;mux=wat'
    }
  },
  {
    name: 'rejects malformed V2Ray plugin inline certificate',
    field: 'plugin_opts.certRaw',
    outbound: {
      type: 'shadowsocks', tag: 'ss-plugin-cert', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      plugin: 'v2ray-plugin', plugin_opts: 'mode=websocket;tls;certRaw=MAMCAQE='
    }
  },
  {
    name: 'rejects spaces inside a native Shadowsocks 2022 Base64 key',
    field: 'password',
    outbound: {
      type: 'shadowsocks', tag: 'ss-2022-key-space', server: '1.1.1.1', server_port: 8388,
      method: '2022-blake3-aes-128-gcm',
      password: `${SS_2022_KEY_A.slice(0, 8)} ${SS_2022_KEY_A.slice(8)}`
    }
  },
  {
    name: 'rejects string VMess alter_id',
    field: 'alter_id',
    outbound: {
      type: 'vmess', tag: 'vmess-alter-id', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', alter_id: '1'
    }
  },
  {
    name: 'rejects numeric VMess user ID',
    field: 'uuid',
    outbound: {
      type: 'vmess', tag: 'vmess-numeric-user', server: 'vmess.example.com', server_port: 443,
      uuid: 123, security: 'auto'
    }
  },
  {
    name: 'rejects boolean VLESS user ID',
    field: 'uuid',
    outbound: {
      type: 'vless', tag: 'vless-boolean-user', server: 'vless.example.com', server_port: 443,
      uuid: true
    }
  },
  {
    name: 'rejects string VMess global_padding',
    field: 'global_padding',
    outbound: {
      type: 'vmess', tag: 'vmess-global-padding', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', global_padding: 'true'
    }
  },
  {
    name: 'rejects numeric VMess authenticated_length',
    field: 'authenticated_length',
    outbound: {
      type: 'vmess', tag: 'vmess-authenticated-length', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', authenticated_length: 1
    }
  },
  {
    name: 'rejects string WebSocket max_early_data',
    field: 'transport.max_early_data',
    outbound: {
      type: 'vmess', tag: 'vmess-ws-early-data', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', transport: { type: 'ws', max_early_data: '1024' }
    }
  },
  {
    name: 'rejects non-string TLS ALPN item',
    field: 'tls.alpn',
    outbound: {
      type: 'http', tag: 'tls-alpn', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, alpn: ['h2', 123] }
    }
  },
  {
    name: 'rejects non-string TLS cipher suite item',
    field: 'tls.cipher_suites',
    outbound: {
      type: 'http', tag: 'tls-cipher-suites', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, cipher_suites: ['TLS_AES_128_GCM_SHA256', 123] }
    }
  },
  {
    name: 'rejects unsupported TLS cipher suite',
    field: 'tls.cipher_suites',
    outbound: {
      type: 'http', tag: 'tls-cipher-suite-value', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, cipher_suites: ['bogus'] }
    }
  },
  {
    name: 'rejects string TLS fragment flag',
    field: 'tls.fragment',
    outbound: {
      type: 'http', tag: 'tls-fragment', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, fragment: 'true' }
    }
  },
  {
    name: 'rejects unsupported TLS curve preference',
    field: 'tls.curve_preferences',
    outbound: {
      type: 'http', tag: 'tls-curve', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, curve_preferences: ['bogus'] }
    }
  },
  {
    name: 'rejects string TLS ECH enabled flag',
    field: 'tls.ech.enabled',
    outbound: {
      type: 'http', tag: 'tls-ech', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, ech: { enabled: 'true' } }
    }
  },
  {
    name: 'rejects removed ECH PQ signature option when ECH is active',
    field: 'tls.ech.pq_signature_schemes_enabled',
    outbound: {
      type: 'http', tag: 'tls-ech-pq', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, ech: { enabled: true, pq_signature_schemes_enabled: true } }
    }
  },
  {
    name: 'rejects malformed inline ECH config',
    field: 'tls.ech.config',
    outbound: {
      type: 'http', tag: 'tls-ech-config', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, ech: { enabled: true, config: 'bogus' } }
    }
  },
  {
    name: 'rejects trailing data after an inline ECH config block',
    field: 'tls.ech.config',
    outbound: {
      type: 'http', tag: 'tls-ech-trailing-data', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        ech: {
          enabled: true,
          config: '-----BEGIN ECH CONFIGS-----\nAQID\n-----END ECH CONFIGS-----\ntrailing'
        }
      }
    }
  },
  {
    name: 'rejects numeric TLS certificate',
    field: 'tls.certificate',
    outbound: {
      type: 'http', tag: 'tls-certificate', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, certificate: 123 }
    }
  },
  {
    name: 'rejects malformed inline TLS certificate',
    field: 'tls.certificate',
    outbound: {
      type: 'http', tag: 'tls-certificate-content', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        certificate: '-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----'
      }
    }
  },
  {
    name: 'rejects an empty TLS certificate string alongside a public-key pin',
    field: 'tls.certificate_public_key_sha256',
    outbound: {
      type: 'http', tag: 'tls-empty-certificate-pin', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        certificate: '',
        certificate_public_key_sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
      }
    }
  },
  {
    name: 'rejects an empty TLS certificate list item alongside a public-key pin',
    field: 'tls.certificate_public_key_sha256',
    outbound: {
      type: 'http', tag: 'tls-empty-certificate-list-pin', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        certificate: [''],
        certificate_public_key_sha256: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=']
      }
    }
  },
  {
    name: 'keeps a null TLS certificate list item in the public-key-pin conflict',
    field: 'tls.certificate_public_key_sha256',
    outbound: {
      type: 'http', tag: 'tls-null-certificate-list-pin', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        certificate: [null],
        certificate_public_key_sha256: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=']
      }
    }
  },
  {
    name: 'rejects a null TLS public-key pin even though the decoder accepts it',
    field: 'tls.certificate_public_key_sha256',
    outbound: {
      type: 'http', tag: 'tls-null-public-key-pin', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, certificate_public_key_sha256: [null] }
    }
  },
  {
    name: 'rejects tabs inside native TLS public-key-pin Base64',
    field: 'tls.certificate_public_key_sha256',
    outbound: {
      type: 'http', tag: 'tls-pin-tab', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        certificate_public_key_sha256: 'AAAAAAAAAAA\tAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
      }
    }
  },
  {
    name: 'rejects simultaneous TLS Reality and ECH',
    field: 'tls.ech',
    outbound: {
      type: 'vmess', tag: 'tls-reality-ech', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto',
      tls: {
        enabled: true,
        utls: { enabled: true, fingerprint: 'chrome' },
        reality: { enabled: true, public_key: REALITY_PUBLIC_KEY },
        ech: { enabled: true }
      }
    }
  },
  {
    name: 'rejects client certificate without a client key',
    field: 'tls.client_key',
    outbound: {
      type: 'http', tag: 'tls-client-certificate', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, client_certificate: ['certificate'] }
    }
  },
  {
    name: 'rejects client key path without a client certificate path',
    field: 'tls.client_certificate',
    outbound: {
      type: 'http', tag: 'tls-client-key-path', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, client_key_path: 'client.key' }
    }
  },
  {
    name: 'rejects string Hysteria2 up_mbps',
    field: 'up_mbps',
    outbound: {
      type: 'hysteria2', tag: 'hy2-up', server: 'hy2.example.com', server_port: 443,
      up_mbps: '10', tls: { enabled: true }
    }
  },
  {
    name: 'rejects numeric Hysteria2 obfs type',
    field: 'obfs.type',
    outbound: {
      type: 'hysteria2', tag: 'hy2-obfs', server: 'hy2.example.com', server_port: 443,
      obfs: { type: 1, password: 'secret' }, tls: { enabled: true }
    }
  },
  {
    name: 'rejects Hysteria2 salamander obfs without a password',
    field: 'obfs.password',
    outbound: {
      type: 'hysteria2', tag: 'hy2-obfs-password', server: 'hy2.example.com', server_port: 443,
      obfs: { type: 'salamander' }, tls: { enabled: true }
    }
  },
  {
    name: 'rejects unsupported Hysteria2 obfs type',
    field: 'obfs.type',
    outbound: {
      type: 'hysteria2', tag: 'hy2-obfs-type', server: 'hy2.example.com', server_port: 443,
      obfs: { type: 'bogus', password: 'secret' }, tls: { enabled: true }
    }
  },
  {
    name: 'rejects malformed Hysteria2 server_ports',
    field: 'server_ports',
    outbound: {
      type: 'hysteria2', tag: 'hy2-server-ports', server: 'hy2.example.com', server_port: 443,
      server_ports: ['bogus'], tls: { enabled: true }
    }
  },
  {
    name: 'rejects string TUIC zero_rtt_handshake',
    field: 'zero_rtt_handshake',
    outbound: {
      type: 'tuic', tag: 'tuic-zero-rtt', server: 'tuic.example.com', server_port: 443,
      uuid: UUID, zero_rtt_handshake: 'true', tls: { enabled: true }
    }
  },
  {
    name: 'rejects string TUIC udp_over_stream',
    field: 'udp_over_stream',
    outbound: {
      type: 'tuic', tag: 'tuic-uos', server: 'tuic.example.com', server_port: 443,
      uuid: UUID, udp_over_stream: 'false', tls: { enabled: true }
    }
  },
  {
    name: 'rejects string Hysteria up_mbps',
    field: 'up_mbps',
    outbound: {
      type: 'hysteria', tag: 'hysteria-up', server: 'hysteria.example.com', server_port: 443,
      up_mbps: '10', down_mbps: 20, tls: { enabled: true }
    }
  },
  {
    name: 'rejects zero Hysteria upload speed',
    field: 'up_mbps',
    outbound: {
      type: 'hysteria', tag: 'hysteria-zero-up', server: 'hysteria.example.com', server_port: 443,
      up_mbps: 0, down_mbps: 20, tls: { enabled: true }
    }
  },
  {
    name: 'rejects Hysteria upload speed below the official minimum',
    field: 'up',
    outbound: {
      type: 'hysteria', tag: 'hysteria-low-up', server: 'hysteria.example.com', server_port: 443,
      up: '1Bps', down_mbps: 20, tls: { enabled: true }
    }
  },
  {
    name: 'keeps Kbps distinct from the byte-unit fallback for Hysteria bandwidth',
    field: 'up',
    outbound: {
      type: 'hysteria', tag: 'hysteria-kilobits', server: 'hysteria.example.com', server_port: 443,
      up: '20Kbps', down: '20KBps', auth_str: 'secret', tls: { enabled: true }
    }
  },
  {
    name: 'rejects spaces inside native Hysteria auth Base64',
    field: 'auth',
    outbound: {
      type: 'hysteria', tag: 'hysteria-auth-space', server: 'hysteria.example.com', server_port: 443,
      up: '20KBps', down: '20KBps', auth: 'c2Vj cmV0', tls: { enabled: true }
    }
  },
  {
    name: 'rejects malformed Hysteria server_ports',
    field: 'server_ports',
    outbound: {
      type: 'hysteria', tag: 'hysteria-server-ports', server: 'hysteria.example.com', server_port: 443,
      server_ports: ['bogus'], up_mbps: 10, down_mbps: 20, tls: { enabled: true }
    }
  },
  {
    name: 'rejects numeric Naive username',
    field: 'username',
    outbound: {
      type: 'naive', tag: 'naive-username', server: 'naive.example.com', server_port: 443,
      username: 123, password: 'secret', tls: { enabled: true }
    }
  },
  {
    name: 'rejects unsupported Naive QUIC congestion control',
    field: 'quic_congestion_control',
    outbound: {
      type: 'naive', tag: 'naive-quic-congestion', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret', quic_congestion_control: 'bogus', tls: { enabled: true }
    }
  },
  {
    name: 'rejects the removed Naive stream_receive_window field',
    field: 'stream_receive_window',
    outbound: {
      type: 'naive', tag: 'naive-stream-window', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret', stream_receive_window: '64KB', tls: { enabled: true }
    }
  },
  {
    name: 'rejects the removed Naive quic_session_receive_window field',
    field: 'quic_session_receive_window',
    outbound: {
      type: 'naive', tag: 'naive-quic-session-window', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret', quic_session_receive_window: '64KB', tls: { enabled: true }
    }
  },
  {
    name: 'rejects a Naive TLS public-key pin that Cronet silently ignores',
    field: 'tls.certificate_public_key_sha256',
    outbound: {
      type: 'naive', tag: 'naive-public-key-pin', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret',
      tls: {
        enabled: true,
        certificate_public_key_sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
      }
    }
  },
  {
    name: 'rejects a Naive TLS fragment fallback delay that Cronet silently ignores',
    field: 'tls.fragment_fallback_delay',
    outbound: {
      type: 'naive', tag: 'naive-fragment-delay', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret',
      tls: { enabled: true, fragment_fallback_delay: '500ms' }
    }
  },
  {
    name: 'rejects numeric SSH user',
    field: 'user',
    outbound: {
      type: 'ssh', tag: 'ssh-user', server: 'ssh.example.com', server_port: 22,
      user: 123, password: 'secret'
    }
  },
  {
    name: 'rejects malformed inline SSH private key',
    field: 'private_key',
    outbound: {
      type: 'ssh', tag: 'ssh-private-key', server: 'ssh.example.com', server_port: 22,
      private_key: '-----BEGIN PRIVATE KEY-----\nMAMCAQE=\n-----END PRIVATE KEY-----'
    }
  },
  {
    name: 'rejects malformed SSH host key',
    field: 'host_key',
    outbound: {
      type: 'ssh', tag: 'ssh-host-key', server: 'ssh.example.com', server_port: 22,
      password: 'secret', host_key: 'bogus'
    }
  },
  {
    name: 'rejects an SSH host key blob containing only its algorithm',
    field: 'host_key',
    outbound: {
      type: 'ssh', tag: 'ssh-host-key-truncated', server: 'ssh.example.com', server_port: 22,
      password: 'secret', host_key: 'ssh-rsa AAAAB3NzaC1yc2E='
    }
  },
  {
    name: 'rejects numeric ShadowTLS password',
    field: 'password',
    outbound: {
      type: 'shadowtls', tag: 'shadowtls-password', server: 'shadow.example.com', server_port: 443,
      version: 3, password: 123, tls: { enabled: true }
    }
  },
  {
    name: 'rejects a non-1.2 minimum TLS version for default ShadowTLS v1',
    field: 'tls.min_version',
    outbound: {
      type: 'shadowtls', tag: 'shadowtls-default-min', server: 'shadow.example.com', server_port: 443,
      tls: { enabled: true, min_version: '1.3' }
    }
  },
  {
    name: 'rejects a non-1.2 maximum TLS version for ShadowTLS version 0',
    field: 'tls.max_version',
    outbound: {
      type: 'shadowtls', tag: 'shadowtls-zero-max', server: 'shadow.example.com', server_port: 443,
      version: 0, tls: { enabled: true, max_version: '1.1' }
    }
  },
  {
    name: 'rejects a non-1.2 minimum TLS version for explicit ShadowTLS v1',
    field: 'tls.min_version',
    outbound: {
      type: 'shadowtls', tag: 'shadowtls-one-min', server: 'shadow.example.com', server_port: 443,
      version: 1, tls: { enabled: true, min_version: '1.0' }
    }
  },
  {
    name: 'rejects string domain_resolver.disable_cache',
    field: 'domain_resolver.disable_cache',
    outbound: {
      type: 'http', tag: 'resolver-disable-cache', server: 'http.example.com', server_port: 8080,
      domain_resolver: { server: 'dns-system', disable_cache: 'false' }
    }
  },
  {
    name: 'rejects string domain_resolver.rewrite_ttl',
    field: 'domain_resolver.rewrite_ttl',
    outbound: {
      type: 'http', tag: 'resolver-rewrite-ttl', server: 'http.example.com', server_port: 8080,
      domain_resolver: { server: 'dns-system', rewrite_ttl: '60' }
    }
  },
  {
    name: 'rejects domain_resolver options without a server',
    field: 'domain_resolver.server',
    outbound: {
      type: 'http', tag: 'resolver-missing-server', server: 'http.example.com', server_port: 8080,
      domain_resolver: { strategy: 'prefer_ipv4' }
    }
  },
  {
    name: 'rejects an explicitly empty domain_resolver server',
    field: 'domain_resolver.server',
    outbound: {
      type: 'http', tag: 'resolver-empty-server', server: 'http.example.com', server_port: 8080,
      domain_resolver: { server: '' }
    }
  },
  {
    name: 'rejects a scoped IPv6 client subnet',
    field: 'domain_resolver.client_subnet',
    outbound: {
      type: 'http', tag: 'resolver-scoped-subnet', server: 'http.example.com', server_port: 8080,
      domain_resolver: { server: 'dns-system', client_subnet: 'fe80::1%lo0/64' }
    }
  },
  {
    name: 'rejects routing_mark outside uint32 range',
    field: 'routing_mark',
    outbound: {
      type: 'http', tag: 'dialer-routing-mark', server: 'http.example.com', server_port: 8080,
      routing_mark: '0x100000000'
    }
  },
  {
    name: 'rejects a leading plus sign in routing_mark',
    field: 'routing_mark',
    outbound: {
      type: 'http', tag: 'dialer-routing-mark-plus', server: 'http.example.com', server_port: 8080,
      routing_mark: '+0'
    }
  },
  {
    name: 'rejects string Dialer reuse_addr',
    field: 'reuse_addr',
    outbound: {
      type: 'http', tag: 'dialer-reuse-addr', server: 'http.example.com', server_port: 8080,
      reuse_addr: 'true'
    }
  },
  {
    name: 'rejects unsupported Dialer network_strategy',
    field: 'network_strategy',
    outbound: {
      type: 'http', tag: 'dialer-network-strategy', server: 'http.example.com', server_port: 8080,
      network_strategy: 'bogus'
    }
  },
  {
    name: 'treats zero fallback_delay as a Dialer strategy conflict',
    field: 'network_strategy',
    outbound: {
      type: 'http', tag: 'dialer-zero-fallback', server: 'http.example.com', server_port: 8080,
      inet4_bind_address: '127.0.0.1', network_type: 'wifi', fallback_delay: '0s'
    }
  },
  {
    name: 'rejects an empty fallback_network_type in a Dialer bind conflict',
    field: 'network_strategy',
    outbound: {
      type: 'http', tag: 'dialer-empty-fallback-network', server: 'http.example.com', server_port: 8080,
      inet4_bind_address: '127.0.0.1', network_type: 'wifi', fallback_network_type: []
    }
  },
  {
    name: 'rejects an empty native duration',
    field: 'connect_timeout',
    outbound: {
      type: 'http', tag: 'dialer-empty-duration', server: 'http.example.com', server_port: 8080,
      connect_timeout: ''
    }
  },
  {
    name: 'rejects a null native duration',
    field: 'connect_timeout',
    outbound: {
      type: 'http', tag: 'dialer-null-duration', server: 'http.example.com', server_port: 8080,
      connect_timeout: null
    }
  },
  {
    name: 'rejects a null native routing mark',
    field: 'routing_mark',
    outbound: {
      type: 'http', tag: 'dialer-null-routing-mark', server: 'http.example.com', server_port: 8080,
      routing_mark: null
    }
  },
  {
    name: 'rejects an empty native boolean',
    field: 'reuse_addr',
    outbound: {
      type: 'http', tag: 'dialer-empty-boolean', server: 'http.example.com', server_port: 8080,
      reuse_addr: ''
    }
  },
  {
    name: 'rejects an empty native integer',
    field: 'alter_id',
    outbound: {
      type: 'vmess', tag: 'vmess-empty-alter-id', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', alter_id: ''
    }
  },
  {
    name: 'rejects empty native HTTP headers',
    field: 'headers',
    outbound: {
      type: 'http', tag: 'http-empty-headers', server: 'http.example.com', server_port: 8080,
      headers: ''
    }
  },
  {
    name: 'rejects a numeric native HTTP header value',
    field: 'headers',
    outbound: {
      type: 'http', tag: 'http-numeric-header', server: 'http.example.com', server_port: 8080,
      headers: { 'X-Invalid': 1 }
    }
  },
  {
    name: 'rejects a boolean native Naive header value',
    field: 'extra_headers',
    outbound: {
      type: 'naive', tag: 'naive-boolean-header', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret', extra_headers: { 'X-Invalid': true },
      tls: { enabled: true }
    }
  },
  {
    name: 'rejects an object native V2Ray transport header value',
    field: 'transport.headers',
    outbound: {
      type: 'vmess', tag: 'vmess-object-header', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto',
      transport: { type: 'ws', headers: { 'X-Invalid': {} } }
    }
  },
  {
    name: 'rejects an empty native TLS object',
    field: 'tls',
    outbound: {
      type: 'http', tag: 'http-empty-tls', server: 'http.example.com', server_port: 8080,
      tls: ''
    }
  },
  {
    name: 'rejects an empty native transport object',
    field: 'transport',
    outbound: {
      type: 'vmess', tag: 'vmess-empty-transport', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', transport: ''
    }
  },
  {
    name: 'rejects an empty native multiplex object',
    field: 'multiplex',
    outbound: {
      type: 'vmess', tag: 'vmess-empty-multiplex', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', multiplex: ''
    }
  },
  {
    name: 'rejects an empty native ECH object',
    field: 'tls.ech',
    outbound: {
      type: 'http', tag: 'tls-empty-ech', server: 'http.example.com', server_port: 443,
      tls: { enabled: true, ech: '' }
    }
  },
  {
    name: 'rejects an empty native server port list',
    field: 'server_ports',
    outbound: {
      type: 'hysteria2', tag: 'hy2-empty-server-ports', server: 'hy2.example.com', server_port: 443,
      server_ports: '', tls: { enabled: true }
    }
  },
  {
    name: 'rejects an empty native byte quantity',
    field: 'stream_receive_window',
    outbound: {
      type: 'naive', tag: 'naive-empty-byte-quantity', server: 'naive.example.com', server_port: 443,
      username: 'user', password: 'secret', stream_receive_window: '', tls: { enabled: true }
    }
  },
  {
    name: 'rejects an empty VMess network',
    field: 'network',
    outbound: {
      type: 'vmess', tag: 'vmess-empty-network', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', network: ''
    }
  },
  {
    name: 'rejects unknown QUIC transport field',
    field: 'transport.extra',
    outbound: {
      type: 'vmess', tag: 'vmess-quic-extra', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', transport: { type: 'quic', extra: true }
    }
  },
  {
    name: 'rejects native V2Ray QUIC transport without TLS',
    field: 'tls.enabled',
    outbound: {
      type: 'vmess', tag: 'vmess-quic-no-tls', server: 'vmess.example.com', server_port: 443,
      uuid: UUID, security: 'auto', transport: { type: 'quic' }
    }
  },
  {
    name: 'rejects TLS on a SOCKS outbound',
    field: 'tls',
    outbound: {
      type: 'socks', tag: 'socks-tls', server: 'socks.example.com', server_port: 1080,
      tls: { enabled: true }
    }
  },
  {
    name: 'rejects network on an HTTP outbound',
    field: 'network',
    outbound: {
      type: 'http', tag: 'http-network', server: 'http.example.com', server_port: 8080,
      network: 'tcp'
    }
  },
  {
    name: 'rejects transport on an AnyTLS outbound',
    field: 'transport',
    outbound: {
      type: 'anytls', tag: 'anytls-transport', server: 'anytls.example.com', server_port: 443,
      password: 'secret', transport: { type: 'ws' }, tls: { enabled: true }
    }
  },
  {
    name: 'rejects multiplex on an SSH outbound',
    field: 'multiplex',
    outbound: {
      type: 'ssh', tag: 'ssh-multiplex', server: 'ssh.example.com', server_port: 22,
      user: 'user', password: 'secret', multiplex: { enabled: true }
    }
  },
  {
    name: 'rejects an unknown native outbound field',
    field: 'mystery_option',
    outbound: {
      type: 'http', tag: 'http-unknown', server: 'http.example.com', server_port: 8080,
      mystery_option: true
    }
  },
  {
    name: 'rejects detour to the built-in selector group',
    field: 'detour',
    outbound: {
      type: 'socks', tag: 'selector-cycle', server: '127.0.0.1', server_port: 1080,
      detour: '🚀 节点选择'
    }
  },
  {
    name: 'rejects detour to the built-in URL-test group',
    field: 'detour',
    outbound: {
      type: 'socks', tag: 'urltest-cycle', server: '127.0.0.1', server_port: 1080,
      detour: '⚡ 自动选择'
    }
  },
  {
    name: 'rejects a whitespace-only detour',
    field: 'detour',
    outbound: {
      type: 'socks', tag: 'blank-detour', server: '127.0.0.1', server_port: 1080,
      detour: '   '
    }
  }
];

describe('native Sing-box v1.13.21 schema gate', () => {
  for (const invalidCase of invalidCases) {
    test(invalidCase.name, () => {
      const result = adaptNodeToSingBox(nativeNode(invalidCase.outbound));

      expect(result.fatal).toBe(true);
      expect(result.emitted).toBe(false);
      expect(result.unsupportedParams).toContain(invalidCase.field);
    });
  }

  test('accepted native fixtures pass the official Sing-box check', () => {
    const nodes = [
      nativeNode({
        type: 'http', tag: 'native-http', server: 'http.example.com', server_port: 8080,
        username: 'user', password: 'secret', path: '/proxy',
        tls: { enabled: true, cipher_suites: ['TLS_AES_128_GCM_SHA256'] }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'socks', tag: 'native-socks', server: 'socks.example.com', server_port: 1080,
        version: '5', username: 'user', password: 'secret',
        udp_over_tcp: { enabled: true, version: 0 }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'vmess', tag: 'native-vmess', server: 'vmess.example.com', server_port: 443,
        uuid: UUID, security: 'auto', alter_id: 0,
        global_padding: false, authenticated_length: false, packet_encoding: '',
        transport: { type: 'ws', path: '/ws', max_early_data: 0 }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'vless', tag: 'native-vless-defaults', server: 'vless.example.com', server_port: 443,
        uuid: UUID, flow: '', packet_encoding: '', network: null,
        reuse_addr: null, tls: null, transport: null, multiplex: null
      }, 'native-schema-valid'),
      nativeNode({
        type: 'hysteria2', tag: 'native-hy2', server: 'hy2.example.com', server_port: 443,
        password: 'secret', server_ports: ['443:443'], up_mbps: 10,
        obfs: { type: 'salamander', password: 'secret' },
        tls: { enabled: true, server_name: 'hy2.example.com' }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'naive', tag: 'native-naive', server: 'naive.example.com', server_port: 443,
        username: 'user', password: 'secret', quic_congestion_control: 'bbr',
        tls: { enabled: true, server_name: 'naive.example.com' }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'tuic', tag: 'native-tuic', server: 'tuic.example.com', server_port: 443,
        uuid: UUID, password: 'secret', udp_relay_mode: '',
        zero_rtt_handshake: false, udp_over_stream: false,
        tls: { enabled: true, server_name: 'tuic.example.com' }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'shadowtls', tag: 'native-shadowtls-default', server: 'shadow.example.com', server_port: 443,
        version: 0,
        tls: {
          enabled: true, server_name: 'shadow.example.com',
          min_version: '1.2', max_version: '1.2'
        }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'shadowtls', tag: 'native-shadowtls-v3', server: 'shadow.example.com', server_port: 443,
        version: 3, password: 'secret',
        tls: {
          enabled: true, server_name: 'shadow.example.com',
          min_version: '1.3', max_version: '1.3'
        }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'shadowsocks', tag: 'native-ss-2022-eih', server: '1.1.1.1', server_port: 8388,
        method: '2022-blake3-aes-128-gcm', password: `${SS_2022_KEY_A}:${SS_2022_KEY_B}`,
        plugin: 'v2ray-plugin',
        plugin_opts: 'mode=websocket;mode=grpc;mux=000000000000000000001;unknown=value'
      }, 'native-schema-valid'),
      nativeNode({
        type: 'hysteria', tag: 'native-hysteria', server: 'hysteria.example.com', server_port: 443,
        up: '16384Bps', down_mbps: 1, auth_str: 'secret', tls: { enabled: true }
      }, 'native-schema-valid'),
      nativeNode({
        type: 'vmess', tag: 'native-disabled-options', server: 'vmess.example.com', server_port: 443,
        uuid: UUID, security: 'auto',
        tls: {
          enabled: false,
          min_version: 'bogus',
          utls: { enabled: false, fingerprint: 'bogus' }
        },
        multiplex: {
          enabled: false,
          protocol: 'bogus',
          max_connections: -1,
          brutal: { enabled: true, up_mbps: -1, down_mbps: -1 }
        }
      }, 'native-schema-valid')
    ];
    const results = nodes.map(adaptNodeToSingBox);
    expect(results.every(result => !result.fatal && result.emitted)).toBe(true);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-native-schema-'));
    const configPath = join(workDir, 'config.json');

    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');

      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );

      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('marks only active file-backed TLS, ECH, and SSH material for runtime validation', () => {
    const cases = [
      {
        outbound: {
          type: 'http', tag: 'tls-certificate-path', server: 'http.example.com', server_port: 443,
          tls: { enabled: true, certificate_path: '/missing/ca.pem' }
        },
        fields: ['tls.certificate_path']
      },
      {
        outbound: {
          type: 'http', tag: 'tls-client-paths', server: 'http.example.com', server_port: 443,
          tls: {
            enabled: true,
            client_certificate_path: '/missing/client.pem',
            client_key_path: '/missing/client.key'
          }
        },
        fields: ['tls.client_certificate_path', 'tls.client_key_path']
      },
      {
        outbound: {
          type: 'http', tag: 'tls-ech-path', server: 'http.example.com', server_port: 443,
          tls: { enabled: true, ech: { enabled: true, config_path: '/missing/ech.pem' } }
        },
        fields: ['tls.ech.config_path']
      },
      {
        outbound: {
          type: 'ssh', tag: 'ssh-private-key-path', server: 'ssh.example.com', server_port: 22,
          private_key_path: '/missing/id_ed25519'
        },
        fields: ['private_key_path']
      }
    ];

    for (const { outbound, fields } of cases) {
      const result = adaptNodeToSingBox(nativeNode(outbound, 'native-runtime-paths'));
      expect(result).toMatchObject({ fatal: false, emitted: true, lossy: true });
      for (const field of fields) {
        expect(result.warnings).toContainEqual(expect.objectContaining({ level: 'warn', field }));
        expect(result.unsupportedParams).not.toContain(field);
      }
    }

    const shadowed = [
      nativeNode({
        type: 'http', tag: 'shadowed-tls-paths', server: 'http.example.com', server_port: 443,
        tls: {
          enabled: true,
          certificate: [''], certificate_path: '/ignored/ca.pem',
          client_certificate: [''], client_certificate_path: '/ignored/client.pem',
          client_key: [''], client_key_path: '/ignored/client.key',
          ech: { enabled: true, config: [''], config_path: '/ignored/ech.pem' }
        }
      }, 'native-shadowed-runtime-paths'),
      nativeNode({
        type: 'ssh', tag: 'shadowed-ssh-key-path', server: 'ssh.example.com', server_port: 22,
        private_key: [''], private_key_path: '/ignored/id_ed25519'
      }, 'native-shadowed-runtime-paths')
    ].map(adaptNodeToSingBox);
    for (const result of shadowed) {
      expect(result.warnings.some(warning => warning.field.endsWith('_path'))).toBe(false);
    }
  });

  test('accepts native VMess/VLESS string IDs, TUIC UUID forms, and scoped IPv6 addresses', () => {
    const compactUuid = UUID.replaceAll('-', '');
    const nodes = [
      nativeNode({
        type: 'vmess', tag: 'vmess-arbitrary-id', server: 'vmess.example.com', server_port: 443,
        uuid: 'not-a-uuid', security: 'auto'
      }, 'native-official-identities'),
      nativeNode({
        type: 'vmess', tag: 'vmess-empty-id', server: 'vmess.example.com', server_port: 443,
        uuid: '', security: 'auto'
      }, 'native-official-identities'),
      nativeNode({
        type: 'vless', tag: 'vless-arbitrary-id', server: 'vless.example.com', server_port: 443,
        uuid: 'user@example.com'
      }, 'native-official-identities'),
      nativeNode({
        type: 'vless', tag: 'vless-empty-id', server: 'vless.example.com', server_port: 443,
        uuid: ''
      }, 'native-official-identities'),
      ...[
        UUID,
        compactUuid,
        `{${UUID}}`,
        `{${compactUuid}}`,
        `urn:uuid:${UUID}`,
        `urn:uuid:${compactUuid}`
      ].map((uuid, index) => nativeNode({
        type: 'tuic', tag: `tuic-uuid-${index}`, server: 'tuic.example.com', server_port: 443,
        uuid, password: 'secret', tls: { enabled: true }
      }, 'native-official-identities')),
      ...['fe80::1%lo0', 'fe80::1%25lo0'].map((inet6BindAddress, index) => nativeNode({
        type: 'http', tag: `scoped-ipv6-${index}`, server: 'http.example.com', server_port: 8080,
        inet6_bind_address: inet6BindAddress
      }, 'native-official-identities'))
    ];

    const results = nodes.map(adaptNodeToSingBox);
    expect(results.every(result => result.emitted && !result.fatal)).toBe(true);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-identities-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('accepts a Go-compatible ECH PEM envelope with consecutive headers', () => {
    const node = nativeNode({
      type: 'http', tag: 'ech-pem-headers', server: 'http.example.com', server_port: 443,
      tls: {
        enabled: true,
        ech: {
          enabled: true,
          config: [
            '-----BEGIN ECH CONFIGS-----',
            'Comment: first',
            'X-Test: second',
            'AQID',
            '-----END ECH CONFIGS-----'
          ]
        }
      }
    }, 'native-ech-pem-headers');
    expect(adaptNodeToSingBox(node)).toMatchObject({ fatal: false, emitted: true });

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-ech-headers-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox([node]));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('warns for active native and cross-format v2ray-plugin certificate paths', async () => {
    const nativeResult = adaptNodeToSingBox(nativeNode({
      type: 'shadowsocks', tag: 'native-plugin-cert-path', server: '1.1.1.1', server_port: 8388,
      method: 'chacha20-ietf-poly1305', password: 'secret',
      plugin: 'v2ray-plugin', plugin_opts: 'mode=websocket;tls;cert=/missing/ca.pem'
    }, 'native-plugin-cert-path'));
    const crossNodes = await parseContent(`
proxies:
  - name: Cross Plugin Cert Path
    type: ss
    server: 1.1.1.1
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      tls: true
      cert: /missing/ca.pem
`);
    expect(crossNodes).toHaveLength(1);
    const crossResult = adaptNodeToSingBox(crossNodes[0]!);

    for (const result of [nativeResult, crossResult]) {
      expect(result).toMatchObject({ fatal: false, emitted: true, lossy: true });
      expect(result.warnings).toContainEqual(expect.objectContaining({
        level: 'warn', field: 'plugin_opts.cert'
      }));
      expect(result.unsupportedParams).not.toContain('plugin_opts.cert');
    }
  });

  test('preserves null native header values accepted by the official decoder', () => {
    const nodes = [
      nativeNode({
        type: 'http', tag: 'http-null-header', server: 'http.example.com', server_port: 8080,
        headers: { 'X-Null': null }, tls: { enabled: true, alpn: [null] }
      }, 'native-null-headers'),
      nativeNode({
        type: 'naive', tag: 'naive-null-header', server: 'naive.example.com', server_port: 443,
        username: 'user', password: 'secret',
        extra_headers: { 'X-Null': null, 'X-Null-List': [null] },
        tls: { enabled: true }
      }, 'native-null-headers'),
      ...['ws', 'http', 'httpupgrade'].map((type, index) => nativeNode({
        type: 'vmess', tag: `vmess-${type}-null-header`, server: 'vmess.example.com', server_port: 443,
        uuid: UUID, security: 'auto',
        transport: {
          type,
          ...(type === 'http' ? { host: [null] } : {}),
          headers: index === 0 ? { 'X-Null': null, 'X-List': ['value', null] } : { 'X-Null': null }
        }
      }, 'native-null-headers')),
      nativeNode({
        type: 'ssh', tag: 'ssh-null-host-key-algorithm', server: 'ssh.example.com', server_port: 22,
        user: 'user', password: 'secret', host_key_algorithms: [null]
      }, 'native-null-headers')
    ];
    const results = nodes.map(adaptNodeToSingBox);
    expect(results.every(result => result.emitted && !result.fatal)).toBe(true);
    expect(results[0]?.config?.headers?.['X-Null']).toBeNull();
    expect(results[0]?.config?.tls?.alpn).toEqual([null]);
    expect(results[1]?.config?.extra_headers?.['X-Null']).toBeNull();
    expect(results[1]?.config?.extra_headers?.['X-Null-List']).toEqual([null]);
    for (const result of results.slice(2, 5)) {
      expect(result.config?.transport?.headers?.['X-Null']).toBeNull();
    }
    expect(results[2]?.config?.transport?.headers?.['X-List']).toEqual(['value', null]);
    expect(results[3]?.config?.transport?.host).toEqual([null]);
    expect(results[5]?.config?.host_key_algorithms).toEqual([null]);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-null-headers-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('preserves nullable TLS and ECH lists while keeping their paths shadowed', () => {
    const nodes = [
      nativeNode({
        type: 'http', tag: 'tls-null-certificate', server: 'http.example.com', server_port: 443,
        tls: { enabled: true, certificate: [null], certificate_path: '/ignored/ca.pem' }
      }, 'native-null-tls-material'),
      nativeNode({
        type: 'http', tag: 'tls-null-client-material', server: 'http.example.com', server_port: 443,
        tls: {
          enabled: true,
          client_certificate: [null], client_certificate_path: '/ignored/client.pem',
          client_key: [null], client_key_path: '/ignored/client.key'
        }
      }, 'native-null-tls-material'),
      nativeNode({
        type: 'http', tag: 'ech-null-config', server: 'http.example.com', server_port: 443,
        tls: {
          enabled: true,
          ech: { enabled: true, config: [null], config_path: '/ignored/ech.pem' }
        }
      }, 'native-null-tls-material')
    ];
    const results = nodes.map(adaptNodeToSingBox);
    expect(results.every(result => result.emitted && !result.fatal)).toBe(true);
    expect(results[0]?.config?.tls?.certificate).toEqual([null]);
    expect(results[1]?.config?.tls?.client_certificate).toEqual([null]);
    expect(results[1]?.config?.tls?.client_key).toEqual([null]);
    expect(results[2]?.config?.tls?.ech?.config).toEqual([null]);
    expect(results.flatMap(result => result.warnings).some(warning => (
      warning.field.endsWith('_path') || warning.field === 'tls.ech.config_path'
    ))).toBe(false);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-null-tls-material-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('accepts the official Hysteria NetworkBytesCompat unit fallback', () => {
    const values = ['20K', '20KB', '20Ki', '20KiB', '20kB', '20M', '20MB', '20KBps', '200Kbps'];
    const nodes = values.map((value, index) => nativeNode({
      type: 'hysteria', tag: `hysteria-network-bytes-${index}`,
      server: 'hysteria.example.com', server_port: 443,
      up: value, down: '20KBps', auth_str: 'secret', tls: { enabled: true }
    }, 'native-hysteria-network-bytes'));
    const results = nodes.map(adaptNodeToSingBox);
    expect(results.every(result => result.emitted && !result.fatal)).toBe(true);
    expect(results.map(result => result.config?.up)).toEqual(values);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-hysteria-network-bytes-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('accepts CR and LF inside native Go Base64 fields only', () => {
    const ssKey = `${SS_2022_KEY_A.slice(0, 8)}\r\n${SS_2022_KEY_A.slice(8)}`;
    const auth = 'c2Vj\r\ncmV0';
    const pin = 'AAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const nodes = [
      nativeNode({
        type: 'shadowsocks', tag: 'ss-2022-base64-lines', server: '1.1.1.1', server_port: 8388,
        method: '2022-blake3-aes-128-gcm', password: ssKey
      }, 'native-base64-lines'),
      nativeNode({
        type: 'hysteria', tag: 'hysteria-auth-lines', server: 'hysteria.example.com', server_port: 443,
        up: '20KBps', down: '20KBps', auth, tls: { enabled: true }
      }, 'native-base64-lines'),
      nativeNode({
        type: 'http', tag: 'tls-pin-lines', server: 'http.example.com', server_port: 443,
        tls: { enabled: true, certificate_public_key_sha256: pin }
      }, 'native-base64-lines')
    ];
    const results = nodes.map(adaptNodeToSingBox);
    expect(results.every(result => result.emitted && !result.fatal)).toBe(true);
    expect(results[0]?.config?.password).toBe(ssKey);
    expect(results[1]?.config?.auth).toBe(auth);
    expect(results[2]?.config?.tls?.certificate_public_key_sha256).toBe(pin);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-native-base64-lines-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('preserves an empty domain_resolver object as an official no-op', () => {
    const node = nativeNode({
      type: 'http', tag: 'empty-domain-resolver', server: 'http.example.com', server_port: 8080,
      domain_resolver: {}
    }, 'native-empty-domain-resolver');
    const adapted = adaptNodeToSingBox(node);
    expect(adapted).toMatchObject({ fatal: false, emitted: true });
    expect(adapted.config?.domain_resolver).toEqual({});

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-empty-domain-resolver-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox([node]));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('matches the official rejection of a plus-prefixed routing_mark', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-routing-mark-plus-'));
    const configPath = join(workDir, 'config.json');
    try {
      writeFileSync(configPath, JSON.stringify({
        log: { disabled: true },
        outbounds: [{
          type: 'http', tag: 'routing-mark-plus', server: 'http.example.com', server_port: 8080,
          routing_mark: '+0'
        }],
        route: { final: 'routing-mark-plus' }
      }), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('routing_mark');
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('accepts the official native duration grammar', () => {
    const durations = ['1d', '1μs', '+.5s', '1.s', '0', '-1s'];
    const nodes = durations.map((duration, index) => nativeNode({
      type: 'http', tag: `native-duration-${index}`, server: 'http.example.com', server_port: 8080,
      connect_timeout: duration
    }, 'native-duration-valid'));

    expect(nodes.map(adaptNodeToSingBox).every(result => result.emitted && !result.fatal)).toBe(true);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-native-duration-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');

      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('isolates native detour references from separate Base64 configurations', async () => {
    const encodedConfigs = [
      {
        outbounds: [
          {
            type: 'socks', tag: 'chain', server: '127.0.0.1', server_port: 1080,
            detour: 'shared'
          },
          { type: 'socks', tag: 'shared', server: '127.0.0.1', server_port: 1081 }
        ]
      },
      {
        outbounds: [
          {
            type: 'http', tag: 'chain', server: '127.0.0.1', server_port: 8080,
            detour: 'shared'
          },
          { type: 'http', tag: 'shared', server: '127.0.0.1', server_port: 8081 }
        ]
      }
    ].map(config => btoa(JSON.stringify(config))).join('\n');

    const nodes = await parseContent(encodedConfigs);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]?.source.configId).toBe(nodes[1]?.source.configId);
    expect(nodes[2]?.source.configId).toBe(nodes[3]?.source.configId);
    expect(nodes[0]?.source.configId).not.toBe(nodes[2]?.source.configId);
    expect(adaptNodesToSingBox(nodes).every(result => result.emitted && !result.fatal)).toBe(true);

    const config = JSON.parse(toSingBox(nodes));
    const nativeOutbounds = config.outbounds.filter((outbound: Record<string, any>) => (
      outbound.type === 'socks' || outbound.type === 'http'
    ));
    expect(nativeOutbounds.map((outbound: Record<string, any>) => outbound.tag)).toEqual([
      'chain', 'shared', 'chain 02', 'shared 02'
    ]);
    expect(nativeOutbounds[0]?.detour).toBe('shared');
    expect(nativeOutbounds[2]?.detour).toBe('shared 02');

    const availability = spawnSync(singBoxBin, ['version'], { encoding: 'utf8' });
    if (availability.error || availability.status !== 0) return;

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-config-id-'));
    const configPath = join(workDir, 'config.json');
    try {
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');

      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('does not retarget a native detour when its source declared a filtered direct tag', async () => {
    const nodes = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'selector', tag: 'direct', outbounds: ['direct'] },
        {
          type: 'socks', tag: 'native-chain', server: '127.0.0.1', server_port: 1080,
          detour: 'direct'
        }
      ]
    }));
    const chainIndex = nodes.findIndex(node => node.name === 'native-chain');
    expect(chainIndex).toBeGreaterThanOrEqual(0);

    const result = adaptNodesToSingBox(nodes)[chainIndex]!;
    expect(result).toMatchObject({ fatal: true, emitted: false });
    expect(result.unsupportedParams).toContain('detour');
  });

  test('normalizes uppercase Clash TUIC enums before the official check', async () => {
    const nodes = await parseContent(`
proxies:
  - name: TUIC Uppercase Native
    type: tuic
    server: tuic.example.com
    port: 443
    uuid: ${UUID}
    password: secret
    congestion-controller: BBR
    udp-relay-mode: NATIVE
    sni: tuic.example.com
    skip-cert-verify: true
  - name: TUIC Uppercase QUIC
    type: tuic
    server: tuic.example.com
    port: 443
    uuid: ${UUID}
    password: secret
    congestion-controller: BBR
    udp-relay-mode: QUIC
    sni: tuic.example.com
    skip-cert-verify: true
`);
    expect(nodes).toHaveLength(2);

    expect(nodes.map(adaptNodeToSingBox)).toMatchObject([
      {
        fatal: false,
        emitted: true,
        config: { congestion_control: 'bbr', udp_relay_mode: 'native' }
      },
      {
        fatal: false,
        emitted: true,
        config: { congestion_control: 'bbr', udp_relay_mode: 'quic' }
      }
    ]);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-tuic-enums-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');

      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('uses the custom template DNS server tags as the resolver validation context', () => {
    const node = nativeNode({
      type: 'http', tag: 'custom-resolver-node', server: 'http.example.com', server_port: 8080,
      domain_resolver: 'custom-dns'
    }, 'native-custom-resolver');

    expect(adaptNodeToSingBox(node)).toMatchObject({ fatal: true, emitted: false });

    const template = JSON.parse(toSingBox([]));
    template.dns.servers.push({ type: 'local', tag: 'custom-dns' });
    const config = JSON.parse(toSingBox([node], JSON.stringify(template)));
    expect(config.outbounds.find((outbound: Record<string, any>) => (
      outbound.tag === 'custom-resolver-node'
    ))).toMatchObject({ domain_resolver: 'custom-dns' });

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-custom-resolver-'));
    const configPath = join(workDir, 'config.json');
    try {
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');

      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('assigns a stable non-empty tag to a tagless native server outbound', async () => {
    const nodes = await parseContent(JSON.stringify({
      outbounds: [{ type: 'socks', server: '127.0.0.1', server_port: 1080 }]
    }));
    expect(nodes).toHaveLength(1);
    expect(adaptNodeToSingBox(nodes[0]!)).toMatchObject({ fatal: false, emitted: true });

    const firstConfig = JSON.parse(toSingBox(nodes));
    const secondConfig = JSON.parse(toSingBox(nodes));
    const firstOutbound = firstConfig.outbounds.find((outbound: Record<string, any>) => (
      outbound.type === 'socks'
    ));
    const secondOutbound = secondConfig.outbounds.find((outbound: Record<string, any>) => (
      outbound.type === 'socks'
    ));
    expect(typeof firstOutbound?.tag).toBe('string');
    expect(firstOutbound.tag.trim().length).toBeGreaterThan(0);
    expect(secondOutbound?.tag).toBe(firstOutbound.tag);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-tagless-'));
    const configPath = join(workDir, 'config.json');
    try {
      firstConfig.inbounds[0].listen_port = 0;
      firstConfig.dns.rules = [];
      firstConfig.route.rules = [];
      firstConfig.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(firstConfig), 'utf8');

      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('recognizes standalone tagless native JSON and safely renames tagless duplicates', async () => {
    const standalone = parseSingleNode(JSON.stringify({
      type: 'vless', server: 'vless.example.com', server_port: 443,
      uuid: UUID, tls: { enabled: true }
    }));
    expect(standalone).not.toBeNull();
    expect(standalone?.source.format).toBe('singbox');
    expect(standalone?.name).toBe('vless vless.example.com:443');

    const nodes = await parseContent(JSON.stringify({
      outbounds: [
        { type: 'socks', server: '127.0.0.1', server_port: 1080 },
        { type: 'socks', server: '127.0.0.1', server_port: 1080 }
      ]
    }));
    expect(adaptNodesToSingBox(nodes).every(result => result.emitted && !result.fatal)).toBe(true);
    const config = JSON.parse(toSingBox(nodes));
    const tags = config.outbounds
      .filter((outbound: Record<string, any>) => outbound.type === 'socks')
      .map((outbound: Record<string, any>) => outbound.tag);
    expect(tags).toEqual(['socks 127.0.0.1:1080', 'socks 127.0.0.1:1080 02']);
  });

  test('preserves Linux-only routing_mark with an explicit platform warning', () => {
    const result = adaptNodeToSingBox(nativeNode({
      type: 'http', tag: 'linux-mark', server: 'http.example.com', server_port: 8080,
      routing_mark: '0x10'
    }));
    expect(result).toMatchObject({ fatal: false, emitted: true, lossy: true });
    expect(result.config?.routing_mark).toBe('0x10');
    expect(result.unsupportedParams).toContain('routing_mark');
  });

  test('rejects cross-format V2Ray QUIC when TLS is not enabled', async () => {
    const nodes = await parseContent(`
proxies:
  - name: VMess QUIC Without TLS
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: ${UUID}
    cipher: auto
    network: quic
`);
    expect(nodes).toHaveLength(1);
    const result = adaptNodeToSingBox(nodes[0]!);
    expect(result).toMatchObject({ fatal: true, emitted: false });
    expect(result.unsupportedParams).toContain('tls.enabled');
  });

  test('validates disabled native UDP-over-TCP structurally without applying the active version enum', () => {
    const accepted = [
      nativeNode({
        type: 'shadowsocks', tag: 'uot-disabled', server: '1.1.1.1', server_port: 8388,
        method: 'chacha20-ietf-poly1305', password: 'secret',
        udp_over_tcp: { enabled: false, version: 255 },
        multiplex: { enabled: true, protocol: 'smux' }
      }, 'native-uot'),
      nativeNode({
        type: 'shadowsocks', tag: 'mux-disabled', server: '1.0.0.1', server_port: 8388,
        method: 'chacha20-ietf-poly1305', password: 'secret',
        udp_over_tcp: { enabled: true, version: 2 },
        multiplex: { enabled: false }
      }, 'native-uot')
    ];
    expect(accepted.map(adaptNodeToSingBox).every(result => result.emitted && !result.fatal)).toBe(true);

    for (const [tag, version] of [['uot-string', '2'], ['uot-overflow', 256]] as const) {
      const result = adaptNodeToSingBox(nativeNode({
        type: 'shadowsocks', tag, server: '1.1.1.1', server_port: 8388,
        method: 'chacha20-ietf-poly1305', password: 'secret',
        udp_over_tcp: { enabled: false, version }
      }, 'native-uot-invalid'));
      expect(result).toMatchObject({ fatal: true, emitted: false });
      expect(result.unsupportedParams).toContain('udp_over_tcp.version');
    }

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-native-uot-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(accepted));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  test('accepts empty native ECH config and TLS certificate values', () => {
    const nodes = [
      nativeNode({
        type: 'http', tag: 'ech-empty-string', server: 'http.example.com', server_port: 443,
        tls: { enabled: true, ech: { enabled: true, config: '' } }
      }, 'native-empty-tls-material'),
      nativeNode({
        type: 'http', tag: 'ech-empty-list-item', server: 'http.example.com', server_port: 443,
        tls: { enabled: true, ech: { enabled: true, config: [''] } }
      }, 'native-empty-tls-material'),
      nativeNode({
        type: 'http', tag: 'certificate-empty-string', server: 'http.example.com', server_port: 443,
        tls: { enabled: true, certificate: '' }
      }, 'native-empty-tls-material'),
      nativeNode({
        type: 'http', tag: 'certificate-empty-list-item', server: 'http.example.com', server_port: 443,
        tls: { enabled: true, certificate: [''] }
      }, 'native-empty-tls-material')
    ];
    expect(nodes.map(adaptNodeToSingBox).every(result => result.emitted && !result.fatal)).toBe(true);

    const workDir = mkdtempSync(join(tmpdir(), 'cf-sub-singbox-empty-tls-material-'));
    const configPath = join(workDir, 'config.json');
    try {
      const config = JSON.parse(toSingBox(nodes));
      config.inbounds[0].listen_port = 0;
      config.dns.rules = [];
      config.route.rules = [];
      config.route.rule_set = [];
      writeFileSync(configPath, JSON.stringify(config), 'utf8');
      const result = spawnSync(
        singBoxBin,
        ['check', '--disable-color', '-D', workDir, '-c', configPath],
        { encoding: 'utf8' }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
