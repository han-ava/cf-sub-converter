// src/adapters/mihomo/others.ts
import { AdapterResult, GenericProxyNode } from '../../types';

export function adaptOthersToMihomo(node: GenericProxyNode): AdapterResult {
  const p = node.protocolData || {};
  const proto = (node.protocol || '').toLowerCase();

  const base: Record<string, any> = {
    name: node.name,
    type: proto,
    server: node.server,
    port: node.port,
    udp: node.udp !== false
  };

  if (proto === 'socks5' || proto === 'socks') {
    return {
      config: {
        ...base,
        type: 'socks5',
        username: p.username || p.uuid || '',
        password: p.password || '',
        tls: !!p.tls,
        'skip-cert-verify': !!p.skipCertVerify
      },
      fatal: false,
      lossy: false,
      emitted: true,
      warnings: [],
      unsupportedParams: []
    };
  }

  if (proto === 'http' || proto === 'https') {
    return {
      config: {
        ...base,
        type: 'http',
        username: p.username || p.uuid || '',
        password: p.password || '',
        tls: proto === 'https' || !!p.tls,
        'skip-cert-verify': !!p.skipCertVerify
      },
      fatal: false,
      lossy: false,
      emitted: true,
      warnings: [],
      unsupportedParams: []
    };
  }

  if (proto === 'wireguard' || proto === 'wg') {
    return {
      config: {
        ...base,
        type: 'wireguard',
        ...p
      },
      fatal: false,
      lossy: false,
      emitted: true,
      warnings: [],
      unsupportedParams: []
    };
  }

  return {
    config: {
      ...base,
      ...p
    },
    fatal: false,
    lossy: false,
    emitted: true,
    warnings: [],
    unsupportedParams: []
  };
}
