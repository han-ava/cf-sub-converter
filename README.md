# ⚡ CF Sub Converter Pro

基於 Cloudflare Workers 的 Serverless 訂閱轉換工具。擁有全新專業級的無廣告深色 UI，內建智慧節點過濾系統，一鍵將雜亂的訂閱或節點轉換為 Sing-Box / Clash Meta (Mihomo) / Base64 格式，完美支援所有最新代理協議與進階路由策略。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sammy0101/cf-sub-converter)

## 🌟 特性

- 🎨 **專業級 UI** - 全新深色主題設計 (Slate/Zinc)，無廣告、純淨排版，搭配流暢的互動動畫與一鍵掃碼功能。
- 🔍 **智慧節點過濾** - 支援**「僅保留」**與**「排除」**雙向關鍵字過濾。使用 `|` 符號分隔（例如 `HK|TW` 或 `重置|官網`）。後端自動利用高效率正則比對，且**內建字元智慧相容技術（自動將英文字母 x/X、全形 ｘ/Ｘ 與數學乘號 × 進行互通匹配，解決如 `5x` 與 `5×` 的過濾衝突）**。
- 🚩 **自動國旗標註** - 內建全球國旗資料庫，自動為節點名稱補上對應的國家國旗 Emoji (如 🇹🇼、🇭🇰、🇯🇵、🇲🇴、🇰🇭、🇬🇷、🇵🇱 等 40+ 國家與常用機場機場縮寫)，讓節點列表更清晰，並與分流規則完美對應。
- 🔌 **全協議支援** - 完美解析 `Trojan`, `VLESS`, `VMess`, `Shadowsocks`, `Hysteria2 (hy2)`, `TUIC`, `AnyTLS` 等主流與新興協議。
- 🚀 **極速路由與 DNS** - 轉換出的配置檔內建頂級路由規則：
  - **Clash Meta**：流量嗅探 (Sniffer)、Fake-IP、TProxy 軟路由最佳化、中外 DNS 智慧解析。
  - **Sing-Box**：Mixed TUN 堆疊優化、獨立 DNS 快取、蘋果/國內服務精準直連。
- ☁️ **雲端與配置同步** - 運行在 Cloudflare 邊緣網絡，零成本運維。生成短連結時，**系統會將「資料來源、保留規則、排除規則」打包存入 KV**，客戶端直接更新短連結即可自動套用過濾規則，不需在客戶端 URL 後手動拼接複雜參數。

## 🚀 部署教學

### 方法一：一鍵部署 (推薦)

點擊上方的 **Deploy to Cloudflare Workers** 按鈕，依照畫面指示登入 Cloudflare 帳號即可自動完成部署。

*(⚠️ 注意：一鍵部署後，請務必至 Cloudflare 儀表板為該 Worker 綁定一個名為 `SUB_CACHE` 的 KV 命名空間，否則「收藏配置」與「短連結」功能將無法使用)*

### 方法二：手動部署 (Wrangler CLI)

1. **克隆倉庫**
   ```bash
   git clone https://github.com/sammy0101/cf-sub-converter.git
   cd cf-sub-converter
   ```

2. **安裝依賴**
   ```bash
   npm install
   ```

3. **創建 KV 命名空間**
   ```bash
   wrangler kv:namespace create SUB_CACHE
   ```
   *執行後，終端機會回傳一段配置代碼，請將其複製並貼上到你的 `wrangler.toml` 檔案中。*

4. **部署到 Cloudflare**
   ```bash
   wrangler deploy
   ```

## 📖 使用指南

訪問你部署完成的 Workers 網址即可進入視覺化面板。

### 面板功能
- **資料來源設定**：支援貼上機場訂閱連結、Base64 字串，或直接貼上多行節點 URI。支援多個訂閱地址換行輸入，系統將保持原始順序進行合併。
- **過濾關鍵字**：
  - **僅保留關鍵字**：只留下符合關鍵字的節點。例如輸入 `HK|TW`。
  - **排除關鍵字**：過濾掉垃圾或高倍率節點。例如輸入 `官網|過期|5x`（系統會自動相容 `5×` 乘號）。
- **配置收藏**：常用的節點與過濾規則可以儲存到「已儲存的配置」區塊。卡片上會直觀地以綠色 `保` 和紅色 `排` 標籤顯示你所設定的過濾規則，點擊卡片即可自動載入所有設定（含過濾字串）。

### API 調用格式
若不使用圖形化介面，也可以直接透過 URL 參數進行轉換與過濾：

```http
# 轉換原始連結 + 僅保留香港與台灣節點 + 排除 5x 倍率節點
https://your-worker.workers.dev/?url=<URL編碼後的訂閱連結>&target=singbox&include=HK|TW&exclude=5x

# 轉換短連結 + 自動套用在雲端 KV 中存好的過濾規則
https://your-worker.workers.dev/<自訂短連結名稱>?target=clash
```

## 🛡️ 內建分流規則群組

轉換出的 Sing-Box / Clash 配置文件預設包含以下精心設計的分流群組，開箱即用：

| 圖標 | 群組名稱 | 路由說明 |
| :--- | :--- | :--- |
| 🚀 | 節點選擇 | 手動切換所有可用節點 |
| ⚡ | 自動選擇 | 基於 URL Test 自動測速切換延遲最低的節點 |
| 💬 | AI 服務 | ChatGPT / Gemini / Claude / Copilot 專屬分流 |
| 🍎 | 蘋果服務 | Apple 相關服務直連或代理 (自動依據網路環境切換最快 CDN) |
| Ⓜ️ | 微軟服務 | Microsoft 服務直連或代理 |
| 🎮 | 遊戲平台 | Steam / Epic / EA / Ubisoft / Blizzard |
| 🌐 | 非中國 | 全球主流網站 (Google, Telegram 等) |
| 🇨🇳 | 國內服務 | 中國大陸 IP 與網域自動直連 (精準 IP 解析) |
| 🏠 | 私有網絡 | 區域網路 (LAN / 內網) 直連 |
| 🛑 | 廣告攔截 | 阻擋常見廣告、追蹤器 (AdBlock) |
| 🐟 | 漏網之魚 | Final Match (未匹配規則的最終去向) |

## 📁 專案結構

```text
cf-sub-converter/
├── src/
│   ├── index.ts          # Worker 主入口路由、並發請求控制、智慧過濾與雲端配置同步
│   ├── constants.ts      # 專業版 HTML 視圖模板與遠端規則常數 (含過濾與收藏 UI)
│   ├── parser.ts         # 節點解析器 (支援 Trojan, AnyTLS, TUIC, Hy2 等)
│   ├── generator.ts      # 格式生成器 (映射為 Sing-Box / Clash Meta / Base64)
│   ├── utils.ts          # Base64 淨化與智慧國旗自動標註系統 (豪華全球版)
│   └── types.ts          # TypeScript 類型定義
├── Sing-Box_Rules.JSON   # 遠端 Sing-Box 路由規則範本 (極速混合堆疊版)
├── Clash_Rules.YAML      # 遠端 Clash Meta 路由規則範本 (軟路由透明代理版)
└── wrangler.toml         # Cloudflare Workers 設定檔
```

## ⚠️ 免責聲明

本專案僅供技術交流與網路安全學習研究使用，不提供任何節點服務。請使用者務必遵守當地法律法規，勿將其用於任何違法用途，開發者對使用者的行為不承擔任何責任。
