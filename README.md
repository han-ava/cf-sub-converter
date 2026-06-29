# ⚡ CF Sub Converter Pro

基於 Cloudflare Workers 的 Serverless 訂閱轉換工具。擁有全新專業級的無廣告深色 UI，內建智慧過濾、替換、智慧國旗萬國對齊系統，以及 **Argo 隧道一鍵生成器**。一鍵將雜亂的訂閱或節點轉換為 Sing-Box / Clash Meta (Mihomo) / Base64 格式，亦可直接作為第三方轉換網頁（如 `sub-web`）的自定義後端。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sammy0101/cf-sub-converter)

## 🌟 特性

- 🎨 **專業級 UI** - 全新深色主題設計 (Slate/Zinc)，無廣告、純淨排版，搭配流暢的互動動畫與一鍵掃碼功能。
- 🌀 **Argo 隧道一鍵生成器** - 
  - **自動化克隆轉換**：一鍵載入貼入的節點，勾選 VLESS 或 VMess 節點，系統自動拷貝並轉換為對應的 Argo 隧道節點。
  - **超簡短一鍵 VPS 命令**：結合 Cloudflare KV 雲端動態腳本快取技術與 `curl | bash` 轉換，產生極簡 VPS 一鍵部署命令。
  - **雙層智慧探測校正**：VPS 部署時自動檢測本地連接埠與 TLS 加密，智慧避免 Proxy Protocol / TLS 握手衝突，並自動重寫 Host Header 與 TLS SNI。
- 📊 **流量與到期日智慧透傳** - 自動從上游多個機場擷取並**加總多個訂閱的流量（上傳、下載、總量），並自動計算最近的到期時間**，透過標準 `subscription-userinfo` 標頭透傳，完美點亮客戶端的流量條！
- ⚡ **標準 SubConverter 後端支援** - 內建 **`/sub`** 和 **`/version`** API 路由，回傳與您專案版本和網域動態對齊的標準格式（如 `subconverter v2.5.0 <your-worker-domain> backend`）並全面支援跨域 (CORS)。這使其可以直接做為任何第三方訂閱前端網頁（如 `sub-web`）的自定義後端。
- 🔍 **智慧過濾與替換** - 
  - **節點篩選**：支援「僅保留」與「排除」雙向過濾（使用 `|` 隔開，如 `HK|TW` 或 `5x`）。後端內建字元智慧相容技術，自動將 `x`、`X`、全形 `ｘ` 與數學乘號 `×` 進行互通匹配。
  - **名稱替換**：支援極簡統一的替換與刪除語法。刪除請用 `DEL-關鍵字`，替換請用 `尋找-替換`。
  - **💥 首創 `ALL-` 一鍵統改名稱**：若要將所有節點統一改名，請用 `ALL-新名稱`（例如 `ALL-JP`）。此功能配合我們的「智慧國旗」與「去重自動編號」系統，能將所有節點完美格式化為：`🇯🇵 JP`、`🇯🇵 JP_2`、`🇯🇵 JP_3` 等極致工整的排版。
- 🚩 **自動國旗與萬國標註** - 
  - **國旗智慧分群與 22 國黃金多梯隊排序**：自動將相同國家的節點緊密歸類在一起。並配有內建的黃金梯隊排序（港 🇭🇰 ➔ 台 🇹🇼 ➔ 日 🇯🇵 ➔ 星 🇸🇬 ➔ 美 🇺🇸 ➔ 英 🇬🇧 ➔ 澳 🇦🇺 等 22 個熱門地區），且會**自動將帶有 🇺🇳 標誌的臨時 Argo 佔位符或提醒節點置於列表最頂部（排在最前面）**，保證最流暢直觀的訂閱體驗。
  - 若遇到無對應國家的節點（如流量提示、機場官網），自動補上 🇺🇳 (聯合國國旗)，達成 100% 工整排版。
- 🔌 **全協議支援** - 完美解析 `Trojan`, `VLESS`, `VMess`, `Shadowsocks`, `Hysteria2 (hy2)`, `TUIC`, `AnyTLS` 等主流與新興協議。
- 🚀 **極速路由與 DNS** - 轉換出的配置檔內建頂級路由規則：
  - **Clash Meta**：流量嗅探 (Sniffer)、Fake-IP、TProxy 軟路由最佳化、中外 DNS 智慧解析。
  - **Sing-Box**：Mixed TUN 堆疊優化、獨立 DNS Kay、蘋果/國內服務精準直連。
- ☁️ **雲端與配置同步** - 運行在 Cloudflare 邊緣網絡，零成本運維。生成短連結時，**系統會將「資料來源、過濾規則、替換規則」打包存入 KV**，客戶端直接更新短連結即可自動套用所有規則，不需在客戶端 URL 後手動外掛複雜參數。

<img width="2559" height="1204" alt="螢幕擷取畫面 2026-06-29 181504" src="https://github.com/user-attachments/assets/c412badb-14ae-4a2c-937f-bd5ce3444b77" />

## 🚀 部署教學

### 方法一：一鍵快速部署 (最推薦、最簡單)

點擊本說明文件上方的 **Deploy to Cloudflare Workers** 藍色按鈕。

* **零設定自動託管**：Cloudflare 網頁部署精靈會引導您登入，並**在背景全自動為您建立並對接好所需的 KV 命名空間（`SUB_CACHE`）**，完全不需要您手動至儀表板綁定。
* **自建 CI/CD (Workers Builds)**：Cloudflare 會在您的 GitHub 下自動建立此專案的複製倉庫。未來您只要在 GitHub 修改並 `git push`，Cloudflare 就會自動在端點編譯部署，**此模式完全不需要設定 GitHub Secrets 密鑰**。

---

### 方法二：手動 Fork 本項目並使用 GitHub Actions 自動部署 (需要設定 Secrets)

如果您選擇**不使用**一鍵部署按鈕，而是打算手動 Fork 本項目，並利用專案內建的 GitHub Actions 自動進行部署，請按照以下步驟操作：

1. **Fork 本項目**：
   請先點擊本專案右上角的 **`Fork`** 按鈕，將專案複製一份到您自己的 GitHub 帳號下。

2. **設定 GitHub Repository Secrets**：
   前往您 GitHub 專案頁面，依次點擊 **`Settings`** -> **`Secrets and variables`** -> **`Actions`** -> **`New repository secret`**，並添加以下三個密鑰，否則 GitHub 部署工作流會報錯：
   * **`CF_API_TOKEN`**：您的 Cloudflare API 權杖。
     * *獲取方式*：Cloudflare 首頁 -> 我的個人資料 -> API 權杖 -> 建立具有「編輯 Workers 與 KV」權限的權杖。
   * **`CF_ACCOUNT_ID`**：您的 Cloudflare 帳戶 ID（可在 Worker 頁面右側找到）。
   * **`CF_KV_ID`**：您在 Cloudflare 上建立的 KV 命名空間 ID。
     * *獲取方式*：Cloudflare 儀表板 -> 鍵值儲存 (KV) -> 建立一個空間（例如 `SUB_CACHE`）並複製其 ID。

3. **Actions 執行部署**：
   設定完成後，當您對專案進行任何修改並推送（Push），或手動在倉庫的 **`Actions`** 頁面觸發 **`Deploy to Cloudflare Workers`** 工作流，GitHub 就會全自動為您編譯並完成部署。

---

### 方法三：本地手動編譯部署 (Wrangler CLI)

1. **克隆本專案**：
   ```bash
   git clone https://github.com/sammy0101/cf-sub-converter.git
   cd cf-sub-converter
   ```

2. **安裝專案依賴**：
   ```bash
   npm install
   ```

3. **創建並綁定 KV 命名空間**：
   ```bash
   wrangler kv:namespace create SUB_CACHE
   ```
   *執行後，將終端機回傳的配置代碼（包含 binding 和 id），複製並貼上取代您 `wrangler.toml` 中的 `KV_ID_PLACEHOLDER` 佔位符。*

4. **發布至 Cloudflare**：
   ```bash
   wrangler deploy
   ```

## 📖 使用指南

訪問你部署完成的 Workers 網址即可進入視覺化面板。

### 面板功能
- **資料來源設定**：支援貼上機場訂閱連結、Base64 字串，或直接貼上多行節點 URI。支援多個訂閱地址換行輸入，系統將保持原始順序進行合併。
- **Argo 隧道一鍵生成**：
  1. 在資料來源貼入您的機場訂閱或明文連結。
  2. 點選「解析並載入目前輸入的 VLESS / VMess 節點」，介面會自動拉出節點列表。
  3. 勾選您要轉換的節點，系統會自動在下方同步該節點的原生埠號。
  4. 設定 VPS 本地對接連接埠，點選「一鍵生成 Argo 節點與一鍵部署腳本」。
  5. 複製產生的簡短 `curl` 或 `wget` 指令至您的 VPS 上執行。
  6. 腳本成功執行後：
     * **臨時域名模式**：請在您的 VPS 終端機內直接複製最終生成、連通的 VLESS/VMess 節點。
     * **固定域名模式**：新生成的 Argo 節點（原節點名末尾加 `_Argo` 後綴）會直接顯示在網頁下方的明文列表框中，方便拷貝。
- **過濾與替換**：
  - **僅保留關鍵字**：只留下符合關鍵字的節點。例如輸入 `HK|TW`。
  - **排除關鍵字**：過濾掉垃圾或高倍率節點。例如輸入 `5x`（系統會自動相容 `5×` 乘號）。
  - **節點名稱替換**：刪除寫 `DEL-關鍵字`，替換寫 `尋找-替換`。若要一鍵重命名所有節點，請用 `ALL-新名稱`。多組規則用 `|` 隔開。
- **配置收藏**：常用的節點與過濾替換規則可以儲存到「已儲存的配置」區塊。卡片上會直觀地以綠色 `保`、紅色 `排` 和藍色 `替` 標籤顯示你所設定的規則，點擊卡片即可自動載入所有設定。

---

### 🔑 Cloudflare 固定隧道 (免費) 申請與配置教學

臨時隨機隧道（trycloudflare）雖然完全免設定，但缺點是每次 VPS 重啟或服務重開時，網域名稱都會改變。如果您想要擁有**永久固定不變的網域**，請依照以下步驟免費建立 Cloudflare 固定隧道：

#### 準備工作：
1. 一個 Cloudflare 帳戶。
2. 一個已成功託管（啟用橘色雲端 CDN）在您 Cloudflare 帳戶下的自訂域名（例如：`yourdomain.com`）。

#### 申請與設定步驟：

1. **進入 Zero Trust 面板**：
   登入 Cloudflare 儀表板，點擊左側選單中的 **`Zero Trust`**（首次進入需要點擊訂閱，選擇 Free 0元計劃並綁定卡片，完全不會扣款）。

2. **建立 Tunnel 隧道**：
   在 Zero Trust 介面中，點擊左側選單的 **`Networks`** -> **`Tunnels`**，然後點擊 **`Create a Tunnel`**。

3. **選擇安裝方式並複製 Token**：
   * 選擇 **`cloudflared`**，並為您的隧道取個名字（例如 `my-vps-tunnel`），點擊 Next。
   * 在安裝指令頁面，您會看到一串安裝指令。**請注意指令最末端的一長串 Base64 字元（這就是您的 Tunnel Token）**，將其複製下來，例如：
     `eyJhIjoiY2... (約 100~200 字元的超長字串)`

4. **配置域名路由（Public Hostname）**：
   * 在同一個頁面下方（或點擊已建立隧道的 Edit -> Public Hostname 標籤），點擊 **`Add a public hostname`**。
   * **Domain**：填入您要分配給此節點的子網域，例如：`vless.yourdomain.com`。
   * **Service**：
     * **Type（服務類型）**：
       * 如果您在網頁端對接的是 TLS 埠（如 **`8443`** 或 **`443`**）➔ 選擇 **`HTTPS`**。
       * 如果對接的是無加密明文埠（如 **`27110`** 或 **`31297`**）➔ 選擇 **`HTTP`**。
     * **URL**：輸入本地地址與埠，例如：`127.0.0.1:8443` 或 `127.0.0.1:27110`。
   * **💥 極致關鍵（HTTPS 模式必填）**：
     如果您在 Type 選擇了 `HTTPS`，請展開下方的 **`Additional HTTP settings`**，**並將 `No TLS Verify` 選項開啟（設定為 Enabled）**！這是為了允許隧道跳過 VPS 本地自我簽署證書的安全驗證，否則會出現 `530` 錯誤。
   * 設定完成後，點擊 **`Save hostname`** 保存。

5. **在網頁端生成固定隧道指令**：
   回到您部署的 **SubConverter Pro** 網頁：
   * 本地監聽連接埠：填入您 VPS 的真實埠（例如 `8443` 或 `27110`）。
   * Cloudflare Tunnel Token：貼上您剛才複製的超長 Token。
   * 自訂綁定域名：輸入您剛才在第 4 步綁定的網域（如 `vless.yourdomain.com`）。
   * 點擊生成指令，貼上 VPS 執行。您的固定安全隧道即告部署完成，節點將永遠不變！

---

### API 調用與外部前端對接

#### 1. 當作標準 SubConverter 後端使用
本專案內建對應 `/sub` 與 `/version` 端點。你可以打開任何一個開源的 `sub-web` 網頁（例如：`sub.id9.cc` 或其他的轉換前端），並在**「後端地址 (Backend URL)」**中，填入你的 Cloudflare Workers 網址：
```text
https://your-worker.workers.dev
```

#### 2. 自訂 API 參數格式
你也可以直接透過 URL 參數進行手動調用與過濾：

```http
# 轉換原始連結 + 僅保留港台 + 排除 5x 節點 + 移除 [69云] 廣告 + 將 移动优化 替換為 專線
https://your-worker.workers.dev/sub?url=<URL編碼後的訂閱連結>&target=singbox&include=HK|TW&exclude=5x&rename=DEL-[69云]|移动优化-專線

# 轉換短連結 + 自動套用在雲端 KV 中存好的過濾與名稱替換規則
https://your-worker.workers.dev/<自訂短連結名稱>?target=clash
```

## 🛡️ 內建分流規則群組

轉換出的 Sing-Box / Clash 配置文件預設包含以下精心設計的分流群組，開箱即用：

| 圖標 | 群組名稱 | 路由說明 |
| :--- | :--- | :--- |
| 🚀 | 節點選擇 | 手動切換所有可用節點 |
| ⚡ | 自動選擇 | 基於 URL Test 自動測速切換延遲最低的節點 |
| 💬 | AI 服務 | ChatGPT / Claude / 香港專屬分流 |
| 🍎 | 蘋果服務 | Apple 相關服務直連 or 代理 (自動依據網路環境切換最快 CDN) |
| Ⓜ️ | 微軟服務 | Microsoft 服務直連 or 代理 |
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
│   ├── index.ts          # Worker 主入口路由、並發請求控制、智慧過濾、雲端配置同步與 /version 後端模擬
│   ├── constants.ts      # 專業版 HTML 視圖模板與遠端規則常數 (含過濾、收藏與 Argo 隧道 UI)
│   ├── parser.ts         # 節點解析器 (支援 Trojan, AnyTLS, TUIC, Hy2 等)
│   ├── generator.ts      # 格式生成器 (映射為 Sing-Box / Clash Meta / Base64 / 原始連結明文導出)
│   ├── utils.ts          # Base64 淨化與智慧國旗自動標註系統 (豪華全球版 + 萬國 🇺🇳 對齊)
│   └── types.ts          # TypeScript 類型定義
├── argo.sh               # 上傳至 GitHub 倉庫的一鍵 VPS 隧道部署通用腳本
├── Sing-Box_Rules.JSON   # 遠端 Sing-Box 路由規則範本 (極速混合堆疊版)
├── Clash_Rules.YAML      # 遠端 Clash Meta 路由規則範本 (軟路由透明代理版)
└── wrangler.toml         # Cloudflare Workers 設定檔
```

## ⚠️ 免責聲明

本專案僅供技術交流與網路安全學習研究使用，不提供任何節點服務。請使用者務必遵守當地法律法規，勿將其用於任何違法用途，開發者對使用者的行為不承擔任何責任。
