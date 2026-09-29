# 🛡️ SubConverter Pro

基于 **Cloudflare Workers** 的轻量、高安全性 Serverless 订阅转换服务，专为个人私有部署设计。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/han-ava/cf-sub-converter)

---

## 🌟 核心特性

- **🛡️ 纯净安全**：强制 `AUTH_TOKEN` 私有鉴权，严密防御 SSRF，零外链模板依赖，杜绝供应链风险。
- **🌏 智能区域分组**：自动聚合亚太、美洲、欧洲大区与常用核心大国，收敛消灭单节点冷门组。
- **🌲 清爽树状层级**：`🚀 节点选择` 告别百条节点杂乱平铺；自动过滤流量/公告死节点；修复国行设备台湾图标（🧋）。
- **⚡ 特色专区提炼**：自动识别并提炼 `✈️ 专线专区`（IPLC/IEPL）与 `🚀 极速加速`（Hysteria 2），开启 `lazy: true` 后台省电。
- **🧩 多选应用分流**：分流预设支持自由多选叠加（`ai`, `media`, `telegram`, `dev`, `game`, `minimal`）。
- **💎 全协议无损保全**：无损支持 VLESS (Reality/Vision/XHTTP)、VMess、SS (2022)、Hysteria 2、TUIC v5、Trojan 等。
- **📱 全客户端自适应**：智能识别 Clash/Mihomo、Sing-box、Shadowrocket、Surge、Quantumult X、Loon 等客户端。

---

## 🚀 快速部署

### 方式一：Cloudflare 官方一键部署（推荐）

点击上方 **Deploy to Cloudflare Workers** 按钮，按提示授权即可一键分发部署。

部署完成后，在 Worker 的 **Settings** ➔ **Variables and Secrets** ➔ 添加 Secret：
- 变量名：`AUTH_TOKEN`
- 值：你的私有访问密码

---

### 方式二：Wrangler 命令行部署

```bash
git clone https://github.com/han-ava/cf-sub-converter.git
cd cf-sub-converter
bun install # 或 npm install

# 1. 设置私有访问密码
npx wrangler secret put AUTH_TOKEN

# 2. 一键发布部署
bun run deploy
```

---

## 📡 API 使用文档

### 核心转换接口：`GET /sub` 或 `POST /api/convert`

**URL 示例**：
```text
https://your-worker.workers.dev/sub?url=https://airport.com/sub?token=xxx&target=auto&token=YourSecretToken
```

#### 请求参数速查：

| 参数名 | 必填 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| `url` | **是** | - | 原始机场订阅链接，支持 `\|` 或换行拼接多个订阅 |
| `token` | **是** | - | 私有访问密钥（需与 `AUTH_TOKEN` Secret 一致） |
| `target` | 否 | `auto` | 目标格式：`auto` (自动识别客户端)、`clash`、`singbox`、`shadowrocket`、`surge`、`loon`、`base64` 等 |
| `group_type` | 否 | `hybrid` | 区域分组结构：`hybrid` (智能混合大区+核心大国)、`area` (纯大区极简，仅8组)、`country` (传统国家) |
| `preset` | 否 | `standard` | 分流预设，**支持多选叠加**（如 `ai,media,telegram,dev`）：`ai` (AI工具), `media` (流媒体), `telegram` (电报), `dev` (GitHub/开发), `game` (游戏), `minimal` (极简) |
| `filter_notices` | 否 | `1` | 自动过滤机场公告与伪节点（如“剩余流量/到期时间/测试专用/镜像官网”等，`1` 开启，`0` 保留） |
| `include` | 否 | - | 节点保留正则过滤，如 `香港\|日本\|US` |
| `exclude` | 否 | - | 节点排除正则过滤，如 `0.1x\|实验` |
| `regions` | 否 | - | 按地区/大区代码过滤，如 `APAC`、`AMER`、`HK\|JP\|OTHER` |
| `rename` | 否 | - | 节点重命名规则，格式为 `查找=替换`，多个规则逗号分隔 |
| `emoji` | 否 | `1` | 是否自动为节点名称添加国旗/地区 Emoji |
| `udp` | 否 | `1` | 是否为节点强制启用 UDP 转发 |
| `test_url` | 否 | `https://cp.cloudflare.com/generate_204` | 自动测速延迟检测地址 |

---

### 短链与 Web 控制台

- **Web 交互面板**：直接在浏览器访问部署好的域名（如 `https://your-worker.workers.dev`），内置可视化节点透视、多选预设配置、实时节点测速预览与本地收藏夹。
- **安全短链**：在前端点击“生成短链”，生成形态为 `/s/{code}` 的高隐蔽性私密短链（支持携带 Query 参数实时覆盖配置）。
