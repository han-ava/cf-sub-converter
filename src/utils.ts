import { ProxyNode } from "./types";

export function safeBase64Decode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  try { return atob(str); } catch { return ""; }
}

export function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export function tryDecodeURIComponent(str: string): string {
  try { return decodeURIComponent(str); } catch (e) { return str; }
}

export function deduplicateNodeNames(nodes: ProxyNode[]): ProxyNode[] {
  const nameCounts = new Map<string, number>();
  return nodes.map(node => {
    let finalName = node.name;
    if (nameCounts.has(node.name)) {
      const count = nameCounts.get(node.name)! + 1;
      nameCounts.set(node.name, count);
      finalName = `${node.name} ${count}`;
    } else {
      nameCounts.set(node.name, 1);
    }
    const newNode = { ...node, name: finalName };
    if (newNode.singboxObj) newNode.singboxObj.tag = finalName;
    if (newNode.clashObj) newNode.clashObj.name = finalName;
    return newNode;
  });
}

// --- 終極修復：保留 ServerKey:ClientKey 結構 ---
export function normalizeSS2022Key(key: string): string {
  if (!key) return "";
  try { key = decodeURIComponent(key); } catch(e) {}
  
  // 透過冒號分割 (ServerKey 和 ClientKey)
  const parts = key.split(':');
  
  // 分別清洗每一段 Key，確保 Base64 標準化且不互相干擾
  const cleanedParts = parts.map(part => {
      let clean = part.replace(/-/g, '+').replace(/_/g, '/');
      clean = clean.replace(/[^A-Za-z0-9\+\/]/g, ""); // 移除所有非 Base64 字元
      const pad = clean.length % 4;
      if (pad) {
          clean += '='.repeat(4 - pad);
      }
      return clean;
  });

  // 重新用冒號組裝回去
  return cleanedParts.join(':');
}
