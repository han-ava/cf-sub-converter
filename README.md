# ⚡ CF Sub Converter

基於 Cloudflare Workers 的 Serverless 訂閱轉換工具。擁有全新專業級的深色 UI，一鍵解析並生成 Sing-Box / Clash Meta (Mihomo) / Base64 格式，完美支援各種最新代理協議。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sammy0101/cf-sub-converter)

## 🌟 核心特性

- 🎨 **專業級 UI** - 全新深色主題設計 (Slate/Zinc)，無廣告、純淨排版，搭配流暢的互動動畫與操作回饋。
- ⚡ **全能轉換** - 一鍵智能解析，自動產生 Sing-Box (JSON)、Clash Meta (YAML)、Base64 三種格式。
- 🔌 **多協議支援** - 完美解析 `VLESS`, `VMess`, `Trojan`, `Shadowsocks`, `Hysteria2 (hy2)`, `TUIC`, `AnyTLS` 等主流與新興協議。
- ☁️ **Serverless** - 運行在 Cloudflare 邊緣網絡，零伺服器成本，極致的存取速度。
- 🛡️ **隱私安全** - 代碼開源透明，無後端日誌記錄，資料儲存於個人的 Cloudflare KV 空間。
- 📱 **便捷操作** - 支援自訂專屬短連結、配置雲端收藏 (增刪改查)、手機 QR Code 掃碼訂閱。

## 🚀 部署教學

### 方法一：一鍵部署 (推薦)

點擊上方的 **Deploy to Cloudflare Workers** 按鈕，依照畫面指示登入 Cloudflare 帳號即可自動完成部署。

*(註：一鍵部署後，請記得至 Cloudflare 儀表板為該 Worker 綁定一個名為 `SUB_CACHE` 的 KV 命名空間，否則收藏與短連結功能將無法使用)*

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

3. **創建 KV Namespace**
   ```bash
   wrangler kv:namespace create SUB_CACHE
   ```
   *執行後，終端機會回傳一段配置代碼，請將其複製並貼上到你的 `wrangler.toml` 文件中。*

4. **部署到 Cloudflare**
   ```bash
   wrangler deploy
   ```

## 📖 使用指南

訪問你部署完成的 Workers 網址即可進入視覺化面板。

### 面板功能
- **資料來源設定**：支援貼上機場訂閱連結或直接貼上多行節點 URI。
- **自訂短連結**：設定後，可生成如 `https://your-domain.com/my-sub` 這樣簡短且永久不變的訂閱連結。
- **配置收藏**：常用的節點組合可以儲存到「已儲存的配置」區塊，支援跨裝置讀取。

### API 調用格式
若不使用圖形化介面，你也可以直接透過 URL 參數進行轉換：

```http
# 轉換原始連結
https://your-worker.workers.dev/?url=<URL編碼後的訂閱連結>&target=singbox
https://your-worker.workers.dev/?url=<URL編碼後的訂閱連結>&target=clash
https://your-worker.workers.dev/?url=<URL編碼後的訂閱連結>&target=base64

# 使用短連結
https://your-worker.workers.dev/<自訂短連結名稱>?target=singbox
```

## 🛡️ 內建分流規則群組

轉換後的 Sing-Box / Clash 配置文件預設包含以下精心設計的分流群組，開箱即用：

| 圖標 | 群組名稱 | 路由說明 |
| :--- | :--- | :--- |
| 🚀 | 節點選擇 | 手動切換所有可用節點 |
| ⚡ | 自動選擇 | 基於 URL Test 自動測速切換延遲最低的節點 |
| 💬 | AI 服務 | ChatGPT / Gemini / Claude / Copilot 專屬分流 |
| 🍎 | 蘋果服務 | Apple 相關服務直連或代理 |
| Ⓜ️ | 微軟服務 | Microsoft 服務直連或代理 |
| 🎮 | 遊戲平台 | Steam / Epic / EA / Ubisoft / Blizzard |
| 🌐 | 非中國 | 全球主流網站 (Google, Telegram 等) |
| 🇨🇳 | 國內服務 | 中國大陸 IP 與域名自動直連 |
| 🏠 | 私有網絡 | 局域網 (LAN / 內網) 直連 |
| 🛑 | 廣告攔截 | 阻擋常見廣告、追蹤器 (AdBlock) |
| 🐟 | 漏網之魚 | Final Match (未匹配規則的最終去向) |

## 📁 專案結構

```text
cf-sub-converter/
├── src/
│   ├── index.ts          # Worker 主入口路由
│   ├── constants.ts      # HTML 視圖模板與遠端規則常數
│   ├── parser.ts         # 節點協議解析器 (支援 AnyTLS/TUIC/Hy2 等)
│   ├── generator.ts      # 格式生成器 (映射為 Sing-Box / Clash / Base64)
│   ├── utils.ts          #  Base64 解碼等共用工具
│   └── types.ts          # TypeScript 類型定義
├── Sing-Box_Rules.JSON   # 遠端 Sing-Box 路由規則範本
├── Clash_Rules.YAML      # 遠端 Clash Meta 路由規則範本
└── wrangler.toml         # Cloudflare Workers 配置文件
```

## ⚠️ 免責聲明

本項目僅供技術交流與學習研究使用，不提供任何節點服務。請使用者務必遵守當地法律法規，勿將其用於任何違法用途，開發者對使用者的行為不承擔任何責任。
