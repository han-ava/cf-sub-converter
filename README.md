# 🛡️ SubConverter Pro (纯净安全加固版)

基于 **Cloudflare Workers** 的轻量、高安全性 Serverless 订阅转换服务，专为个人私有部署设计。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/han-ava/cf-sub-converter)

---

## 🌟 核心改进与安全保障（对比原版）

| 安全/功能特性 | [原版 `cf-sub-converter`](https://github.com/sammy0101/cf-sub-converter) | 本项目 (纯净安全加固版) |
| :--- | :--- | :--- |
| **私有化与鉴权** | 🔴 任何人可无限制调用或滥用 | 🟢 **默认私有**：强制校验 `AUTH_TOKEN` Secret，杜绝沦为公开代理 |
| **数据隐私与持久化** | 🔴 `/favs` 无鉴权公开，所有机场订阅 Token 裸奔 | 🟢 收藏夹仅保存在客户端；只有用户主动生成的短链会写入私有 KV |
| **未授权 KV 写入/篡改** | 🔴 `/save` 允许任意公网 IP 写入与污染 KV | 🟢 短链写入强制校验 `AUTH_TOKEN`，且只接受当前域名下的订阅转换链接 |
| **Argo 脚本远程注入** | 🔴 动态拉取未校验的 `argo.sh` 并诱导 VPS root 执行 | 🟢 **彻底移除 Argo 模块**，专注订阅转换，杜绝供应链与 RCE 风险 |
| **外部规则模板依赖** | 🟠 每次转换动态请求 GitHub 仓库规则 | 🟢 **内置固定分流模板**：转换时不拉取外部模板；Mihomo/Sing-box 由客户端更新 MetaCubeX 核心规则集，Shadowrocket 使用专用规则源 |
| **SSRF 防护与逐跳检查** | 🟡 无内网 IP 过滤，容易被滥用为公网扫描代理 | 🟢 阻断显式 RFC1918 私有 IP 与本地回环地址，保留公网 HTTP/HTTPS 非标准端口兼容，并对每一跳 3xx 重定向重新执行安全校验 |
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

   项目使用 Wrangler 4.45+ 自动创建并绑定 `SHORT_LINKS` KV，无需手动填写 Namespace ID。

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
https://your-worker.workers.dev/sub?url=https://airport.com/sub?token=xxx&target=auto&token=MyCustomSecretKey_999
```

#### 请求参数说明：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `url` | string | **是** | - | 原始机场订阅链接，或节点链接。支持 `\|` 或换行拼接多个订阅源 |
| `token` | string | **是** | - | 访问鉴权 Token（需与 Worker 的 `AUTH_TOKEN` Secret 一致，亦支持 `Authorization: Bearer <token>` 请求头） |
| `target` | string | 否 | `auto` | 目标格式：`auto` 会根据客户端 User-Agent 自动识别 Shadowrocket、Clash/Mihomo/Stash、Sing-box 或 Surge（未识别时返回 Clash Meta）；也可显式指定 `clash`, `singbox`, `shadowrocket`, `shadowrocket-conf`, `surge`, `base64`, `raw` |
| `preset` | string | 否 | `standard` | 仅用于 Clash 的规则预设：`standard` (标准全能), `ai` (增强 AI/OpenAI 分流), `media` (增强流媒体分流), `minimal` (不使用远程 rule-provider，仅内联本地/局域网与 `.cn`，其余国内匹配依赖客户端内置 GeoSite/GeoIP) |
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
  "target": "singbox",
  "include": "香港|日本",
  "exclude": "0.1x",
  "emoji": true
}
```

**响应示例 (JSON)**：
```json
{
  "ok": true,
  "requestedTarget": "singbox",
  "resolvedTarget": "singbox",
  "autoTargetFallback": false,
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

预览会按 `target` 对每个节点给出 `perfect`、`warning` 或 `fatal` 状态，并保证 `fatal` 节点不会出现在相应目标的最终输出中。`target=auto` 无法预知将来拉取订阅的客户端，因此预览响应会通过 `autoTargetFallback: true` 明确标出当前请求所采用的回退目标；实际订阅仍会按客户端 User-Agent 重新判定。

---

### 3. 短链接口：`POST /api/shorten`

只接受当前 Worker 域名下的 `/sub` 或 `/api/convert` 链接，并使用同一域名返回 `/s/{code}` 短链。创建短链需要有效的 `AUTH_TOKEN`；短链本身应视为私密订阅凭证。

**请求体 (JSON)**：
```json
{
  "url": "https://your-worker.workers.dev/sub?url=...&target=auto&token=MyCustomSecretKey_999"
}
```

**响应示例 (JSON)**：
```json
{
  "shortUrl": "https://your-worker.workers.dev/s/AbCdEf123456"
}
```

---

### 4. 版本与健康检查接口：`GET /version`

**响应示例**：
```json
{
  "name": "cf-sub-converter",
  "version": "3.0.0-hardened",
  "status": "ok",
  "security": "hardened",
  "short_links_configured": true
}
```

---

## 🧩 支持的代理协议

协议能否无损输出取决于目标客户端。预览接口会逐节点返回 `perfect`、`warning` 或 `fatal`；转换不会静默输出已判定为 `fatal` 的节点。

- **VLESS** (支持 TLS、Reality、XTLS-rprx-vision、XHTTP、WebSocket、gRPC)
- **VMess** (支持 WebSocket、gRPC、HTTP/H2、自定义 alterId、PacketEncoding、GlobalPadding)
- **Shadowsocks** (支持标准 SIP002、SS2022 以及 v2ray-plugin / obfs / shadow-tls 等多种插件)
- **Hysteria 2** (hy2，支持多端口 ports、hop-interval、obfs 混淆、带宽与跳过证书校验)
- **AnyTLS** (支持标准 AnyTLS 规范映射至 Mihomo / Sing-box)
- **Trojan** (支持 TLS、WebSocket、gRPC、ALPN)
- **TUIC** (v5，支持拥塞控制、UDP 中继模式与 0-RTT 握手)
- **ShadowsocksR** (SSR)
- **Clash YAML 订阅** (100% 原始透传解析与重构)

### Sing-box 目标兼容范围

当前生成器以最新稳定版 [**sing-box v1.13.21**](https://github.com/SagerNet/sing-box/releases/tag/v1.13.21) 为目标：

- URI / Clash 节点可转换 Shadowsocks、VMess、VLESS、Trojan、Hysteria 2、AnyTLS 与 TUIC v5；V2Ray transport 支持 TCP、WebSocket、gRPC、HTTP/H2、HTTPUpgrade 与 QUIC。
- 输入为 Sing-box JSON 时，完整保留 v1.13.21 的 13 类服务器型 outbound：SOCKS、HTTP、Shadowsocks、VMess、Trojan、Naive、Hysteria、SSH、ShadowTLS、VLESS、AnyTLS、TUIC 与 Hysteria 2；字段、类型、嵌套选项和引用通过版本门禁后原样输出，不受上述跨格式协议白名单限制。`detour` 仅允许引用同一份原生配置中仍被保留的 outbound。
- Linux / Android 平台专属字段（如 `routing_mark`、`bind_address_no_port`、`netns`、`protect_path` 与 kTLS）会保留并在预览中明确提示平台限制；在不支持的平台导入，官方 Sing-box 也会拒绝。证书、私钥或 ECH 配置的本地文件路径仍由最终运行设备负责提供。
- 内联 X.509 与未加密私钥会做结构和可推导的公钥配对校验（包括 Ed25519）；证书扩展和密钥的完整密码学语义仍以最终 Sing-box 为准。加密 SSH 私钥会校验封装、cipher/KDF 与口令是否提供，但 Worker 不执行 bcrypt/AES 解密，口令正确性、密文完整性及解密后的密钥由最终 Sing-box 校验；这些延期校验会在预览中标为 `warning`。
- 为限制恶意输入的解析成本，原生 duration 文本最长 128 个字符；官方 Go duration 解析器可接受但最终截断为零的超长极小数会被本服务拒绝。仅含空白的 outbound `tag` / `detour` 也会作为歧义配置拒绝，而不是按官方宽松解码继续输出。
- ShadowsocksR（sing-box 已于 1.6 移除）、不受支持的 Shadowsocks 插件、XHTTP / SplitHTTP、mKCP / MeKya、Hysteria 2 `gecko`（1.14 才引入）、无法等价为公钥指纹的 Hysteria 2 `pinSHA256`，以及 TUIC v4/token-only 节点不会降级输出，而会在预览中列为 `fatal` 并注明不支持的参数。
- 未识别或无法映射的可选参数会列入 `unsupportedParams`；若全部节点均为 `fatal`，`/sub` 返回 HTTP 422，不会生成看似成功但只有 `direct` 的配置。
- CI 固定下载并校验官方 v1.13.21 Linux 二进制；协议矩阵、原生 schema 与默认完整配置都必须通过 `sing-box check`，默认配置还会执行短时 `sing-box run` 启动验证。

---

## 📱 客户端支持与一键导入

- **Clash 系列**：Clash Verge Rev、Clash Nyanpasu、Mihomo Party、Clash Meta for Android、ClashX.Meta，以及支持 MRS 的 Stash 3.1+
- **Sing-Box**：面向最新稳定版 v1.13.21 的 JSON 配置，国内域名/IP 与广告规则集由客户端定期更新
- **SFI / SFM / SFT / SFA / SFW / SFL**：官方 Apple、Android、Windows 与 Linux 图形客户端的订阅请求会按 User-Agent 自动加入 TUN 入站以接管系统流量，同时保留 mixed 本地代理入口；普通 Sing-box CLI 输出不强制启用 TUN
- **Shadowrocket (小火箭)**：支持一键 URL Scheme 导入 (`shadowrocket://add/sub://...`) 或带完整分流的 `.conf` 配置文件
- **Surge**：输出 Surge iOS / Mac 可引用的 `[Proxy]` 列表，不包含规则段
- **通用客户端**：Quantumult X、Loon、v2rayN、v2rayNG、sing-box 等

### 分流顺序与规则来源

默认完整配置按“本地/局域网直连 → 广告拦截 → 预设专项分流 → 国内域名/IP 直连 → 未匹配流量代理”的顺序匹配。必须直连的本地域名、RFC1918/CGNAT、回环、链路本地和 IPv6 私网规则直接写入生成配置，不依赖远程下载。

- **Mihomo / Clash Meta / Stash**：国内域名、国内 IP、私网与广告核心规则使用 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) `meta` 分支的 MRS，由客户端每 24 小时检查更新。
- **Sing-box v1.13.21**：使用同一仓库 `sing` 分支的 SRS，确保与 Mihomo 的核心分类一致。
- **Shadowrocket**：继续使用 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) 的 Shadowrocket 专用中国域名/IP规则，避免跨客户端规则语法差异。

规则集下载发生在客户端加载或更新配置时，Worker 转换请求本身不会抓取这些仓库。`minimal` 是例外：它不声明远程规则集，因此不会使用 MetaCubeX。

---

## 📄 License

MIT License
