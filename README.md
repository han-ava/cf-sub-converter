# 🛡️ SubConverter Pro (纯净安全加固版)

基于 **Cloudflare Workers** 的轻量、无状态、高安全性 Serverless 订阅转换服务，专为个人私有部署设计。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/han-ava/cf-sub-converter)

---

## 🌟 核心改进与安全保障（对比原版）

| 安全/功能特性 | 原版 `cf-sub-converter` | 本项目 (纯净安全加固版) |
| :--- | :--- | :--- |
| **私有化与鉴权** | 🔴 任何人可无限制调用或滥用 | 🟢 **默认私有**：强制校验 `AUTH_TOKEN` Secret，杜绝沦为公开代理 |
| **数据隐私与持久化** | 🔴 `/favs` 无鉴权公开，所有机场订阅 Token 裸奔 | 🟢 **纯无状态设计**：收藏夹仅保存在客户端本地 `localStorage`，服务端零存储 |
| **未授权 KV 写入/篡改** | 🔴 `/save` 允许任意公网 IP 写入与污染 KV | 🟢 移除所有危险 KV 写入端点 |
| **Argo 脚本远程注入** | 🔴 动态拉取未校验的 `argo.sh` 并诱导 VPS root 执行 | 🟢 **彻底移除 Argo 模块**，专注订阅转换，杜绝供应链与 RCE 风险 |
| **外部规则模板依赖** | 🟠 每次转换动态请求 GitHub 仓库规则 | 🟢 **内置固化 Clash/Sing-box 规则模板**，无外部网络依赖与分流劫持风险 |
| **SSRF 防护与逐跳检查** | 🟡 无内网 IP 过滤，容易被滥用为公网扫描代理 | 🟢 覆盖 RFC1918 私有 IP、本地回环与端口白名单，**手动拦截每一跳 302 重定向** 安全校验 |
| **资源限额与防爆内存** | 🟡 无体积与并发限制 | 🟢 提前检查 `Content-Length`，限制 10MB 响应上限，并发池限制最大并发 6 |
| **精准边缘缓存** | 🟡 无缓存或容易串号 | 🟢 结合 **URL + User-Agent** 计算 SHA-256 缓存键，防止不同客户端拉取到混淆格式 |
| **无损转换架构** | 🔴 扁平化数据结构，解析即丢参数 | 🟢 **NodeEnvelope 无损架构**：Parser 100% 保全原始参数与未知 Query，Adapter 负责目标映射，杜绝静默丢参 |
| **零猜测编解码** | 🔴 全局 `tryDecodeURIComponent` 破坏密码字符 | 🟢 **严格按协议规范编解码**：Clash/Sing-box 密码原样透传，URI / Base64 按 RFC 规范处理 |
| **协议支持完整度** | 支持部分协议 | 完整支持 **VLESS (Reality/Vision/XHTTP)**, **VMess (多传输/自定义aid)**, **Shadowsocks (SIP002/SS2022/插件)**, **Hysteria 2 (全参数)**, **AnyTLS**, **Trojan**, **TUIC (v5)**, **SSR**, **Clash YAML** |

---

## 🚀 快速部署指南

### 方法一：Cloudflare 官方一键部署（最简单）

点击下方按钮，直接将本项目一键分发部署到你的 Cloudflare 账户：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/han-ava/cf-sub-converter)

---

### 方法二：使用 Wrangler 命令行部署（推荐开发者）

1. **克隆项目并安装依赖**：
   ```bash
   git clone https://github.com/han-ava/cf-sub-converter.git
   cd cf-sub-converter
   bun install # 或 npm install
   ```

2. **设置私有 AUTH_TOKEN（必需）**：
   ```bash
   npx wrangler secret put AUTH_TOKEN
   ```
   根据提示输入你的私有密码（例如 `MyCustomSecretKey_999`）。

3. **本地调试与验证**：
   ```bash
   bun run dev # 或 npm run dev
   ```

4. **一键发布到 Cloudflare Workers**：
   ```bash
   bun run deploy # 或 npm run deploy
   ```

---

### 方法三：在 Cloudflare Dashboard 网页端部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages** ➔ **Create Application** ➔ **Create Worker**。
2. 连接你的 GitHub 仓库（或使用一键部署按钮）。
3. 部署完成后，进入 Worker 详情页 ➔ **Settings** ➔ **Variables and Secrets** ➔ 点击 **Add** ➔ 选择 **Secret** 类型 ➔ 变量名填 `AUTH_TOKEN`，值填你的密码 ➔ 保存即可。

> 💡 **安全提示**：通过 Secret 方式配置的 Token 在后续的任何 Git 提交或自动构建中都会**永久保留**，绝不会被代码覆盖清空。

---

## 📡 API 使用文档

### 1. 标准订阅转换接口：`GET /sub` 或 `POST /api/convert`

**URL 示例**：
```text
https://your-worker.workers.dev/sub?url=https://airport.com/sub?token=xxx&target=clash&token=MyCustomSecretKey_999
```

#### 请求参数说明：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `url` | string | **是** | - | 原始机场订阅链接，或节点链接。支持 `\|` 或换行拼接多个订阅源 |
| `token` | string | **是** | - | 访问鉴权 Token（需与 Worker 的 `AUTH_TOKEN` Secret 一致，亦支持 `Authorization: Bearer <token>` 请求头） |
| `target` | string | 否 | `clash` / 自动识别 | 目标格式：`clash` (Clash Meta/Mihomo), `singbox`, `shadowrocket` (小火箭URI列表), `shadowrocket-conf` (.conf配置), `surge`, `base64`, `raw` |
| `preset` | string | 否 | `standard` | Clash 规则分流预设：`standard` (标准全能), `ai` (增强 AI/OpenAI 分流), `media` (增强流媒体分流) |
| `test_url` | string | 否 | `https://cp.cloudflare.com/generate_204` | 自动选择/延迟测速使用的 URL |
| `include` | string | 否 | - | 包含节点正则过滤，例如 `香港\|日本\|US` |
| `exclude` | string | 否 | - | 排除节点正则过滤，例如 `剩余\|到期\|官网\|0.1x` |
| `rename` | string | 否 | - | 节点重命名规则，格式为 `查找=替换`，多个规则可用换行或逗号隔开 |
| `emoji` / `flag` | boolean | 否 | `1` | 是否自动为节点名称添加国旗 Emoji（`1` 开启，`0` 关闭） |
| `info` / `show_info` | boolean | 否 | `1` | 是否在节点列表顶部插入剩余流量与到期时间展示节点（适用于 Base64 / Shadowrocket） |
| `info_mode` | string | 否 | `first` | 多订阅流量合并策略：`first` (仅保留首个订阅), `sum` (合并累加流量), `none` (不显示流量) |
| `udp` | boolean | 否 | `1` | 是否强制开启 UDP 转发（`1` 开启，`0` 关闭） |
| `filename` | string | 否 | `SubConverter` | 导出的配置文件名称 |
| `nocache` | string | 否 | `0` | 设为 `1` 时强制穿透边缘缓存，实时向上游机场拉取 |
| `cache_ttl` | number | 否 | `180` | 边缘缓存有效期（单位：秒，默认 3 分钟） |

---

### 2. 实时节点解析与预览接口：`POST /api/preview`

用于 Web 前端 UI 实时调试与节点透视，支持流量信息解析、地区分布统计与节点列表预览。

**请求体 (JSON)**：
```json
{
  "url": "https://airport.com/sub?token=xxx",
  "token": "MyCustomSecretKey_999",
  "include": "香港|日本",
  "exclude": "0.1x",
  "emoji": true
}
```

**响应示例 (JSON)**：
```json
{
  "ok": true,
  "totalRaw": 68,
  "totalMatched": 24,
  "userinfo": {
    "upload": 1073741824,
    "download": 10737418240,
    "total": 107374182400,
    "expire": 1780000000
  },
  "regions": {
    "🇭🇰 香港": 12,
    "🇯🇵 日本": 12
  },
  "nodes": [
    { "name": "🇭🇰 香港 01 [BGP]", "type": "vless", "server": "hk.example.com", "port": 443 }
  ]
}
```

---

### 3. 版本与健康检查接口：`GET /version`

**响应示例**：
```json
{
  "name": "cf-sub-converter",
  "version": "3.0.0-hardened",
  "status": "ok",
  "security": "hardened"
}
```

---

## 🧩 支持的代理协议

- **VLESS** (支持 TLS、Reality、XTLS-rprx-vision、XHTTP、WebSocket、gRPC)
- **VMess** (支持 WebSocket、gRPC、HTTP/H2、自定义 alterId、PacketEncoding、GlobalPadding)
- **Shadowsocks** (支持标准 SIP002、SS2022 以及 v2ray-plugin / obfs / shadow-tls 等多种插件)
- **Hysteria 2** (hy2，支持多端口 ports、hop-interval、obfs 混淆、带宽与跳过证书校验)
- **AnyTLS** (支持标准 AnyTLS 规范映射至 Mihomo / Sing-box)
- **Trojan** (支持 TLS、WebSocket、gRPC、ALPN)
- **TUIC** (v5，支持拥塞控制、UDP 中继模式与 0-RTT 握手)
- **ShadowsocksR** (SSR)
- **Clash YAML 订阅** (100% 原始透传解析与重构)

---

## 📱 客户端支持与一键导入

- **Clash 系列**：Clash Verge Rev、Clash Nyanpasu、Mihomo Party、Clash Meta for Android、ClashX.Meta
- **Sing-Box**：Sing-Box 全平台客户端 (JSON 配置与订阅)
- **Shadowrocket (小火箭)**：支持一键 URL Scheme 导入 (`shadowrocket://add/sub://...`) 或 `.conf` 配置文件
- **Surge**：Surge iOS / Mac
- **通用客户端**：Quantumult X, Loon, Stash, v2rayN, v2rayNG, sing-box 等

---

## 📄 License

MIT License

