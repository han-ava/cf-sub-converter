# CF Sub Converter

基於 Cloudflare Workers 的 Serverless 訂閱轉換工具。一鍵生成 Sing-Box / Clash / Base64 三種格式，適用於所有主流客戶端。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sammy0101/cf-sub-converter)

## 🌟 特性

- ⚡ **一鍵生成** - 自動產生 Sing-Box、Clash、Base64 三種格式
- ☁️ **Serverless** - 運行在 Cloudflare Workers，零成本運維
- 🛡️ **隱私安全** - 邊緣節點處理，不記錄用戶日誌
- 📱 **QR Code** - 支援手機掃碼新增訂閱
- ⭐ **雲端收藏** - 收藏常用訂閱，隨時取用

## 🚀 部署

### 方法一：一鍵部署

點擊上方 **Deploy to Cloudflare Workers** 按鈕。

### 方法二：手動部署

```bash
# 1. 克隆倉庫
git clone https://github.com/sammy0101/cf-sub-converter.git
cd cf-sub-converter

# 2. 安裝依賴
npm install

# 3. 創建 KV Namespace
wrangler kv:namespace create sub_cache

# 4. 部署
wrangler deploy
```

## 📖 使用方法

訪問你的 Workers 網址即可使用。

### 功能

- **輸入訂閱** - 貼上機場訂閱連結或節點
- **自訂短連結** - 設定名稱生成永久連結
- **一鍵生成** - 同時產生三種格式
- **QR Code** - 點擊📱按鈕查看大碼
- **雲端收藏** - 收藏常用訂閱

### URL 格式

```
https://your-worker.workers.dev/?url=<訂閱連結>&target=singbox
https://your-worker.workers.dev/?url=<訂閱連結>&target=clash
https://your-worker.workers.dev/?url=<訂閱連結>&target=base64

# 短連結
https://your-worker.workers.dev/<名稱>?target=singbox
```

## 🛡️ 內建分流群組

| 圖標 | 名稱 | 說明 |
| :--- | :--- | :--- |
| 🚀 | 節點選擇 | 手動切換節點 |
| ⚡ | 自動選擇 | 自動測速切換 |
| 💬 | AI 服務 | ChatGPT / Gemini / Claude |
| Ⓜ️ | 微軟服務 | Microsoft 服務 |
| 🎮 | 遊戲平台 | Steam / Epic / EA / Ubisoft |
| 🌐 | 非中國 | Google / Telegram 等 |
| 🍎 | 蘋果服務 | Apple 服務 |
| 🇨🇳 | 國內服務 | 中國直連 |
| 🏠 | 私有網絡 | 局域網 |
| 🛑 | 廣告攔截 | AdBlock |
| 🐟 | 漏網之魚 | Final Match |

## 📁 文件結構

```
cf-sub-converter/
├── src/
│   ├── index.ts          # 主入口
│   ├── constants.ts      # 常量 (HTML 頁面)
│   ├── parser.ts        # 訂閱解析
│   ├── generator.ts    # 格式生成
│   ├── utils.ts       # 工具函數
│   └── types.ts      # 類型定義
├── Sing-Box_Rules.JSON  # Sing-Box 範本
├── Clash_Rules.YAML    # Clash 範本
└── wrangler.toml     # Cloudflare 配置
```

## ⚠️ 免責聲明

本項目僅供技術學習和研究使用，請勿用於任何違法用途。