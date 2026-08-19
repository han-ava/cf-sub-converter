// src/adapters/singbox/index.ts
import { NodeEnvelope } from '../../types';

export function nodeToSingBoxOutbound(node: NodeEnvelope): Record<string, any> {
  // Sing-box 原样透传
  if (node.source.format === 'singbox') {
    return {
      ...node.protocolData,
      tag: node.name
    };
  }

  const base: Record<string, any> = {
    tag: node.name,
    server: node.server,
    server_port: node.port
  };

  const proto = (node.protocol || '').toLowerCase();
  const p: any = node.protocolData || {};

  switch (proto) {
    case 'ss':
    case 'shadowsocks': {
      const ob: Record<string, any> = {
        ...base,
        type: 'shadowsocks',
        method: p.cipher || 'chacha20-ietf-poly1305',
        password: p.password || ''
      };
      if (p.plugin) {
        ob.plugin = p.plugin;
        if (p['plugin-opts'] || p.pluginOpts) {
          ob.plugin_opts = p['plugin-opts'] || p.pluginOpts;
        }
      }
      return ob;
    }
    case 'vmess': {
      const ob: Record<string, any> = {
        ...base,
        type: 'vmess',
        uuid: p.uuid || p.id || '',
        security: p.cipher || p.scy || 'auto',
        alter_id: p.aid !== undefined ? Number(p.aid) : 0
      };
      if (p.tls) {
        ob.tls = {
          enabled: true,
          server_name: p.sni || p.servername || node.server,
          alpn: p.alpn
        };
        if (p.fingerprint || p.fp) {
          ob.tls.utls = { enabled: true, fingerprint: p.fingerprint || p.fp };
        }
        if (p.skipCertVerify) {
          ob.tls.insecure = true;
        }
      }
      const net = String(p.network || p.net || 'tcp').toLowerCase();
      if (net === 'ws') {
        ob.transport = {
          type: 'ws',
          path: p.wsPath || p.path || '/',
          headers: p.wsHeaders || (p.host ? { Host: p.host } : {})
        };
      } else if (net === 'grpc') {
        ob.transport = {
          type: 'grpc',
          service_name: p.grpcServiceName || p.path || ''
        };
      } else if (net === 'http' || net === 'h2') {
        ob.transport = {
          type: 'http',
          path: p.httpPath || p.path || '/',
          host: p.httpHost || p.host
        };
      }
      return ob;
    }
    case 'vless': {
      const ob: Record<string, any> = {
        ...base,
        type: 'vless',
        uuid: p.uuid || p.id || '',
        flow: p.flow || undefined
      };
      if (p.packetEncoding || p['packet-encoding'] || p.packet_encoding) {
        ob.packet_encoding = p.packetEncoding || p['packet-encoding'] || p.packet_encoding;
      }
      const reality = p.realityOpts || (typeof p.reality === 'object' ? p.reality : undefined) || p['reality-opts'];
      const isTls = p.tls !== undefined ? !!p.tls : (p.security === 'tls' || p.security === 'reality' || !!reality);
      if (isTls) {
        ob.tls = {
          enabled: true,
          server_name: p.sni || p.servername || node.server,
          alpn: p.alpn
        };
        if (p.fingerprint || p['client-fingerprint'] || p.fp) {
          ob.tls.utls = { enabled: true, fingerprint: p.fingerprint || p['client-fingerprint'] || p.fp };
        }
        if (p.skipCertVerify) {
          ob.tls.insecure = true;
        }
        if (reality && (reality.publicKey || reality['public-key'])) {
          ob.tls.reality = {
            enabled: true,
            public_key: reality.publicKey || reality['public-key'],
            short_id: reality.shortId || reality['short-id'] || ''
          };
        }
      }
      const net = String(p.type || p.network || 'tcp').toLowerCase();
      if (net === 'ws') {
        ob.transport = {
          type: 'ws',
          path: p.wsPath || p.path || '/',
          headers: p.wsHeaders || (p.host ? { Host: p.host } : {})
        };
      } else if (net === 'grpc') {
        ob.transport = {
          type: 'grpc',
          service_name: p.grpcServiceName || p.serviceName || ''
        };
      }
      return ob;
    }
    case 'trojan': {
      const ob: Record<string, any> = {
        ...base,
        type: 'trojan',
        password: p.password || '',
        tls: {
          enabled: true,
          server_name: p.sni || p.servername || node.server,
          alpn: p.alpn || ['h2', 'http/1.1'],
          insecure: !!p.skipCertVerify
        }
      };
      if (p.fingerprint || p['client-fingerprint']) {
        ob.tls.utls = { enabled: true, fingerprint: p.fingerprint || p['client-fingerprint'] };
      }
      const net = String(p.network || 'tcp').toLowerCase();
      if (net === 'ws') {
        ob.transport = {
          type: 'ws',
          path: p.wsPath || p.path || '/',
          headers: p.wsHeaders || (p.host ? { Host: p.host } : {})
        };
      } else if (net === 'grpc') {
        ob.transport = {
          type: 'grpc',
          service_name: p.grpcServiceName || p.serviceName || ''
        };
      }
      return ob;
    }
    case 'hysteria2':
    case 'hy2': {
      const ob: Record<string, any> = {
        ...base,
        type: 'hysteria2',
        password: p.password || '',
        tls: {
          enabled: true,
          server_name: p.sni || node.server,
          insecure: !!p.skipCertVerify
        }
      };
      if (p.alpn) ob.tls.alpn = p.alpn;
      if (p.obfs) {
        ob.obfs = {
          type: p.obfs,
          password: p.obfsPassword || p['obfs-password'] || ''
        };
      }
      if (p.up) ob.up_mbps = typeof p.up === 'number' ? p.up : parseInt(p.up, 10);
      if (p.down) ob.down_mbps = typeof p.down === 'number' ? p.down : parseInt(p.down, 10);
      return ob;
    }
    case 'anytls': {
      return {
        ...base,
        type: 'anytls',
        password: p.password || '',
        tls: {
          enabled: true,
          server_name: p.sni || node.server,
          alpn: p.alpn,
          insecure: !!p.skipCertVerify
        }
      };
    }
    case 'tuic': {
      return {
        ...base,
        type: 'tuic',
        uuid: p.uuid || '',
        password: p.password || '',
        congestion_control: p.congestionControl || 'bbr',
        udp_relay_mode: p.udpRelayMode || 'native',
        tls: {
          enabled: true,
          server_name: p.sni || node.server,
          alpn: p.alpn || ['h3'],
          insecure: !!p.skipCertVerify
        }
      };
    }
    default:
      return {
        ...base,
        type: proto,
        ...p
      };
  }
}
