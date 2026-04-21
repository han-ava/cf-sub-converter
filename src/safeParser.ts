// 文件名: src/safeParser.ts

/**
 * 1. 安全的 UTF-8 Base64 解碼函數 (Cloudflare Worker 專用)
 * 專門處理缺少 padding (=)、帶有隱藏換行符、或是包含中文別名的髒數據
 */
export function safeBase64DecodeUtf8(str: string): string {
    try {
        // 將 URL Safe Base64 轉為標準 Base64
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
        // 移除所有非合法 Base64 字符 (最關鍵的一步：清除換行符 \n 與空格)
        b64 = b64.replace(/[^A-Za-z0-9+/=]/g, '');
        
        // 補齊等號 (Padding)，確保長度是 4 的倍數
        while (b64.length % 4 !== 0) {
            b64 += '=';
        }
        
        // 使用 TextDecoder 替代已廢棄的 escape，在 CF Worker 兼容性更完美
        const binaryString = atob(b64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder("utf-8").decode(bytes);
    } catch (error) {
        console.warn("Base64 解碼失敗，已攔截崩潰:", error);
        return ""; // 解碼失敗返回空字串，防止整個 Worker 掛掉
    }
}

/**
 * 2. 重新編碼安全的 UTF-8 Base64 (用於重新打包 VMess)
 */
export function safeBase64EncodeUtf8(str: string): string {
    try {
        // 使用 TextEncoder 替代已廢棄的 unescape
        const bytes = new TextEncoder().encode(str);
        let binaryString = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }
        return btoa(binaryString);
    } catch (error) {
        return btoa(str); // 降級處理
    }
}

/**
 * 3. 鏈接預處理與過濾
 * 在代碼執行 new URL() 之前，先修復非標準或有語法錯誤的 URI
 */
export function sanitizeNodeUrl(link: string): string {
    let sanitized = link.trim();
    
    // 修正 anytls:// 強制轉為標準 vless://
    sanitized = sanitized.replace(/^anytls:\/\//i, 'vless://');
    
    // 修正 hysteria2:// 強制轉為 hy2://
    sanitized = sanitized.replace(/^hysteria2:\/\//i, 'hy2://');
    
    // 修正 URI 查詢參數錯誤，例如 "?&sni=" 替換成 "?sni="
    sanitized = sanitized.replace(/\?&+/g, '?');
    
    return sanitized;
}

/**
 * 4. 完整的單個節點容錯解析封裝
 * @param link 原始節點鏈接
 * @param originalParser 您原本項目中負責解析單一節點的函數 (例如 parseUrl 或類似方法)
 */
export function parseNodeSafely(link: string, originalParser: (url: string) => any): any {
    if (!link || typeof link !== 'string') return null;

    try {
        // 第一步：清洗鏈接，修復 anytls, hysteria2 與查詢參數問號錯誤
        const cleanLink = sanitizeNodeUrl(link);

        // 第二步：針對 VMess 做特別的 Base64 容錯處理
        if (cleanLink.toLowerCase().startsWith('vmess://')) {
            const b64Data = cleanLink.substring(8);
            const decodedJsonStr = safeBase64DecodeUtf8(b64Data);
            
            if (!decodedJsonStr) {
                console.warn(`[跳過] VMess 節點解析失敗: ${cleanLink.substring(0, 30)}...`);
                return null; 
            }

            // 測試 JSON 是否完整，若完整則重新封裝成純淨的 Base64 鏈接丟給原代碼
            try {
                JSON.parse(decodedJsonStr); // 確保是合法的 JSON 對象
                const cleanVmessLink = `vmess://${safeBase64EncodeUtf8(decodedJsonStr)}`;
                return originalParser(cleanVmessLink);
            } catch (jsonErr) {
                console.warn(`[跳過] VMess JSON 格式損壞: ${decodedJsonStr}`);
                return null;
            }
        }

        // 第三步：其他標準節點 (Vless/Trojan/TUIC/HY2)，直接交給原有的解析器處理
        return originalParser(cleanLink);
        
    } catch (error) {
        // 第四步：攔截任何未知錯誤（如 new URL 崩潰、缺少協議等），返回 null 阻斷 500 錯誤
        console.warn(`[容錯保護] 未知解析錯誤，跳過該節點: ${link.substring(0, 30)}...`);
        return null; 
    }
}

/**
 * 5. 主遍歷陣列替換函數 (已補齊內容)
 * 使用此函數替換掉您代碼中解析節點陣列的入口
 * @param rawLinks 未處理的節點字串陣列
 * @param originalParser 您原本解析單個節點的函數
 * @returns 過濾且解析完成的可用節點陣列
 */
export function processAllNodesSafe(rawLinks: string[], originalParser: (url: string) => any): any[] {
    if (!Array.isArray(rawLinks)) return[];
    
    const parsedNodes =
