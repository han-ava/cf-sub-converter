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
          aid: p.alterId !== undefined ? Number(p.alterId) : (p.aid !== undefined ? Number(p.aid) : (rawJson.aid !== undefined ? Number(rawJson.aid) : 0))
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

      // 3. 来源为 Clash YAML / Sing-box JSON 等，根据 protocolData 无损构建 URI
      const host = formatHost(node.server);
      const proto = (node.protocol || '').toLowerCase();

      if (proto === 'vless') {
        const params = new URLSearchParams();
        const reality = p.realityOpts || (typeof p.reality === 'object' ? p.reality : undefined) || p['reality-opts'] || p.tls?.reality;
        const isTls = p.tls?.enabled !== undefined ? !!p.tls.enabled : (p.tls !== false && (!!p.tls || !!reality));
        params.set('security', reality ? 'reality' : (isTls ? 'tls' : 'none'));

        const net = String(p.type || p.network || p.transport?.type || 'tcp').toLowerCase();
        params.set('type', net);

        if (p.flow) params.set('flow', p.flow);
        const packetEncoding = p.packetEncoding || p['packet-encoding'] || p.packet_encoding;
        if (packetEncoding) params.set('packetEncoding', packetEncoding);
        if (p.encryption) params.set('encryption', p.encryption);

        const sni = p.sni || p.servername || p['server-name'] || p.tls?.server_name;
        if (sni) params.set('sni', sni);

        const fp = p.fingerprint || p['client-fingerprint'] || p.fp || p.tls?.utls?.fingerprint || p.tls?.fingerprint;
        if (fp) params.set('fp', fp);

        const alpn = p.alpn || p.tls?.alpn;
        if (alpn) params.set('alpn', Array.isArray(alpn) ? alpn.join(',') : String(alpn));

        const skipCert = p.skipCertVerify || p['skip-cert-verify'] || p.tls?.insecure || p.insecure;
        if (skipCert) params.set('allowInsecure', '1');

        if (reality) {
          const pbk = reality.publicKey || reality['public-key'] || reality.public_key;
          const sid = reality.shortId || reality['short-id'] || reality.short_id;
          const spx = reality.spiderX || reality['spider-x'] || reality.spider_x;
          if (pbk) params.set('pbk', pbk);
          if (sid) params.set('sid', sid);
          if (spx) params.set('spx', spx);
        }

        if (net === 'ws') {
          const wsPath = p.wsPath || p.path || p.transport?.path || p['ws-opts']?.path || p['ws-path'];
          if (wsPath) params.set('path', wsPath);
          const wsHost = p.wsHeaders?.Host || p.transport?.headers?.Host || p['ws-opts']?.headers?.Host || p['ws-headers']?.Host || p.host;
          if (wsHost) params.set('host', wsHost);
        } else if (net === 'grpc') {
          const sName = p.grpcServiceName || p.transport?.serviceName || p.transport?.service_name || p['grpc-opts']?.['grpc-service-name'] || p['grpc-service-name'] || p.serviceName || p.path;
          if (sName) params.set('serviceName', sName);
          if (p.mode || p['grpc-opts']?.mode) params.set('mode', p.mode || p['grpc-opts']?.mode);
        } else if (net === 'xhttp' || net === 'splithttp') {
          const xPath = p['xhttp-opts']?.path || p['splithttp-opts']?.path || p.transport?.path || p.path;
          if (xPath) params.set('path', xPath);
          const xHost = p['xhttp-opts']?.host || p['splithttp-opts']?.host || p.transport?.host || p.host;
          if (xHost) params.set('host', xHost);
          const xMode = p['xhttp-opts']?.mode || p['splithttp-opts']?.mode || p.mode;
          if (xMode) params.set('mode', xMode);
          const xExtra = p['xhttp-opts']?.extra || p['splithttp-opts']?.extra || p.extra;
          if (xExtra) params.set('extra', typeof xExtra === 'object' ? JSON.stringify(xExtra) : String(xExtra));
        } else if (net === 'http' || net === 'h2') {
          const hPath = (Array.isArray(p['http-opts']?.path) ? p['http-opts'].path[0] : p['http-opts']?.path) || p['h2-opts']?.path || p.transport?.path || p.path;
          if (hPath) params.set('path', hPath);
          const hHost = (Array.isArray(p['http-opts']?.headers?.Host) ? p['http-opts'].headers.Host[0] : p['http-opts']?.headers?.Host) || (Array.isArray(p['h2-opts']?.host) ? p['h2-opts'].host[0] : p['h2-opts']?.host) || p.transport?.host || p.host;
          if (hHost) params.set('host', hHost);
        }

        // 追加未知参数
        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`vless://${p.uuid || p.id}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'vmess') {
        const net = String(p.network || p.net || p.transport?.type || p.type || 'tcp').toLowerCase();
        const isTls = p.tls?.enabled !== undefined ? !!p.tls.enabled : (typeof p.tls === 'boolean' ? p.tls : (String(p.tls).toLowerCase() === 'tls' || String(p.tls).toLowerCase() === 'true' || String(p.tls) === '1'));

        const sni = p.sni || p.servername || p['server-name'] || p.serverName || p.tls?.server_name;
        const fp = p.fingerprint || p['client-fingerprint'] || p.fp || p.tls?.utls?.fingerprint || p.tls?.fingerprint;
        const alpn = p.alpn || p.tls?.alpn;

        let headerType = 'none';
        if (p['mkcp-opts']?.header?.type) headerType = p['mkcp-opts'].header.type;
        else if (p.transport?.header?.type) headerType = p.transport.header.type;
        else if (p.headerType || p['header-type']) headerType = p.headerType || p['header-type'];
        else if (p.type && (net === 'mkcp' || net === 'kcp' || net === 'tcp')) headerType = p.type;

        let wsHost = '';
        let wsPath = '';
        if (net === 'ws') {
          wsHost = p.wsHeaders?.Host || p.transport?.headers?.Host || p['ws-opts']?.headers?.Host || p['ws-headers']?.Host || p.host || '';
          wsPath = p.wsPath || p.path || p.transport?.path || p['ws-opts']?.path || p['ws-path'] || '/';
        } else if (net === 'grpc') {
          wsPath = p.grpcServiceName || p.serviceName || p.transport?.serviceName || p.transport?.service_name || p['grpc-opts']?.['grpc-service-name'] || p['grpc-service-name'] || p.path || '';
        } else if (net === 'http' || net === 'h2') {
          wsHost = (Array.isArray(p['http-opts']?.headers?.Host) ? p['http-opts'].headers.Host.join(',') : p['http-opts']?.headers?.Host) || (Array.isArray(p['h2-opts']?.host) ? p['h2-opts'].host.join(',') : p['h2-opts']?.host) || p.transport?.host || p.host || '';
          wsPath = (Array.isArray(p['http-opts']?.path) ? p['http-opts'].path[0] : p['http-opts']?.path) || p['h2-opts']?.path || p.transport?.path || p.path || '/';
        } else if (net === 'xhttp' || net === 'splithttp') {
          wsHost = p['xhttp-opts']?.host || p['splithttp-opts']?.host || p.transport?.host || p.host || '';
          wsPath = p['xhttp-opts']?.path || p['splithttp-opts']?.path || p.transport?.path || p.path || '/';
        } else {
          wsHost = p.host || '';
          wsPath = p.path || '';
        }

        const vmessObj: Record<string, any> = {
          v: '2',
          ps: node.name,
          add: node.server,
          port: node.port,
          id: p.uuid || p.id || '',
          aid: p.alterId !== undefined ? Number(p.alterId) : (p.aid !== undefined ? Number(p.aid) : (p.alter_id !== undefined ? Number(p.alter_id) : 0)),
          scy: p.cipher || p.scy || p.security || 'auto',
          net: net,
          type: headerType || 'none',
          host: wsHost,
          path: wsPath,
          tls: isTls ? 'tls' : ''
        };

        if (isTls && sni) vmessObj.sni = sni;
        if (alpn) vmessObj.alpn = Array.isArray(alpn) ? alpn.join(',') : String(alpn);
        if (fp) vmessObj.fp = fp;

        const packetEncoding = p.packetEncoding || p['packet-encoding'] || p.packet_encoding;
        if (packetEncoding) vmessObj.packetEncoding = packetEncoding;

        if (p.seed || p['mkcp-opts']?.seed) vmessObj.seed = p.seed || p['mkcp-opts']?.seed;

        links.push(`vmess://${safeBase64Encode(JSON.stringify(vmessObj))}`);
      } else if (proto === 'hysteria2' || proto === 'hy2' || proto === 'hysteria') {
        const params = new URLSearchParams();
        const sni = p.sni || p.servername || p['server-name'] || p.tls?.server_name;
        if (sni) params.set('sni', sni);

        const obfsType = p.obfs?.type || p.obfs;
        const obfsPass = p.obfs?.password || p['obfs-password'] || p.obfsPassword;
        if (obfsType) {
          params.set('obfs', obfsType);
          if (obfsPass) params.set('obfs-password', obfsPass);
        }
        const skipCert = p.skipCertVerify || p['skip-cert-verify'] || p.tls?.insecure || p.insecure;
        if (skipCert) params.set('insecure', '1');
        const alpn = p.alpn || p.tls?.alpn;
        if (alpn) params.set('alpn', Array.isArray(alpn) ? alpn.join(',') : String(alpn));
        const pin = p.certificateFingerprint || p.fingerprint || p.pinSHA256 || p['pinSHA256'];
        if (pin) params.set('pinSHA256', pin);
        const ports = p.ports || p.mport || p['mport'];
        if (ports) params.set('mport', String(ports));
        const hopInterval = p.hopInterval || p['hop-interval'];
        if (hopInterval) params.set('hop-interval', String(hopInterval));
        const up = p.up || p.up_mbps;
        if (up) params.set('up', String(up));
        const down = p.down || p.down_mbps;
        if (down) params.set('down', String(down));

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`hysteria2://${encodeURIComponent(p.password || p.uuid || '')}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'anytls') {
        const params = new URLSearchParams();
        const sni = p.sni || p.servername || p['server-name'] || p.tls?.server_name;
        if (sni) params.set('sni', sni);
        const alpn = p.alpn || p.tls?.alpn;
        if (alpn) params.set('alpn', Array.isArray(alpn) ? alpn.join(',') : String(alpn));
        const skipCert = p.skipCertVerify || p['skip-cert-verify'] || p.insecure || p.tls?.insecure;
        if (skipCert) params.set('insecure', '1');
        const fp = p['client-fingerprint'] || p.fingerprint || p.fp || p.tls?.utls?.fingerprint || p.tls?.fingerprint;
        if (fp) params.set('fp', fp);

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`anytls://${encodeURIComponent(p.password || '')}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'trojan') {
        const params = new URLSearchParams();
        const sni = p.sni || p.servername || p['server-name'] || p.tls?.server_name;
        if (sni) params.set('sni', sni);
        const net = String(p.network || p.transport?.type || p.type || 'tcp').toLowerCase();
        params.set('type', net);
        const alpn = p.alpn || p.tls?.alpn;
        if (alpn) params.set('alpn', Array.isArray(alpn) ? alpn.join(',') : String(alpn));
        const skipCert = p.skipCertVerify || p['skip-cert-verify'] || p.tls?.insecure || p.insecure;
        if (skipCert) params.set('allowInsecure', '1');
        const fp = p.fingerprint || p['client-fingerprint'] || p.fp || p.tls?.utls?.fingerprint || p.tls?.fingerprint;
        if (fp) params.set('fp', fp);

        if (net === 'ws') {
          const wsPath = p.wsPath || p.path || p.transport?.path || p['ws-opts']?.path || p['ws-path'];
          if (wsPath) params.set('path', wsPath);
          const wsHost = p.wsHeaders?.Host || p.host || p.transport?.headers?.Host || p['ws-opts']?.headers?.Host || p['ws-headers']?.Host;
          if (wsHost) params.set('host', wsHost);
        } else if (net === 'grpc') {
          const sName = p.grpcServiceName || p.serviceName || p.transport?.serviceName || p.transport?.service_name || p['grpc-opts']?.['grpc-service-name'] || p.path;
          if (sName) params.set('serviceName', sName);
        }

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        links.push(`trojan://${encodeURIComponent(p.password || '')}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'ss' || proto === 'shadowsocks') {
        const cipher = p.cipher || p.method || 'chacha20-ietf-poly1305';
        const password = p.password || '';
        const userPass = safeBase64Encode(`${cipher}:${password}`);
        const params = new URLSearchParams();
        if (p.plugin) {
          let pluginVal = p.plugin;
          const opts = p['plugin-opts'] || p.pluginOpts || p.plugin_opts;
          if (opts && typeof opts === 'object') {
            const optParts: string[] = [];
            for (const [k, v] of Object.entries(opts)) {
              optParts.push(v === true ? k : `${k}=${v}`);
            }
            if (optParts.length > 0) pluginVal += `;${optParts.join(';')}`;
          }
          params.set('plugin', pluginVal);
        }
        if (p['udp-over-tcp'] || p.udpOverTcp || p.uot) params.set('udp-over-tcp', '1');
        if (p['udp-over-tcp-version'] || p.udpOverTcpVersion) params.set('udp-over-tcp-version', String(p['udp-over-tcp-version'] || p.udpOverTcpVersion));
        const query = params.toString() ? `?${params.toString()}` : '';
        links.push(`ss://${userPass}@${host}:${node.port}${query}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'ssr' || proto === 'shadowsocksr') {
        const cipher = p.cipher || 'aes-128-cfb';
        const password = p.password || '';
        const protocol = p.protocol || 'origin';
        const obfs = p.obfs || 'plain';
        const passwordB64 = safeBase64Encode(password);

        const mainPart = `${node.server}:${node.port}:${protocol}:${cipher}:${obfs}:${passwordB64}`;
        const params: string[] = [];
        if (node.name) params.push(`remarks=${safeBase64Encode(node.name)}`);
        const obfsParam = p.obfsParam || p['obfs-param'] || p.obfs_param;
        if (obfsParam) params.push(`obfsparam=${safeBase64Encode(String(obfsParam))}`);
        const protoParam = p.protoParam || p['protocol-param'] || p.proto_param || p.protocolParam;
        if (protoParam) params.push(`protoparam=${safeBase64Encode(String(protoParam))}`);
        const queryPart = params.length > 0 ? `/?${params.join('&')}` : '';
        links.push(`ssr://${safeBase64Encode(`${mainPart}${queryPart}`)}`);
      } else if (proto === 'tuic') {
        const params = new URLSearchParams();
        const sni = p.sni || p.servername || p['server-name'] || p.tls?.server_name;
        if (sni) params.set('sni', sni);
        const congestion = p.congestionControl || p['congestion-controller'] || p.congestion_control;
        if (congestion) params.set('congestion_control', congestion);
        const udpRelay = p.udpRelayMode || p['udp-relay-mode'] || p.udp_relay_mode;
        if (udpRelay) params.set('udp_relay_mode', udpRelay);
        const alpn = p.alpn || p.tls?.alpn;
        if (alpn) params.set('alpn', Array.isArray(alpn) ? alpn.join(',') : String(alpn));
        const skipCert = p.skipCertVerify || p['skip-cert-verify'] || p.tls?.insecure || p.insecure;
        if (skipCert) params.set('allow_insecure', '1');

        const extras = p.extras || (node as any).unknownParams;
        if (extras) {
          for (const [k, v] of Object.entries(extras)) {
            if (!params.has(k)) params.set(k, String(v));
          }
        }

        const user = p.uuid || '';
        const pass = p.password || p.token || '';
        const auth = user && pass ? `${user}:${pass}` : (user || pass);
        links.push(`tuic://${auth}@${host}:${node.port}?${params.toString()}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'socks5' || proto === 'socks') {
        const user = p.username || p.uuid || '';
        const pass = p.password || '';
        const auth = user && pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : (user ? `${encodeURIComponent(user)}@` : '');
        links.push(`socks5://${auth}${host}:${node.port}#${encodeURIComponent(node.name)}`);
      } else if (proto === 'http' || proto === 'https') {
        const scheme = proto === 'https' || p.tls ? 'https' : 'http';
        const user = p.username || p.uuid || '';
        const pass = p.password || '';
        const auth = user && pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : (user ? `${encodeURIComponent(user)}@` : '');
        links.push(`${scheme}://${auth}${host}:${node.port}#${encodeURIComponent(node.name)}`);
      }
    } catch (err: any) {
      console.warn(`[toRawLinks] Failed to serialize node "${node.name}" (${node.protocol}):`, err?.message || err);
    }
  }

  return links.join('\n');
}

/**
 * 转换为 Base64 订阅
 * 严格基于 Lossless Raw Links 编码，并在有输入节点但全部序列化失败时抛错防护
 */
export function toBase64(nodes: NodeEnvelope[]): string {
  const raw = toRawLinks(nodes);
  if (nodes.length > 0 && !raw.trim()) {
    throw new Error('Base64 output is empty: no nodes could be serialized');
  }
  return safeBase64Encode(raw);
}
