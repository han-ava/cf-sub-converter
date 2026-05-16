import { ProxyNode } from "./types";

// --- 完美 Base64 解碼 (暴力過濾所有隱形與非法字元) ---
export function safeBase64Decode(str: string): string {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    
    while (b64.length % 4) b64 += '=';
    
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
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

// --- 自動加入國旗 Emoji 的智慧辨識系統 ---
export function addFlag(name: string): string {
  // 1. 如果名稱中已經包含國旗 Emoji (區域指示符號)，則不重複添加，防止變成 🇹🇼 🇹🇼 TW...
  if (/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/.test(name)) {
    return name;
  }

  // 2. 轉大寫進行比對
  const upper = name.toUpperCase();

  // 3. 根據關鍵字加上對應國旗 (\b 代表英文單字邊界，防止錯誤匹配)
  if (/\b(HK|HKG)\b|香港|深港|HONGKONG|HONG KONG/.test(upper)) return "🇭🇰 " + name;
  if (/\b(TW|TWN|TPE)\b|台灣|台湾|台北|新北|彰化/.test(upper)) return "🇹🇼 " + name;
  if (/\b(JP|JPN|TYO|OSA)\b|日本|东京|大阪|埼玉|沪日|川日|JAPAN/.test(upper)) return "🇯🇵 " + name;
  if (/\b(SG|SGP|SIN)\b|新加坡|狮城|SINGAPORE/.test(upper)) return "🇸🇬 " + name;
  if (/\b(US|USA|LAX|SFO|SJC|SEA|NYC)\b|美国|美利堅|洛杉矶|圣何塞|硅谷|波特兰|西雅图|AMERICA|UNITED STATES/.test(upper)) return "🇺🇸 " + name;
  if (/\b(KR|KOR|ICN|SEL)\b|韩国|首尔|KOREA/.test(upper)) return "🇰🇷 " + name;
  if (/\b(UK|GB|GBR|LHR)\b|英国|伦敦|BRITAIN|ENGLAND/.test(upper)) return "🇬🇧 " + name;
  if (/\b(DE|DEU|FRA)\b|德国|法兰克福|GERMANY/.test(upper)) return "🇩🇪 " + name;
  if (/\b(FR|FRA|CDG)\b|法国|巴黎|FRANCE/.test(upper)) return "🇫🇷 " + name;
  if (/\b(RU|RUS)\b|俄罗斯|莫斯科|RUSSIA/.test(upper)) return "🇷🇺 " + name;
  if (/\b(IN|IND)\b|印度|孟买|INDIA/.test(upper)) return "🇮🇳 " + name;
  if (/\b(CA|CAN)\b|加拿大|多伦多|温哥华|CANADA/.test(upper)) return "🇨🇦 " + name;
  if (/\b(AU|AUS)\b|澳大利亚|澳洲|悉尼|墨尔本|AUSTRALIA/.test(upper)) return "🇦🇺 " + name;
  if (/\b(CN|CHN)\b|中国|回国|国内|北京|上海|广州|深圳|CHINA/.test(upper)) return "🇨🇳 " + name;

  // 如果找不到對應的國家，直接回傳原名 (也可以在這裡加上 🌍)
  return name;
}

// --- 去重複命名與自動整理 ---
export function deduplicateNodeNames(nodes: ProxyNode[]): ProxyNode[] {
  const seenKey = new Set<string>();
  const nameCount = new Map<string, number>();

  return nodes.filter(node => {
    // 🔑 唯一識別：server + port + uuid/password
    const key = `${node.server}:${node.port}:${node.uuid || node.password || ''}`;

    if (seenKey.has(key)) return false;
    seenKey.add(key);

    let baseName = node.name || 'node';
    
    // ✨ 關鍵：在這裡幫節點名稱加上國旗
    baseName = addFlag(baseName);

    if (!nameCount.has(baseName)) {
      nameCount.set(baseName, 1);
      node.name = baseName;
    } else {
      const count = nameCount.get(baseName)! + 1;
      nameCount.set(baseName, count);
      node.name = `${baseName} (${count})`;
    }
    
    // 同步更新子物件中的名稱/標籤
    if (node.singboxObj) node.singboxObj.tag = node.name;
    if (node.clashObj) node.clashObj.name = node.name;

    return true;
  });
}
