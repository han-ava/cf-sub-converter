import { ProxyNode } from "./types";

// --- 完美 Base64 解碼 (支援 UTF-8 與 Emoji) ---
export function safeBase64Decode(str: string): string {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    
    // 1. 先解碼為二進制字串
    const binaryStr = atob(b64);
    
    // 2. 轉為 Uint8Array
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    // 3. 使用 TextDecoder 以 UTF-8 格式解碼 (這是保留 Emoji 的關鍵)
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return "";
  }
}

export function utf8ToBase64(str: string): string {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode(parseInt(p1, 16));
        }));
  } catch (e) {
    return btoa(str);
  }
}

export function tryDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

export function deduplicateNodeNames(nodes: ProxyNode[]): ProxyNode[] {
  const seenKey = new Set<string>();
  const nameCount = new Map<string, number>();

  return nodes.filter(node => {
    // 🔑 關鍵：唯一識別（server + port + uuid）
    const key = `${node.server}:${node.port}:${node.uuid || node.password || ''}`;

    // 👉 已存在 → 直接丟掉（真正去重）
    if (seenKey.has(key)) {
      return false;
    }

    seenKey.add(key);

    // 👉 再處理「名稱重複」
    let name = node.name || 'node';

    if (!nameCount.has(name)) {
      nameCount.set(name, 1);
      node.name = name;
      return true;
    }

    const count = nameCount.get(name)! + 1;
    nameCount.set(name, count);

    node.name = `${name} (${count})`;
    return true;
  });
}

