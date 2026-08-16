# 🛡️ SubConverter Pro (纯净安全加固版)

基于 **Cloudflare Workers** 的轻量、无状态、高安全性 Serverless 订阅转换服务。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/han-ava/cf-sub-converter)

---

## 🌟 核心改进与安全保障（对比原版）

| 安全/功能特性 | 原版 `cf-sub-converter` | 本项目 (纯净安全加固版) |
| :--- | :--- | :--- |
| **持久化 KV 隐私泄露** | 🔴 `/favs` 无鉴权公开，所有机场订阅 Token 裸奔 | 🟢 **纯无状态设计**，收藏夹仅保存在客户端本地 `localStorage`，服务端零存储 |
| **未授权 KV 写入/篡改** | 🔴 `/save` 允许任意公网 IP 写入与污染 KV | 🟢 移除无鉴权接口，支持可选的 `AUTH_TOKEN` 私有化保护 |
| **Argo 脚本动态远程注入** | 🔴 动态拉取 GitHub 未校验的 `argo.sh` 并诱导 VPS root 执行 | 🟢 **彻底移除 Argo 模块**，专注订阅转换，杜绝供应链与 RCE 风险 |
| **外部规则模板依赖** | 🟠 每次转换动态请求 GitHub 仓库规则 | 🟢 **内置固化 Clash/Sing-box 规则模板**，无外部网络依赖与分流劫持风险 |
| **SSRF 防护与资源限额** | 🟡 无内网 IP 过滤，容易被滥用为公网扫描代理 | 🟢 内置 RFC1918 私有 IP 与本地回环拦截，15秒超时与 10MB 响应体积保护 |
| **协议支持完整度** | 支持常见协议 | 完美支持 **VLESS (Reality/Vision)**, **VMess**, **Trojan**, **SS**, **SSR**, **Hysteria 2**, **TUIC**, **Clash YAML** 反向解析 |

---

## 🚀 快速部署指南

### 方法一：Cloudflare 官方一键部署（最简单）

点击下方按钮，直接将本项目一键分发部署到你的 Cloudflare 账户：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/han-ava/cf-sub-converter)

---

### 方法二：使用 Wrangler 命令行本地部署


1. **安装依赖**：
   ```bash
   npm install
   ```

2. **本地调试**：
   ```bash
   npm run dev
   ```

3. **一键部署到 Cloudflare Workers**：
   ```bash
   npm run deploy
   ```

---

### 方法二：在 Cloudflare Dashboard 网页端直接部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages** -> **Create Application** -> **Create Worker**。
2. 粘贴本项目打包后的代码或连接 GitHub 仓库即可。
### 🔒 私有密钥设置（安全推荐）

本项目将 `AUTH_TOKEN` 与代码仓库完全解耦，**绝不硬编码在配置文件中**。你可以通过以下任意一种方式设置：

* **命令行方式（推荐）**：
  ```bash
  npx wrangler secret put AUTH_TOKEN
  ```
  根据提示输入你的私有密码（例如 `mySecretKey888`）。

* **网页控制台方式**：
  进入 Cloudflare Dashboard ➔ **Workers & Pages** ➔ 点击 **`cf-sub-converter`** ➔ **Settings** ➔ **Variables and Secrets** ➔ 点击 **Add** ➔ 选择 **Secret** 类型 ➔ 变量名填 `AUTH_TOKEN`，值填你的密码 ➔ 保存并部署。

> 💡 **提示**：通过 Secret 方式配置的 Token 在以后的任何 Git 提交、重推仓库或自动构建中都会**永久保留**，绝不会被代码覆盖清空。

---

## 📡 API 使用文档

### 1. 标准订阅转换接口：`GET /sub`

**URL 示例**：
```text
https://your-worker.workers.dev/sub?url=https://airport.com/sub?token=xxx&target=clash
```

#### 请求参数：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `url` | string | **是** | - | 原始机场订阅链接，或节点链接。支持 `\|` 或换行拼接多个链接。 |
| `target` | string | 否 | `clash` / 自动识别 | 目标客户端格式：`clash` (Clash Meta/Mihomo), `shadowrocket` (小火箭标准订阅), `shadowrocket-conf` (.conf规则配置), `singbox`, `base64`, `raw`, `surge` |
| `include` | string | 否 | - | 包含节点正则表达式，例如 `香港\|日本\|US` |
| `exclude` | string | 否 | - | 排除节点正则表达式，例如 `剩余\|到期\|官网\|0.1x` |
| `rename` | string | 否 | - | 节点重命名规则，格式为 `查找=替换`，多个规则用逗号隔开 |
| `emoji` / `flag` | boolean | 否 | `1` | 是否自动为节点名称添加国旗 Emoji（`1` 开启，`0` 关闭） |
| `info` / `show_info` | boolean | 否 | `1` | 是否在节点列表最顶部生成剩余流量与到期时间展示节点（`1` 开启，`0` 关闭） |
| `udp` | boolean | 否 | `1` | 是否强制开启 UDP 转发（`1` 开启，`0` 关闭） |
| `token` | string | 否 | - | 访问鉴权 Token（若 Worker 配置了 `AUTH_TOKEN` 则必填） |
| `filename` | string | 否 | `SubConverter` | 导出的配置文件名称 |

---

### 2. 版本与健康检查接口：`GET /version`

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

- **VLESS** (支持 TLS、Reality、XTLS-rprx-vision、WebSocket、gRPC)
- **VMess** (支持 WebSocket、gRPC、TLS)
- **Trojan** (支持 TLS、WebSocket、gRPC)
- **Shadowsocks** (SIP002、SIP003 插件)
- **ShadowsocksR** (SSR)
- **Hysteria 2** (hy2)
- **TUIC** (v5)
- **Clash YAML 订阅** (支持作为输入源解析并重新分组)

---

## 📄 License
MIT License
