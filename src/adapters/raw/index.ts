// src/adapters/raw/index.ts
import { NodeEnvelope } from '../../types';
import { renameRawUri, safeBase64Encode } from '../../utils';

export function formatHost(server: string): string {
  return server.includes(':') && !server.startsWith('[') ? `[${server}]` : server;
}

/**
 * 转换为明文链接列表（一列一条节点）
 * 严格原则：如果来源为 URI，禁止重新拼装，使用 renameRawUri 100% 保持原始协议参数与未知 Query
 */
export function toRawLinks(nodes: NodeEnvelope[]): string {
  const links: string[] = [];

  for (const node of nodes) {
    try {
      // 1. 如果来源本身是 URI 格式，直接原样透传 + 仅改 #节点名称
      if (node.source.format === 'uri' && node.source.raw) {
        links.push(renameRawUri(node.source.raw, node.name));
        continue;
      }

      const p: any = node.protocolData || {};

      // 2. 如果来源是 VMess JSON
      if (node.source.format === 'vmess-json') {
        const rawJson = p.rawJson || {};
        const vmessObj = {
          ...rawJson,
          ...p,
          ps: node.name,
          add: node.server,
          port: node.port,
          id: p.uuid || p.id || rawJson.id,
          aid: p.alterId !== undefined ? p.alterId : (p.aid !== undefined ? p.aid : (rawJson.aid !== undefined ? rawJson.aid : 0))
        };
        // 清理内部附加的非标准辅助字段
        delete (vmessObj as any).rawJson;
        delete (vmessObj as any).invalidParams;
        delete (vmessObj as any).extras;
        delete (vmessObj as any).transport;
        delete (vmessObj as any).security;
        links.push(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
        continue;
      }

      // 3. 来源为 Clash YAML / Sing-box JSON，根据 protocolData 无损构建 URI
      const host = formatHost(node.server);
      const proto = (node.protocol || '').toLowerCase();

      if (proto === 'vless') {
        const params = new URLSearchParams();
        const reality = p.realityOpts || (typeof p.reality === 'object' ? p.reality : undefined) || p['reality-opts'];
        const isTls = p.tls !== false && (p.tls || !!reality);
        params.set('security', reality ? 'reality' : (isTls ? 'tls' : 'none'));
        params.set('type', p.type || p.network || p.transport?.type || 'tcp');
        if (p.flow) params.set('flow', p.flow);
        if (p.packetEncoding || p['packet-encoding']) params.set('packetEncoding', p.packetEncoding || p['packet-encoding']);
        if (p.encryption) params.set('encryption', p.encryption);
        if (p.sni || p.servername) params.set('sni', p.sni || p.servername);
        if (p.fingerprint || p['client-fingerprint']) params.set('fp', p.fingerprint || p['client-fingerprint']);
        if (p.alpn) params.set('alpn', Array.isArray(p.alpn) ? p.alpn.join(',') : String(p.alpn));
        if (p.skipCertVerify || p['skip-cert-verify']) params.set('allowInsecure', '1');

        if (reality) {
          const pbk = reality.publicKey || reality['public-key'];
          const sid = reality.shortId || reality['short-id'];
          const spx = reality.spiderX || reality['spider-x'];
          if (pbk) params.set('pbk', pbk);
          if (sid) params.set('sid', sid);
          if (spx) params.set('spx', spx);
        }

        const net = String(p.type || p.network || p.transport?.type || 'tcp').toLowerCase();
        if (net === 'ws') {
          if (p.wsPath || p.path || p.transport?.path || p['ws-opts']?.path) params.set('path', p.wsPath || p.path || p.transport?.path || p['ws-opts']?.path);
          const wsHost = p.wsHeaders?.Host || p.transport?.headers?.Host || p['ws-opts']?.headers?.Host || p.host;
          if (wsHost) params.set('host', wsHost);
        } else if (net === 'grpc') {
          const sName = p.grpcServiceName || p.transport?.serviceName || p['grpc-opts']?.['grpc-service-name'] || p.serviceName;
          if (sName) params.set('serviceName', sName);
        }

        // 追加未知参数
        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`vless://${p.uuid || p.id}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'hysteria2' || proto === 'hy2') {
        const params = new URLSearchParams();
        if (p.sni) params.set('sni', p.sni);
        if (p.obfs) {
          params.set('obfs', p.obfs);
          if (p['obfs-password'] || p.obfsPassword) params.set('obfs-password', p['obfs-password'] || p.obfsPassword);
        }
        if (p.skipCertVerify || p['skip-cert-verify']) params.set('insecure', '1');
        if (p.alpn) params.set('alpn', Array.isArray(p.alpn) ? p.alpn.join(',') : String(p.alpn));
        if (p.certificateFingerprint || p.fingerprint) params.set('pinSHA256', p.certificateFingerprint || p.fingerprint);

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`hysteria2://${p.password}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'anytls') {
        const params = new URLSearchParams();
        if (p.sni) params.set('sni', p.sni);
        if (p.alpn) params.set('alpn', Array.isArray(p.alpn) ? p.alpn.join(',') : String(p.alpn));
        if (p.skipCertVerify || p['skip-cert-verify']) params.set('insecure', '1');
        if (p['client-fingerprint'] || p.fingerprint) params.set('fp', p['client-fingerprint'] || p.fingerprint);

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`anytls://${p.password}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'trojan') {
        const params = new URLSearchParams();
        if (p.sni) params.set('sni', p.sni);
        params.set('type', p.network || p.transport?.type || 'tcp');
        if (p.alpn) params.set('alpn', Array.isArray(p.alpn) ? p.alpn.join(',') : String(p.alpn));
        if (p.skipCertVerify || p['skip-cert-verify']) params.set('allowInsecure', '1');
        if (p.fingerprint || p['client-fingerprint']) params.set('fp', p.fingerprint || p['client-fingerprint']);

        const net = String(p.network || p.transport?.type || 'tcp').toLowerCase();
        if (net === 'ws') {
          if (p.wsPath || p.path || p.transport?.path) params.set('path', p.wsPath || p.path || p.transport?.path);
          if (p.wsHeaders?.Host || p.host || p.transport?.headers?.Host) params.set('host', p.wsHeaders?.Host || p.host || p.transport?.headers?.Host);
        } else if (net === 'grpc') {
          if (p.grpcServiceName || p.serviceName || p.transport?.serviceName) params.set('serviceName', p.grpcServiceName || p.serviceName || p.transport?.serviceName);
        }

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`trojan://${p.password}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'ss' || proto === 'shadowsocks') {
        const userPass = safeBase64Encode(`${p.cipher || 'chacha20-ietf-poly1305'}:${p.password}`);
        const params = new URLSearchParams();
        if (p.plugin) {
          let pluginVal = p.plugin;
          const opts = p['plugin-opts'] || p.pluginOpts;
          if (opts && typeof opts === 'object') {
            const optParts: string[] = [];
            for (const [k, v] of Object.entries(opts)) {
              optParts.push(v === true ? k : `${k}=${v}`);
            }
            if (optParts.length > 0) pluginVal += `;${optParts.join(';')}`;
          }
          params.set('plugin', pluginVal);
        }
        if (p['udp-over-tcp'] || p.udpOverTcp) params.set('udp-over-tcp', '1');
        const query = params.toString() ? `?${params.toString()}` : '';
        links.push(`ss://${userPass}@${host}:${node.port}${query}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'tuic') {
        const params = new URLSearchParams();
        if (p.sni) params.set('sni', p.sni);
        if (p.congestionControl || p['congestion-controller']) params.set('congestion_control', p.congestionControl || p['congestion-controller']);
        if (p.udpRelayMode || p['udp-relay-mode']) params.set('udp_relay_mode', p.udpRelayMode || p['udp-relay-mode']);
        if (p.alpn) params.set('alpn', Array.isArray(p.alpn) ? p.alpn.join(',') : String(p.alpn));
        if (p.skipCertVerify || p['skip-cert-verify']) params.set('allow_insecure', '1');

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`tuic://${p.uuid || ''}:${p.password || ''}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      }
    } catch {}
  }

  return links.join('\n');
}

/**
 * 转换为 Base64 订阅
 * 严格基于 Lossless Raw Links 编码
 */
export function toBase64(nodes: NodeEnvelope[]): string {
  return safeBase64Encode(toRawLinks(nodes));
}
