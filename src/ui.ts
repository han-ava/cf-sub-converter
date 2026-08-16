// src/ui.ts

export function renderHtmlPage(version: string = '3.0.0-hardened'): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SubConverter Pro | 安全无状态订阅转换器</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root {
      --bg-app: #080c14;
      --bg-panel: #0f172a;
      --bg-card: #1e293b;
      --bg-input: #0b1120;
      --bg-hover: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --border: #334155;
      --border-focus: #3b82f6;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --accent: #38bdf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-app);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background-color: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(8px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 1.25rem;
      letter-spacing: -0.02em;
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 18px;
      box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
    }
    .badge {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      font-size: 0.75rem;
      padding: 3px 10px;
      border-radius: 9999px;
      font-weight: 600;
      border: 1px solid rgba(16, 185, 129, 0.25);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .container {
      max-width: 900px;
      width: 100%;
      margin: 2rem auto;
      padding: 0 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      flex: 1;
    }
    .panel {
      background-color: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      box-shadow: var(--shadow);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .panel-title {
      font-size: 1.1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-main);
    }
    .form-group {
      margin-bottom: 1.25rem;
    }
    .form-group:last-child {
      margin-bottom: 0;
    }
    label {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    textarea, input[type="text"], select {
      width: 100%;
      background-color: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-main);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      font-size: 0.925rem;
      transition: all 0.2s ease;
      outline: none;
    }
    textarea {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      min-height: 120px;
      resize: vertical;
      line-height: 1.6;
    }
    textarea:focus, input[type="text"]:focus, select:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--text-muted);
      user-select: none;
    }
    .checkbox-group input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--primary);
      cursor: pointer;
    }
    .btn-row {
      display: flex;
      gap: 12px;
      margin-top: 1.5rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0.75rem 1.25rem;
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 0.95rem;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      text-decoration: none;
    }
    .btn-primary {
      background-color: var(--primary);
      color: white;
      flex: 2;
      padding: 0.9rem;
      font-size: 1rem;
    }
    .btn-primary:hover {
      background-color: var(--primary-hover);
      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
    }
    .btn-secondary {
      background-color: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background-color: var(--bg-hover);
      border-color: var(--text-muted);
    }
    .btn-inspect {
      flex: 1;
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .btn-inspect:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    .btn-sm {
      padding: 0.5rem 0.85rem;
      font-size: 0.825rem;
    }
    .results-wrapper {
      display: none;
      animation: fadeIn 0.3s ease;
    }
    .results-wrapper.show {
      display: block;
    }
    .result-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .result-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .url-box {
      display: flex;
      gap: 8px;
      margin-bottom: 1rem;
    }
    .url-box input {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--accent);
      background: var(--bg-input);
    }
    .action-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    /* 流量与节点看板样式 */
    .traffic-bar-container {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .traffic-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .traffic-progress-bg {
      height: 8px;
      background: var(--bg-card);
      border-radius: 999px;
      overflow: hidden;
    }
    .traffic-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #3b82f6);
      border-radius: 999px;
      width: 0%;
      transition: width 0.5s ease;
    }
    .region-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 1rem 0;
    }
    .region-chip {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 0.8rem;
      color: var(--text-main);
      cursor: pointer;
      transition: all 0.2s;
    }
    .region-chip:hover {
      border-color: var(--accent);
      color: var(--accent);
      transform: translateY(-1px);
    }
    .node-list-box {
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-input);
    }
    .node-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      font-size: 0.825rem;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      font-family: 'JetBrains Mono', monospace;
    }
    .node-item:last-child {
      border-bottom: none;
    }
    .node-tag {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
    }
    
    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(30px);
      background: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border);
      padding: 0.75rem 1.5rem;
      border-radius: 999px;
      font-size: 0.875rem;
      font-weight: 500;
      box-shadow: var(--shadow);
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 100;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .modal-overlay.show {
      display: flex;
    }
    .modal-content {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      max-width: 380px;
      width: 90%;
      text-align: center;
    }
    #qrcode {
      background: white;
      padding: 12px;
      border-radius: var(--radius-md);
      display: inline-block;
      margin: 1rem 0;
    }
    .fav-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 1rem;
    }
    .fav-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
    }
    .fav-info {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }
    .fav-name {
      font-weight: 600;
      color: var(--text-main);
    }
    .fav-meta {
      font-size: 0.75rem;
      color: var(--text-dim);
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 640px) {
      .grid-2 { grid-template-columns: 1fr; }
      .btn-row { flex-direction: column; }
      .container { padding: 0 1rem; margin: 1rem auto; }
      .panel { padding: 1.25rem; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <span>SubConverter Pro</span>
    </div>
    <div class="badge">
      <span>🛡️ 纯净加固版 v${version}</span>
    </div>
  </header>

  <div class="container">
    <!-- 主配置面板 -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <span>📡 订阅链接与节点配置</span>
        </div>
      </div>

      <div class="form-group">
        <label for="subUrl">
          <span>订阅链接 / 节点链接 (支持多个链接换行或 | 分隔)</span>
        </label>
        <textarea id="subUrl" placeholder="https://airport.com/api/v1/client/subscribe?token=...&#10;或直接输入 vless://, vmess://, trojan://, ss://, hysteria2://, tuic:// 节点链接"></textarea>
      </div>

      <div class="grid-2 form-group">
        <div>
          <label for="targetClient">目标客户端 / 格式</label>
          <select id="targetClient" onchange="onTargetChange()">
            <option value="clash" selected>Clash Meta / Mihomo (YAML)</option>
            <option value="shadowrocket">Shadowrocket (小火箭 - 标准订阅)</option>
            <option value="singbox">Sing-Box 1.8+ (JSON)</option>
            <option value="base64">Base64 (V2RayN / 通用订阅)</option>
            <option value="shadowrocket-conf">Shadowrocket (.conf 规则配置)</option>
            <option value="raw">Raw Links (明文链接列表)</option>
            <option value="surge">Surge (Proxy 列表)</option>
          </select>
        </div>

        <div>
          <label for="rulePreset">分流规则预设方案</label>
          <select id="rulePreset">
            <option value="standard" selected>🎯 标准全能分流 (国内直连+自动测速+去广告)</option>
            <option value="ai">🤖 智算 AI 增强 (ChatGPT/Claude/Copilot 专属分组)</option>
            <option value="media">🎬 国际流媒体专线 (YouTube/Netflix/Disney+ 专属)</option>
            <option value="minimal">⚡ 极简纯节点模式 (仅节点与自动选择)</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="authToken">🔐 访问密钥 Token (AUTH_TOKEN)</label>
        <input type="text" id="authToken" placeholder="请填写您在 Cloudflare 中配置的 AUTH_TOKEN" oninput="saveAuthToken()">
      </div>

      <!-- 高级设置 -->
      <div class="form-group" style="margin-top: 1rem; border-top: 1px dashed var(--border); padding-top: 1rem;">
        <div class="grid-2">
          <div>
            <label for="includeRegex">包含节点正则 (Include)</label>
            <input type="text" id="includeRegex" placeholder="例如: 香港|日本|US|专线" oninput="debounceInspect()">
          </div>
          <div>
            <label for="excludeRegex">排除节点正则 (Exclude)</label>
            <input type="text" id="excludeRegex" placeholder="例如: 剩余|到期|官网|0.1x" oninput="debounceInspect()">
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="renameRules">节点重命名 (寻=替，多个用换行或逗号隔开)</label>
        <input type="text" id="renameRules" placeholder="例如: 香港=HK, 日本=JP, IPLC=专线">
      </div>

      <div class="form-group grid-3" style="margin-top: 1rem;">
        <label class="checkbox-group">
          <input type="checkbox" id="addEmoji" checked>
          <span>智能添加国旗 Emoji (🇭🇰 🇯🇵 🇺🇸)</span>
        </label>
        <label class="checkbox-group">
          <input type="checkbox" id="showInfo" checked>
          <span>置顶显示剩余流量与到期时间</span>
        </label>
        <label class="checkbox-group">
          <input type="checkbox" id="enableUdp" checked>
          <span>开启 UDP 转发支持</span>
        </label>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" id="btnGenerate" onclick="generateLink()">
          <span>⚡ 生成转换订阅链接</span>
        </button>
        <button class="btn btn-inspect" id="btnInspect" onclick="inspectNodes()">
          <span>🔍 即时解析看板</span>
        </button>
      </div>
    </div>

    <!-- 实时解析与流量看板 (Live Inspector) -->
    <div class="panel results-wrapper" id="inspectPanel">
      <div class="panel-header">
        <div class="panel-title">
          <span>📊 节点与流量实时看板</span>
        </div>
        <span id="inspectCount" class="badge">0 节点</span>
      </div>

      <div id="trafficCard" class="traffic-bar-container" style="display: none;">
        <div class="traffic-header">
          <span id="trafficText">流量使用情况</span>
          <span id="expireText">到期时间: 未知</span>
        </div>
        <div class="traffic-progress-bg">
          <div id="trafficFill" class="traffic-progress-fill"></div>
        </div>
      </div>

      <div id="regionChips" class="region-chips"></div>

      <div class="node-list-box" id="nodeList"></div>
    </div>

    <!-- 结果面板 -->
    <div class="panel results-wrapper" id="resultsPanel">
      <div class="panel-header">
        <div class="panel-title">
          <span>🎉 转换链接已生成</span>
        </div>
      </div>

      <div class="result-card">
        <div class="result-header">
          <span class="result-title">🔗 转换后订阅地址</span>
          <span id="targetBadge" class="badge">Clash Meta</span>
        </div>
        <div class="url-box">
          <input type="text" id="outputUrl" readonly>
          <button class="btn btn-secondary btn-sm" onclick="copyLink()">复制</button>
          <button class="btn btn-secondary btn-sm" onclick="showQrCode()">二维码</button>
        </div>

        <div class="action-buttons">
          <button class="btn btn-primary btn-sm" id="btnImportCurrent" onclick="importCurrentClient()">🚀 一键导入到 Clash</button>
          <button class="btn btn-secondary btn-sm" onclick="copyLink()">📋 复制链接</button>
          <button class="btn btn-secondary btn-sm" onclick="showQrCode()">📱 二维码</button>
          <button class="btn btn-secondary btn-sm" onclick="saveToLocalFavorites()">⭐ 收藏配置</button>
        </div>
      </div>
    </div>

    <!-- 本地收藏夹 (纯浏览器 localStorage，零泄露风险) -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <span>⭐ 本地配置收藏夹</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="saveToLocalFavorites()">+ 收藏当前配置</button>
      </div>

      <div id="favList" class="fav-list">
        <div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 1.25rem; background: var(--bg-input); border-radius: var(--radius-md); border: 1px dashed var(--border);">
          ⭐ 暂无保存的配置<br>
          <span style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; display: inline-block;">在上方配置好订阅与规则后，点击「+ 收藏当前配置」即可保存</span>
        </div>
      </div>
    </div>
  </div>

  <!-- QR Code Modal -->
  <div class="modal-overlay" id="qrModal" onclick="closeQrModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <h3>📱 扫描二维码导入订阅</h3>
      <div id="qrcode"></div>
      <button class="btn btn-secondary" onclick="closeQrModal()">关闭</button>
    </div>
  </div>

  <div class="toast" id="toast">已复制到剪贴板</div>

  <script>
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function buildConvertedUrl() {
      const rawUrl = document.getElementById('subUrl').value.trim();
      if (!rawUrl) {
        alert('请输入订阅链接或节点链接');
        return '';
      }

      const authToken = document.getElementById('authToken').value.trim();
      if (!authToken) {
        alert('⚠️ 请输入您在 Cloudflare 中配置的「访问密钥 Token」(AUTH_TOKEN)，否则服务端将拦截请求。');
        document.getElementById('authToken').focus();
        return '';
      }

      saveAuthToken();

      const target = document.getElementById('targetClient').value;
      const preset = document.getElementById('rulePreset').value;
      const includeRegex = document.getElementById('includeRegex').value.trim();
      const excludeRegex = document.getElementById('excludeRegex').value.trim();
      const renameRules = document.getElementById('renameRules').value.trim();
      const addEmoji = document.getElementById('addEmoji').checked;
      const showInfo = document.getElementById('showInfo').checked;
      const enableUdp = document.getElementById('enableUdp').checked;

      const origin = window.location.origin;
      const params = new URLSearchParams();
      params.set('url', rawUrl);
      params.set('target', target);
      params.set('token', authToken);

      if (preset && preset !== 'standard') params.set('preset', preset);
      if (includeRegex) params.set('include', includeRegex);
      if (excludeRegex) params.set('exclude', excludeRegex);
      if (renameRules) params.set('rename', renameRules);
      if (!addEmoji) params.set('emoji', '0');
      if (!showInfo) params.set('info', '0');
      if (!enableUdp) params.set('udp', '0');

      return \`\${origin}/sub?\${params.toString()}\`;
    }

    function generateLink() {
      const url = buildConvertedUrl();
      if (!url) return;

      const outputInput = document.getElementById('outputUrl');
      outputInput.value = url;

      const target = document.getElementById('targetClient').value;
      document.getElementById('targetBadge').textContent = target.toUpperCase();

      updateDynamicImportButton(target);

      const results = document.getElementById('resultsPanel');
      results.classList.add('show');
      results.scrollIntoView({ behavior: 'smooth' });
    }

    function updateDynamicImportButton(target) {
      const btnImport = document.getElementById('btnImportCurrent');
      if (!btnImport) return;
      if (target === 'clash') {
        btnImport.textContent = '🚀 一键导入到 Clash / Mihomo';
      } else if (target === 'shadowrocket' || target === 'shadowrocket-conf') {
        btnImport.textContent = '🚀 一键导入到 Shadowrocket';
      } else if (target === 'singbox') {
        btnImport.textContent = '📦 一键导入到 Sing-Box';
      } else if (target === 'surge') {
        btnImport.textContent = '🌊 一键导入到 Surge';
      } else {
        btnImport.textContent = '📋 复制订阅链接';
      }
    }

    function onTargetChange() {
      const target = document.getElementById('targetClient').value;
      const targetBadge = document.getElementById('targetBadge');
      if (targetBadge) targetBadge.textContent = target.toUpperCase();
      updateDynamicImportButton(target);

      // 若结果区域已展示，则同步自动刷新 URL
      const outputInput = document.getElementById('outputUrl');
      if (outputInput && outputInput.value) {
        const rawUrl = document.getElementById('subUrl').value.trim();
        if (rawUrl) {
          outputInput.value = buildConvertedUrl();
        }
      }
    }

    // 实时节点与流量看板预览
    async function inspectNodes() {
      const rawUrl = document.getElementById('subUrl').value.trim();
      if (!rawUrl) {
        alert('请先输入订阅链接');
        return;
      }

      const token = document.getElementById('authToken').value.trim();
      if (!token) {
        alert('⚠️ 请先填写您在 Cloudflare 中配置的「访问密钥 Token」(AUTH_TOKEN)，否则服务端将拦截请求。');
        document.getElementById('authToken').focus();
        return;
      }

      saveAuthToken();

      const inspectBtn = document.getElementById('btnInspect');
      inspectBtn.textContent = '⏳ 解析中...';
      inspectBtn.disabled = true;

      try {
        const payload = {
          url: rawUrl,
          token,
          include: document.getElementById('includeRegex').value.trim(),
          exclude: document.getElementById('excludeRegex').value.trim(),
          rename: document.getElementById('renameRules').value.trim(),
          emoji: document.getElementById('addEmoji').checked,
          udp: document.getElementById('enableUdp').checked
        };

        const resp = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          if (resp.status === 401) {
            alert('❌ 身份认证失败 (401)\n\n原因: 访问密钥 Token 不匹配。\n请核对网页填写的 Token 是否与 Cloudflare Dashboard 中设置的 AUTH_TOKEN 完全一致。');
          } else {
            alert('解析失败: ' + (data.error || '未知错误'));
          }
          return;
        }

        const inspectPanel = document.getElementById('inspectPanel');
        inspectPanel.classList.add('show');

        // 更新数量
        document.getElementById('inspectCount').textContent = \`匹配 \${data.totalMatched} / 原始 \${data.totalRaw} 节点\`;

        // 流量信息
        const trafficCard = document.getElementById('trafficCard');
        if (data.userinfo) {
          trafficCard.style.display = 'block';
          const used = data.userinfo.upload + data.userinfo.download;
          const total = data.userinfo.total;
          const pct = total > 0 ? Math.min(100, (used / total * 100)).toFixed(1) : 0;

          document.getElementById('trafficText').textContent = \`已用: \${formatBytes(used)} / 总计: \${formatBytes(total)} (\${pct}%)\`;
          document.getElementById('expireText').textContent = \`到期时间: \${formatDate(data.userinfo.expire)}\`;
          document.getElementById('trafficFill').style.width = pct + '%';
        } else {
          trafficCard.style.display = 'none';
        }

        // 地区标签
        const chips = document.getElementById('regionChips');
        chips.innerHTML = '';
        for (const [region, count] of Object.entries(data.regions || {})) {
          const chip = document.createElement('div');
          chip.className = 'region-chip';
          chip.textContent = \`\${region}: \${count}\`;
          chip.onclick = () => {
            const rawReg = region.split(' ')[1] || region;
            document.getElementById('includeRegex').value = rawReg;
            inspectNodes();
          };
          chips.appendChild(chip);
        }

        // 节点列表
        const nodeList = document.getElementById('nodeList');
        nodeList.innerHTML = (data.nodes || []).map(n => \`
          <div class="node-item">
            <span>\${n.name}</span>
            <span class="node-tag">\${n.type.toUpperCase()}</span>
          </div>
        \`).join('');

        inspectPanel.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        alert('请求失败: ' + err.message);
      } finally {
        inspectBtn.textContent = '🔍 即时解析看板';
        inspectBtn.disabled = false;
      }
    }

    let inspectTimer = null;
    function debounceInspect() {
      const inspectPanel = document.getElementById('inspectPanel');
      if (!inspectPanel.classList.contains('show')) return;
      clearTimeout(inspectTimer);
      inspectTimer = setTimeout(inspectNodes, 400);
    }

    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }

    function formatDate(timestamp) {
      if (!timestamp) return '无限期';
      const d = new Date(timestamp * 1000);
      return isNaN(d.getTime()) ? '无限期' : d.toLocaleDateString();
    }

    function copyLink() {
      const outputInput = document.getElementById('outputUrl');
      if (!outputInput.value) return;
      navigator.clipboard.writeText(outputInput.value).then(() => {
        showToast('✅ 订阅链接已复制');
      }).catch(() => {
        outputInput.select();
        document.execCommand('copy');
        showToast('✅ 订阅链接已复制');
      });
    }

    // 动态智能导入当前选中的客户端
    function importCurrentClient() {
      const target = document.getElementById('targetClient').value;
      if (target === 'clash') {
        importClash();
      } else if (target === 'shadowrocket' || target === 'shadowrocket-conf') {
        importShadowrocket();
      } else if (target === 'singbox') {
        importSingbox();
      } else if (target === 'surge') {
        importSurge();
      } else {
        copyLink();
      }
    }

    // 客户端一键唤起
    function importClash() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      window.location.href = \`clash://install-config?url=\${encodeURIComponent(url)}&name=SubConverter\`;
    }

    function importSingbox() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      window.location.href = \`sing-box://import-remote-profile?url=\${encodeURIComponent(url)}#SubConverter\`;
    }

    function importShadowrocket() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      try {
        const b64 = btoa(unescape(encodeURIComponent(url)));
        window.location.href = \`shadowrocket://add/sub://\${b64}?remarks=SubConverter\`;
      } catch (e) {
        window.location.href = \`shadowrocket://add/sub://\${btoa(url)}?remarks=SubConverter\`;
      }
    }

    function importSurge() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      window.location.href = \`surge3:///install-config?url=\${encodeURIComponent(url)}\`;
    }

    function importQuanX() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      window.location.href = \`quantumult-x:///add-resource?remote-resource=\${encodeURIComponent(url)}\`;
    }

    function importLoon() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      window.location.href = \`loon://import?profile=\${encodeURIComponent(url)}\`;
    }

    function importStash() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;
      window.location.href = \`stash://install-config?url=\${encodeURIComponent(url)}\`;
    }

    let qrcodeObj = null;
    function showQrCode() {
      const url = document.getElementById('outputUrl').value;
      if (!url) return;

      const qrContainer = document.getElementById('qrcode');
      qrContainer.innerHTML = '';
      qrcodeObj = new QRCode(qrContainer, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });

      document.getElementById('qrModal').classList.add('show');
    }

    function closeQrModal(e) {
      document.getElementById('qrModal').classList.remove('show');
    }

    // 本地收藏夹功能 (纯 localStorage)
    const STORAGE_KEY = 'subconv_local_favs';

    function getFavorites() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      } catch {
        return [];
      }
    }

    function saveToLocalFavorites() {
      const subUrl = document.getElementById('subUrl').value.trim();
      if (!subUrl) {
        alert('请先在上方输入订阅链接并配置好过滤规则');
        document.getElementById('subUrl').focus();
        return;
      }

      const defaultName = '我的订阅 ' + (new Date().toLocaleDateString());
      const name = prompt('请输入该配置名称 (例如: 主力香港专线):', defaultName);
      if (!name || !name.trim()) return;

      const item = {
        id: Date.now(),
        name: name.trim(),
        subUrl,
        target: document.getElementById('targetClient').value,
        preset: document.getElementById('rulePreset').value,
        include: document.getElementById('includeRegex').value.trim(),
        exclude: document.getElementById('excludeRegex').value.trim(),
        rename: document.getElementById('renameRules').value.trim(),
        addEmoji: document.getElementById('addEmoji').checked,
        showInfo: document.getElementById('showInfo').checked,
        enableUdp: document.getElementById('enableUdp').checked,
        date: new Date().toISOString()
      };

      const favs = getFavorites();
      favs.unshift(item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favs.slice(0, 30)));
      renderFavorites();
      showToast('⭐ 已保存配置至本地收藏夹');
    }

    function deleteFavorite(id) {
      if (!confirm('确定要删除此收藏配置吗？')) return;
      const favs = getFavorites().filter(f => f.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
      renderFavorites();
      showToast('🗑️ 已删除收藏配置');
    }

    function loadFavorite(id) {
      const item = getFavorites().find(f => f.id === id);
      if (!item) return;

      document.getElementById('subUrl').value = item.subUrl || '';
      document.getElementById('targetClient').value = item.target || 'clash';
      document.getElementById('rulePreset').value = item.preset || 'standard';
      document.getElementById('includeRegex').value = item.include || '';
      document.getElementById('excludeRegex').value = item.exclude || '';
      document.getElementById('renameRules').value = item.rename || '';
      document.getElementById('addEmoji').checked = item.addEmoji !== false;
      document.getElementById('showInfo').checked = item.showInfo !== false;
      document.getElementById('enableUdp').checked = item.enableUdp !== false;

      generateLink();
      showToast('⚡ 已成功加载配置: ' + item.name);
    }

    function renderFavorites() {
      const list = document.getElementById('favList');
      const favs = getFavorites();

      if (favs.length === 0) {
        list.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 1.25rem; background: var(--bg-input); border-radius: var(--radius-md); border: 1px dashed var(--border);">⭐ 暂无保存的配置<br><span style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; display: inline-block;">在上方配置好订阅与规则后，点击「+ 收藏当前配置」即可保存</span></div>';
        return;
      }

      list.innerHTML = favs.map(f => \`
        <div class="fav-item">
          <div class="fav-info" onclick="loadFavorite(\${f.id})" style="cursor: pointer; flex: 1;">
            <div class="fav-name">⭐ \${f.name}</div>
            <div class="fav-meta" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span class="badge" style="font-size: 0.65rem; padding: 1px 6px;">\${f.target.toUpperCase()}</span>
              \${f.preset && f.preset !== 'standard' ? \`<span class="badge" style="font-size: 0.65rem; padding: 1px 6px; background: rgba(16,185,129,0.15); color: #10b981;">\${f.preset.toUpperCase()}</span>\` : ''}
              \${f.include ? \`<span style="font-family: monospace; font-size: 0.75rem; color: var(--accent);">[\${f.include}]</span>\` : ''}
              <span style="font-size: 0.75rem; color: var(--text-dim);">· \${new Date(f.date).toLocaleDateString()}</span>
            </div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-primary btn-sm" onclick="loadFavorite(\${f.id})" title="载入并立即转换">⚡ 载入</button>
            <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="deleteFavorite(\${f.id})" title="删除此收藏">🗑️</button>
          </div>
        </div>
      \`).join('');
    }

    // Token 本地持久化 (localStorage)
    const TOKEN_STORAGE_KEY = 'subconv_saved_token';

    function saveAuthToken() {
      const token = document.getElementById('authToken').value.trim();
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      }
    }

    function restoreAuthToken() {
      try {
        const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (saved) {
          document.getElementById('authToken').value = saved;
        }
      } catch {}
    }

    // 初始化
    restoreAuthToken();
    renderFavorites();
  </script>
</body>
</html>`;
}
