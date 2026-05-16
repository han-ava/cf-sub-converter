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

// --- 自動加入國旗 Emoji 的智慧辨識系統 (修復底線與數字問題) ---
export function addFlag(name: string): string {
  // 1. 如果名稱中已經包含國旗 Emoji (區域指示符號)，則跳過不處理
  if (/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/.test(name)) {
    return name;
  }

  const upper = name.toUpperCase();

  // 2. 輔助函數：精準匹配代碼 (允許代碼前後是數字、底線、減號，但不能是英文字母)
  const isMatch = (codes: string, keywords: string) => {
    // 例如：找 TW，前面不能是字母，後面也不能是字母 (但可以是 _, -, 或數字)
    const codeRegex = new RegExp(`(?:^|[^A-Z])(${codes})(?![A-Z])`);
    const keywordRegex = new RegExp(`(${keywords})`);
    return codeRegex.test(upper) || keywordRegex.test(upper);
  };

  // 3. 執行比對並加上對應國旗
  if (isMatch('HK|HKG', '香港|深港|HONGKONG|HONG KONG')) return "🇭🇰 " + name;
  if (isMatch('TW|TWN|TPE', '台灣|台湾|台北|新北|彰化')) return "🇹🇼 " + name;
  if (isMatch('JP|JPN|TYO|OSA', '日本|东京|大阪|埼玉|沪日|川日|JAPAN')) return "🇯🇵 " + name;
  if (isMatch('SG|SGP|SIN', '新加坡|狮城|SINGAPORE')) return "🇸🇬 " + name;
  if (isMatch('US|USA|LAX|SFO|SJC|SEA|NYC', '美国|美利堅|洛杉矶|圣何塞|硅谷|波特兰|西雅图|AMERICA|UNITED STATES')) return "🇺🇸 " + name;
  if (isMatch('KR|KOR|ICN|SEL', '韩国|首尔|KOREA')) return "🇰🇷 " + name;
  if (isMatch('UK|GB|GBR|LHR', '英国|伦敦|BRITAIN|ENGLAND')) return "🇬🇧 " + name;
  if (isMatch('DE|DEU|FRA', '德国|法兰克福|GERMANY')) return "🇩🇪 " + name;
  if (isMatch('FR|FRA|CDG', '法国|巴黎|FRANCE')) return "🇫🇷 " + name;
  if (isMatch('RU|RUS', '俄罗斯|莫斯科|RUSSIA')) return "🇷🇺 " + name;
  if (isMatch('IN|IND', '印度|孟买|INDIA')) return "🇮🇳 " + name;
  if (isMatch('CA|CAN', '加拿大|多伦多|温哥华|CANADA')) return "🇨🇦 " + name;
  if (isMatch('AU|AUS', '澳大利亚|澳洲|悉尼|墨尔本|AUSTRALIA')) return "🇦🇺 " + name;
  if (isMatch('CN|CHN', '中国|回国|国内|北京|上海|广州|深圳|CHINA')) return "🇨🇳 " + name;

  // 如果找不到國家，直接回傳原名
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
    
    // ✨ 在這裡幫節點名稱加上國旗
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
