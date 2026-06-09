export const REMOTE_CONFIG = {
  singbox: 'https://raw.githubusercontent.com/sammy0101/cf-sub-converter/refs/heads/main/Sing-Box_Rules.JSON',
  clash: 'https://raw.githubusercontent.com/sammy0101/cf-sub-converter/refs/heads/main/Clash_Rules.YAML'
};

export const HTML_PAGE = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SubConverter Pro | 專業訂閱轉換器</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  
  <style>
    :root {
      --bg-app: #0f172a;
      --bg-panel: #1e293b;
      --bg-input: #0f172a;
      --bg-hover: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --border-focus: #3b82f6;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #10b981;
      --danger: #ef4444;
      --orange: #ea580c;
      --orange-hover: #c2410c;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-app); color: var(--text-main); line-height: 1.5; min-height: 100vh; -webkit-font-smoothing: antialiased;
    }
    svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .header {
      background-color: var(--bg-panel); border-bottom: 1px solid var(--border); padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.25rem; letter-spacing: -0.025em; }
    .brand svg { color: var(--primary); width: 1.75rem; height: 1.75rem; }
    .badge { background: rgba(59, 130, 246, 0.1); color: var(--primary); font-size: 0.75rem; padding: 4px 8px; border-radius: 9999px; font-weight: 600; border: 1px solid rgba(59, 130, 246, 0.2); }
    .container { max-width: 860px; margin: 2.5rem auto; padding: 0 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
    .panel { background-color: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.75rem; box-shadow: var(--shadow); }
    .panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
    .panel-title { font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .panel-title svg { color: var(--text-muted); }
    .form-group { margin-bottom: 1.25rem; }
    .form-group:last-child { margin-bottom: 0; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: var(--text-muted); margin-bottom: 0.5rem; }
    textarea, input[type="text"] {
      width: 100%; background-color: var(--bg-input); border: 1px solid var(--border); color: var(--text-main); border-radius: var(--radius-md); padding: 0.875rem 1rem; font-size: 0.95rem; transition: all 0.2s ease; outline: none;
    }
    textarea { font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; min-height: 140px; resize: vertical; line-height: 1.6; }
    textarea::placeholder, input::placeholder { color: #475569; }
    textarea:focus, input[type="text"]:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
    .hint { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.4rem; display: flex; align-items: center; gap: 4px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0.75rem 1.25rem; border-radius: var(--radius-md); font-weight: 600; font-size: 0.95rem; border: none; cursor: pointer; transition: all 0.2s ease; user-select: none;
    }
    .btn-primary { background-color: var(--primary); color: white; width: 100%; padding: 1rem; font-size: 1.05rem; }
    .btn-primary:hover:not(:disabled) { background-color: var(--primary-hover); transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
    .btn-icon { background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border); padding: 0.6rem; border-radius: var(--radius-sm); }
    .btn-icon:hover { background: var(--bg-hover); color: var(--primary); border-color: var(--text-muted); }
    .btn-ghost { background: transparent; color: var(--text-muted); padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem;}
    .btn-ghost:hover { background: var(--bg-hover); color: var(--text-main); }
    .btn-danger:hover { color: var(--danger); border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); }
    .results-wrapper { display: none; animation: slideUp 0.4s ease forwards; }
    .results-wrapper.show { display: block; }
    .result-item {
      display: flex; align-items: center; gap: 1rem; background-color: var(--bg-input); border: 1px solid var(--border); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; transition: border-color 0.2s;
    }
    .result-item:hover { border-color: var(--text-muted); }
    .result-icon-box {
      width: 44px; height: 44px; border-radius: var(--radius-sm); background-color: var(--bg-panel); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--primary);
    }
    .result-info { flex: 1; min-width: 0; }
    .result-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 2px; color: var(--text-main); }
    .result-desc { font-size: 0.8rem; color: var(--text-muted); }
    .result-input-wrapper { flex: 2; position: relative; }
    .result-input-wrapper input { width: 100%; padding: 0.6rem 0.8rem; background: var(--bg-panel); font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); }
    .result-actions { display: flex; gap: 6px; }
    .fav-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem; }
    .fav-card {
      background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; cursor: pointer; transition: all 0.2s ease; position: relative;
    }
    .fav-card:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .fav-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .fav-url { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fav-actions { display: flex; gap: 8px; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); justify-content: flex-end; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem; border: 1px dashed var(--border); border-radius: var(--radius-md); }
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(4px); z-index: 100; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;
    }
    .modal-overlay.show { display: flex; opacity: 1; }
    .modal-content {
      background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); width: 90%; max-width: 480px; padding: 2rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); transform: scale(0.95); transition: transform 0.2s ease;
    }
    .modal-overlay.show .modal-content { transform: scale(1); }
    .modal-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; }
    .modal-footer { display: flex; gap: 12px; margin-top: 2rem; justify-content: flex-end; }
    .modal-btn { padding: 0.6rem 1.25rem; border-radius: var(--radius-md); font-weight: 500; font-size: 0.9rem; cursor: pointer; border: none; }
    .modal-btn-cancel { background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border); }
    .modal-btn-cancel:hover { background: var(--bg-hover); }
    .modal-btn-save { background: var(--primary); color: white; }
    .modal-btn-save:hover { background: var(--primary-hover); }
    .toast {
      position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(20px); background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border); padding: 0.8rem 1.5rem; border-radius: 999px; font-weight: 500; font-size: 0.9rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); opacity: 0; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 200; display: flex; align-items: center; gap: 8px;
    }
    .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    .toast.success svg { color: var(--success); }
    @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; }
    @media (max-width: 640px) { .result-item { flex-direction: column; align-items: stretch; } .result-icon-box { display: none; } .result-info { margin-bottom: 0.5rem; } }
  </style>
</head>
<body>

  <header class="header">
    <div class="brand">
      <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
      SubConverter Pro
    </div>
    <span class="badge">v2.5.0</span>
  </header>

  <div class="container">
    <main class="panel">
      <div class="panel-header">
        <h2 class="panel-title">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          資料來源設定
        </h2>
      </div>
      
      <div class="form-group">
        <label for="urlInput">節點連結或訂閱地址 (支援多筆換行)</label>
        <textarea id="urlInput" placeholder="vmess://...\nvless://...\ntuic://...\nanytls://...\nhttps://example.com/sub"></textarea>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="includeKeywords">僅保留關鍵字節點 (選填，多個用 | 分隔)</label>
        <input type="text" id="includeKeywords" placeholder="例如: 🇭🇰|台灣|TW">
        <div class="hint">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          只保留名稱符合關鍵字的節點。例如輸入 <code>HK|TW</code>。
        </div>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="excludeKeywords">排除關鍵字節點 (選填，多個用 | 分隔)</label>
        <input type="text" id="excludeKeywords" placeholder="例如: 流量|官網|重置|5x">
        <div class="hint">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          排除名稱符合關鍵字的節點（過濾垃圾廣告）。例如輸入 <code>5x</code>。
        </div>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="renameKeywords">節點名稱替換 (選填，多個用 | 分隔)</label>
        <input type="text" id="renameKeywords" placeholder="例如: DEL-[69云]|移动优化-專線">
        <div class="hint">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          刪除請用 <code>DEL-關鍵字</code>，替換請用 <code>尋找-替換</code>。多組規則請用 <code>|</code> 隔開。
        </div>
      </div>
      
      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="shortCode">自訂路徑短連結 (選填)</label>
        <input type="text" id="shortCode" placeholder="例如: my-sub-2026">
        <div class="hint">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          設定後將儲存於雲端，生成固定不變的短連結
        </div>
      </div>
      
      <button class="btn btn-primary" id="generateBtn" onclick="generate()" style="margin-top: 2rem;">
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>執行轉換</span>
      </button>
    </main>

    <!-- Cloudflare Argo 隧道節點生成器 -->
    <main class="panel" style="margin-top: 1.5rem;">
      <div class="panel-header">
        <h2 class="panel-title" style="color: var(--orange);">
          <svg viewBox="0 0 24 24" style="color: var(--orange);"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
          Cloudflare Argo 隧道節點生成器
        </h2>
      </div>
      
      <div class="form-group">
        <label for="argoBaseVless">基底 VLESS 連結 (支援多個，每行一個)</label>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <textarea id="argoBaseVless" placeholder="vless://xxxxxx@localhost:port?path=/abc...&#10;可手動貼上多行，或由下方配置一鍵智慧載入" style="min-height: 80px;"></textarea>
          <button class="btn btn-ghost" id="loadVlessBtn" onclick="loadVlessFromSource()" style="width: 100%; border-color: var(--border);">
            從上方資料來源載入
          </button>
        </div>
      </div>

      <div class="form-group" style="margin-top: 1.25rem;">
        <label for="argoTempDomain">臨時隧道網域 (選填，trycloudflare.com)</label>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="argoTempDomain" placeholder="例如: xxxx-xxxx-xxxx.trycloudflare.com" style="flex: 1;">
          <button class="btn btn-ghost" onclick="generateRandomTempDomain()" style="white-space: nowrap; font-size: 0.85rem; padding: 0 12px; border-color: var(--border);">
            隨機生成
          </button>
        </div>
      </div>

      <div class="form-group" style="margin-top: 1.25rem;">
        <label for="argoFixedDomain">固定隧道網域 (選填，自訂網域)</label>
        <input type="text" id="argoFixedDomain" placeholder="例如: argo.example.com">
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 1.25rem; margin-bottom: 1.5rem;">
        <div class="form-group">
          <label for="argoCleanIp">Cloudflare 優選網域/IP</label>
          <input type="text" id="argoCleanIp" value="cf.090227.xyz" placeholder="例如: cf.090227.xyz">
        </div>
        <div class="form-group">
          <label for="argoCleanPort">優選連接埠</label>
          <input type="text" id="argoCleanPort" value="8443" placeholder="例如: 8443">
        </div>
      </div>

      <button class="btn" onclick="generateArgo()" style="width: 100%; border: 1px solid var(--orange); color: var(--orange); background: rgba(234, 88, 12, 0.05); font-weight: 600;">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"></path></svg>
        <span>產生 Argo 節點並加入資料來源</span>
      </button>

      <!-- 💥 升級：非破壞性 Argo 隧道安裝腳本 (相容現有 mack-a/x-ui) -->
      <div id="vpsScriptBlock" class="form-group" style="margin-top: 1.5rem; display: none;">
        <label style="color: var(--orange); font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          專屬 Cloudflare Argo 部署腳本 (不破壞原有節點，直接貼入 VPS 執行)
        </label>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 0.5rem;">
          <textarea id="argoVpsScript" readonly style="min-height: 180px; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--orange); border-color: rgba(234, 88, 12, 0.2); background: rgba(234, 88, 12, 0.02);"></textarea>
          <button class="btn btn-ghost" onclick="copyVpsScript()" style="border-color: var(--orange); color: var(--orange); background: rgba(234, 88, 12, 0.05);">
            一鍵複製腳本
          </button>
        </div>
      </div>
    </main>

    <section class="results-wrapper" id="results">
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">
            <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            轉換結果
          </h2>
        </div>
        
        <div class="result-item">
          <div class="result-icon-box"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg></div>
          <div class="result-info">
            <div class="result-name">Sing-Box</div>
            <div class="result-desc">JSON 格式 · 適用 Surge, v2rayN 等</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="singboxUrl" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('singboxUrl')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('singboxUrl')" title="顯示 QR Code"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
          </div>
        </div>

        <div class="result-item">
          <div class="result-icon-box"><svg viewBox="0 0 24 24"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="6.5"></line></svg></div>
          <div class="result-info">
            <div class="result-name">Clash Meta</div>
            <div class="result-desc">YAML 格式 · 適用 Clash Verge, ClashX</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="clashUrl" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('clashUrl')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('clashUrl')" title="顯示 QR Code"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
          </div>
        </div>

        <div class="result-item">
          <div class="result-icon-box"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>
          <div class="result-info">
            <div class="result-name">Base64 (原始節點)</div>
            <div class="result-desc">Base64 格式 · 適用 V2RayNG, PassWall</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="base64Url" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('base64Url')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('base64Url')" title="顯示 QR Code"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
          </div>
        </div>

      </div>
    </section>

    <section class="panel">
      <div class="panel-header" style="margin-bottom: 0;">
        <h2 class="panel-title">
          <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          已儲存的配置
        </h2>
        <button class="btn btn-ghost" onclick="openModal()">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          新增配置
        </button>
      </div>
      
      <div id="favGrid" class="fav-grid">
        <div class="empty-state">目前尚未儲存任何配置</div>
      </div>
    </section>
  </div>

  <div class="modal-overlay" id="modal">
    <div class="modal-content">
      <h3 class="modal-title" id="modalTitle">新增配置</h3>
      <div class="form-group">
        <label>配置名稱</label>
        <input type="text" id="favName" placeholder="例如: 公司專線">
      </div>
      <div class="form-group">
        <label>節點內容 / 訂閱連結</label>
        <textarea id="favUrl" placeholder="貼上節點內容..."></textarea>
      </div>
      <div class="form-group">
        <label>保留關鍵字 (選填)</label>
        <input type="text" id="favInclude" placeholder="例如: HK|TW">
      </div>
      <div class="form-group">
        <label>排除關鍵字 (選填)</label>
        <input type="text" id="favExclude" placeholder="例如: 流量|重置|官網">
      </div>
      <div class="form-group">
        <label>節點名稱替換 (選填，多個用 | 分隔)</label>
        <input type="text" id="favRename" placeholder="例如: DEL-[69云]|移动优化-專線">
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-cancel" onclick="closeModal()">取消</button>
        <button class="modal-btn modal-btn-save" onclick="saveFav()">儲存配置</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="nodeSelectModal" style="z-index: 110;">
    <div class="modal-content" style="max-width: 500px;">
      <h3 class="modal-title">選擇基底 VLESS 節點</h3>
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: var(--text-muted);" id="nodeSelectCount">已找到 0 個節點</span>
        <button class="btn btn-ghost" style="padding: 4px 8px; font-size: 0.75rem;" onclick="toggleSelectAllNodes()">全選 / 反選</button>
      </div>
      <div id="nodeSelectContainer" style="max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px; display: flex; flex-direction: column; gap: 10px; background: var(--bg-input);">
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-cancel" onclick="closeNodeSelectModal()">取消</button>
        <button class="modal-btn modal-btn-save" onclick="confirmNodeSelection()">確認載入</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="qrModal" style="z-index: 120;">
    <div class="modal-content" style="max-width: 360px; text-align: center;">
      <h3 class="modal-title" style="margin-bottom: 1.5rem;">行動條碼訂閱</h3>
      <div style="display: flex; justify-content: center; margin-bottom: 1.5rem;">
        <div id="qrcodeCanvas" style="padding: 16px; background: white; border-radius: var(--radius-md); box-shadow: var(--shadow);"></div>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted); word-break: break-all; margin-bottom: 1.5rem;" id="qrModalUrl"></div>
      <button class="modal-btn modal-btn-cancel" onclick="closeQrModal()" style="width: 100%;">關閉</button>
    </div>
  </div>

  <div class="toast" id="toast">
    <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
    <span id="toastMsg">提示訊息</span>
  </div>

  <script>
    let favs = [];
    let extractedNodes = [];
    
    function safeBase64Decode(str) {
      try {
        let b64 = str.replace(/\\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
        while (b64.length % 4) b64 += '=';
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      } catch (e) {
        return "";
      }
    }

    async function loadFavs() {
      try {
        const resp = await fetch('/favs');
        if (resp.ok) favs = await resp.json();
        renderFavs();
      } catch(e) {}
    }
    
    function renderFavs() {
      const grid = document.getElementById('favGrid');
      if (favs.length === 0) {
        grid.style.display = 'block';
        grid.innerHTML = '<div class="empty-state">目前尚未儲存任何配置</div>';
        return;
      }
      grid.style.display = 'grid';
      
      let html = '';
      for (let i = 0; i < favs.length; i++) {
        const f = favs[i];
        const includeBadge = f.include ? '<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); border-color: rgba(16, 185, 129, 0.2); margin-right: 4px;">保: ' + f.include + '</span>' : '';
        const excludeBadge = f.exclude ? '<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border-color: rgba(239, 68, 68, 0.2); margin-right: 4px;">排: ' + f.exclude + '</span>' : '';
        const renameBadge = f.rename ? '<span class="badge" style="background: rgba(59, 130, 246, 0.1); color: var(--primary); border-color: rgba(59, 130, 246, 0.2)">替: ' + f.rename + '</span>' : '';
        
        const hasVless = f.url.includes('vless://') || f.url.includes('anytls://') || f.url.includes('http');
        const argoBtn = hasVless ? '<button class="btn btn-ghost" style="color: var(--orange); border-color: rgba(234, 88, 12, 0.2); padding: 0.3rem 0.6rem; font-size: 0.8rem; margin-right: 4px;" onclick="event.stopPropagation(); useAsArgoBase(' + i + ')">Argo</button>' : '';

        html += '<div class="fav-card" onclick="useFav(' + i + ')">' +
            '<div class="fav-title">' +
              '<svg viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--primary)"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>' +
              f.name +
            '</div>' +
            '<div class="fav-url" style="margin-bottom: 8px;">' + f.url + '</div>' +
            '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">' +
              includeBadge +
              excludeBadge +
              renameBadge +
            '</div>' +
            '<div class="fav-actions" style="gap: 4px;">' +
              argoBtn +
              '<button class="btn btn-ghost" onclick="event.stopPropagation(); editFav(' + i + ')">編輯</button>' +
              '<button class="btn btn-ghost btn-danger" onclick="event.stopPropagation(); deleteFav(' + i + ')">刪除</button>' +
            '</div>' +
          '</div>';
      }
      grid.innerHTML = html;
    }
    
    async function saveFav() {
      const name = document.getElementById('favName').value.trim();
      const url = document.getElementById('favUrl').value.trim();
      const include = document.getElementById('favInclude').value.trim();
      const exclude = document.getElementById('favExclude').value.trim();
      const rename = document.getElementById('favRename').value.trim();
      if (!name || !url) return showToast('請完整填寫名稱與內容', false);
      
      const editIndex = document.getElementById('modal').dataset.edit;
      const originalBtnText = document.querySelector('.modal-btn-save').textContent;
      document.querySelector('.modal-btn-save').textContent = '儲存中...';
      
      try {
        if (editIndex !== '') {
          await fetch('/favs', { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ index: parseInt(editIndex), name, url, include, exclude, rename }) 
          });
        } else {
          await fetch('/favs', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, url, include, exclude, rename }) 
          });
        }
        closeModal();
        loadFavs();
        showToast('配置儲存成功');
      } catch(e) { 
        showToast('儲存失敗，請重試', false); 
      } finally {
        document.querySelector('.modal-btn-save').textContent = originalBtnText;
      }
    }
    
    async function deleteFav(index) {
      if (!confirm('確定要刪除這筆配置嗎？')) return;
      try {
        await fetch('/favs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index }) });
        loadFavs();
        showToast('已刪除配置');
      } catch(e) { showToast('刪除失敗', false); }
    }
    
    function useFav(index) {
      document.getElementById('urlInput').value = favs[index].url;
      document.getElementById('shortCode').value = favs[index].name.replace(/\\s+/g, '-').toLowerCase();
      document.getElementById('includeKeywords').value = favs[index].include || '';
      document.getElementById('excludeKeywords').value = favs[index].exclude || '';
      document.getElementById('renameKeywords').value = favs[index].rename || '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('已載入配置：' + favs[index].name);
    }
    
    function editFav(index) {
      document.getElementById('modalTitle').textContent = '編輯配置';
      document.getElementById('favName').value = favs[index].name;
      document.getElementById('favUrl').value = favs[index].url;
      document.getElementById('favInclude').value = favs[index].include || '';
      document.getElementById('favExclude').value = favs[index].exclude || '';
      document.getElementById('favRename').value = favs[index].rename || '';
      document.getElementById('modal').dataset.edit = index;
      document.getElementById('modal').classList.add('show');
    }
    
    function openModal() {
      document.getElementById('modalTitle').textContent = '新增配置';
      document.getElementById('favName').value = '';
      document.getElementById('favUrl').value = '';
      document.getElementById('favInclude').value = '';
      document.getElementById('favExclude').value = '';
      document.getElementById('favRename').value = '';
      document.getElementById('modal').dataset.edit = '';
      document.getElementById('modal').classList.add('show');
    }
    
    function closeModal() {
      document.getElementById('modal').classList.remove('show');
    }
    
    async function generate() {
      const raw = document.getElementById('urlInput').value.trim();
      if (!raw) return showToast('請先輸入節點連結或訂閱地址', false);
      
      const btn = document.getElementById('generateBtn');
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg class="spinner" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg><span>處理中...</span>';
      
      const host = window.location.origin;
      const shortCode = document.getElementById('shortCode').value.trim();
      const include = document.getElementById('includeKeywords').value.trim();
      const exclude = document.getElementById('excludeKeywords').value.trim();
      const rename = document.getElementById('renameKeywords').value.trim();
      
      try {
        let baseUrl = '';
        if (shortCode) {
          await fetch('/save', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ path: shortCode, content: raw, include, exclude, rename }) 
          });
          baseUrl = host + '/' + shortCode;
        } else {
          baseUrl = host + '/?url=' + encodeURIComponent(raw);
        }
        
        const sep = baseUrl.includes('?') ? '&' : '?';
        document.getElementById('singboxUrl').value = baseUrl + sep + 'target=singbox';
        document.getElementById('clashUrl').value = baseUrl + sep + 'target=clash';
        document.getElementById('base64Url').value = baseUrl + sep + 'target=base64';
        
        document.getElementById('results').classList.add('show');
        showToast('轉換成功！請複製對應的訂閱連結');
        
      } catch(e) {
        showToast('生成失敗：' + e.message, false);
      }
      
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }

    // 💥 升級：產生非破壞性 Cloudflare Argo 安裝腳本
    async function generateArgo() {
      const baseVlessText = document.getElementById('argoBaseVless').value.trim();
      const tempDomain = document.getElementById('argoTempDomain').value.trim();
      const fixedDomain = document.getElementById('argoFixedDomain').value.trim();
      const cleanIp = document.getElementById('argoCleanIp').value.trim() || 'cf.090227.xyz';
      const cleanPort = document.getElementById('argoCleanPort').value.trim() || '8443';
      
      if (!baseVlessText) return showToast('請先輸入或載入基底 VLESS 連結', false);
      if (!tempDomain && !fixedDomain) return showToast('請至少輸入一種隧道網域（臨時或固定）', false);
      
      const baseVlessList = baseVlessText.split(/[\\n\\r]+/);
      const generatedNodes = [];
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < baseVlessList.length; i++) {
        const trimmed = baseVlessList[i].trim();
        if (!trimmed) continue;
        
        try {
          const urlStr = trimmed.replace('vless://', 'http://');
          const url = new URL(urlStr);
          const uuid = url.username;
          const params = url.searchParams;
          const originalName = decodeURIComponent(url.hash.slice(1)) || 'Argo';
          
          let path = params.get('path') || '/';
          if (!path.startsWith('/')) path = '/' + path;
          
          if (tempDomain) {
            const tempParams = new URLSearchParams();
            tempParams.set('encryption', 'none');
            tempParams.set('security', 'tls');
            tempParams.set('type', 'ws');
            tempParams.set('host', tempDomain);
            tempParams.set('sni', tempDomain);
            tempParams.set('path', path);
            if (params.get('fp')) tempParams.set('fp', params.get('fp'));
            
            const tempVless = 'vless://' + uuid + '@' + cleanIp + ':' + cleanPort + '?' + tempParams.toString() + '#' + encodeURIComponent(originalName + '-臨時隧道');
            generatedNodes.push(tempVless);
          }
          
          if (fixedDomain) {
            const fixedParams = new URLSearchParams();
            fixedParams.set('encryption', 'none');
            fixedParams.set('security', 'tls');
            fixedParams.set('type', 'ws');
            fixedParams.set('host', fixedDomain);
            fixedParams.set('sni', fixedDomain);
            fixedParams.set('path', path);
            if (params.get('fp')) fixedParams.set('fp', params.get('fp'));
            
            const fixedVless = 'vless://' + uuid + '@' + cleanIp + ':' + cleanPort + '?' + fixedParams.toString() + '#' + encodeURIComponent(originalName + '-固定隧道');
            generatedNodes.push(fixedVless);
          }
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
      
      if (generatedNodes.length > 0) {
        const urlInput = document.getElementById('urlInput');
        if (urlInput.value.trim()) {
          urlInput.value = urlInput.value.trim() + '\\n' + generatedNodes.join('\\n');
        } else {
          urlInput.value = generatedNodes.join('\\n');
        }
        
        let toastMsg = '✅ 成功轉換 ' + successCount + ' 個節點，已產生 ' + generatedNodes.length + ' 個 Argo 節點並追加！';
        if (failCount > 0) toastMsg += ' (有 ' + failCount + ' 個節點解析失敗)';
        showToast(toastMsg);

        // 💥 動態產生「非破壞性」的 Cloudflared 隧道安裝腳本
        const targetDomain = fixedDomain ? fixedDomain : tempDomain;
        let scriptStr = '#!/bin/bash\\n' +
          '# 專屬 Cloudflare Argo 隧道部署腳本 (不破壞原有 mack-a/x-ui 設定)\\n' +
          '# 網域: ' + targetDomain + '\\n\\n' +
          'echo -e "\\\\033[0;36m==================================================\\\\033[0m"\\n' +
          'echo -e "\\\\033[0;36m  Cloudflare Argo 隧道 安全部署腳本\\\\033[0m"\\n' +
          'echo -e "\\\\033[0;36m==================================================\\\\033[0m"\\n\\n' +
          'if ! command -v cloudflared &> /dev/null; then\\n' +
          '  echo -e "\\\\033[0;33m正在下載並安裝 Cloudflare Tunnel 官方主程式...\\\\033[0m"\\n' +
          '  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared\\n' +
          '  chmod +x /usr/local/bin/cloudflared\\n' +
          'else\\n' +
          '  echo -e "\\\\033[0;32mcloudflared 已安裝，跳過下載。\\\\033[0m"\\n' +
          'fi\\n\\n';
          
        if (fixedDomain) {
          scriptStr += 'echo -e "\\\\n\\\\033[0;33m[固定隧道模式]\\\\033[0m"\\n' +
            'echo "請到 Cloudflare Zero Trust 後台獲取你的 Token"\\n' +
            'echo "然後在 VPS 終端機執行以下指令綁定網域："\\n' +
            'echo -e "\\\\033[0;32mcloudflared service install <你的Token>\\\\033[0m"\\n' +
            'echo "=================================================="\\n';
        } else {
          scriptStr += 'read -p "請輸入你要穿透的 Xray 本機連接埠 (如 mack-a 預設通常為 443 或 80): " LOCAL_PORT\\n' +
            'if [ -z "$LOCAL_PORT" ]; then LOCAL_PORT=443; fi\\n\\n' +
            'PROTOCOL="https"\\n' +
            'if [ "$LOCAL_PORT" = "80" ]; then PROTOCOL="http"; fi\\n\\n' +
            'echo -e "\\\\033[0;33m正在設定臨時隧道背景守護服務...\\\\033[0m"\\n' +
            'systemctl stop cloudflared-temp >/dev/null 2>&1\\n' +
            'cat <<EOF > /etc/systemd/system/cloudflared-temp.service\\n' +
            '[Unit]\\n' +
            'Description=Cloudflare Argo Temporary Tunnel Service\\n' +
            'After=network.target\\n\\n' +
            '[Service]\\n' +
            'ExecStart=/usr/local/bin/cloudflared tunnel --no-tls-verify --url ${PROTOCOL}://127.0.0.1:${LOCAL_PORT}\\n' +
            'Restart=always\\n' +
            'User=root\\n\\n' +
            '[Install]\\n' +
            'WantedBy=multi-user.target\\n' +
            'EOF\\n\\n' +
            'systemctl daemon-reload\\n' +
            'systemctl restart cloudflared-temp\\n' +
            'systemctl enable cloudflared-temp >/dev/null 2>&1\\n\\n' +
            'echo -e "\\\\n\\\\033[0;32m==================================================\\\\033[0m"\\n' +
            'echo -e "🎉 部署完成！你的臨時隧道已在背景啟動。"\\n' +
            'echo -e "請等待 5 秒後，執行以下指令查看官方分配給你的臨時網域："\\n' +
            'echo -e "\\\\033[0;36mjournalctl -u cloudflared-temp -n 50 | grep trycloudflare\\\\033[0m"\\n' +
            'echo -e "\\\\033[0;32m==================================================\\\\033[0m"\\n';
        }
          
        document.getElementById('argoVpsScript').value = scriptStr;
        document.getElementById('vpsScriptBlock').style.display = 'block';
        
      } else {
        showToast('解析失敗，請確認基底 VLESS 格式是否正確', false);
      }
    }

    function copyVpsScript() {
      const input = document.getElementById('argoVpsScript');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => showToast('已成功複製一鍵安裝腳本！'));
    }

    async function loadVlessFromSource() {
      const sourceVal = document.getElementById('urlInput').value.trim();
      if (!sourceVal) return showToast('請先輸入資料來源', false);
      
      const btn = document.getElementById('loadVlessBtn');
      const originalText = btn.textContent;
      
      const lines = sourceVal.split(/[\\n\\r]+/);
      const vlessNodes = extractVlessNodes(sourceVal);
      
      if (vlessNodes.length > 0) {
        handleVlessSelection(vlessNodes);
        return;
      }
      
      const urls = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('http')) {
          urls.push(lines[i].trim());
        }
      }

      if (urls.length > 0) {
        btn.textContent = '遠端下載中...';
        btn.disabled = true;
        try {
          const combinedRemoteVless = [];
          
          await Promise.all(urls.map(async (trimmedUrl) => {
            try {
              const apiTarget = window.location.origin + '/sub?url=' + encodeURIComponent(trimmedUrl) + '&target=base64';
              const resp = await fetch(apiTarget);
              if (resp.ok) {
                const b64Text = await resp.text();
                const decoded = safeBase64Decode(b64Text);
                const remoteVlessNodes = extractVlessNodes(decoded);
                combinedRemoteVless.push(...remoteVlessNodes);
              }
            } catch (e) {
              console.error('Failed to fetch from url:', trimmedUrl, e);
            }
          }));

          if (combinedRemoteVless.length > 0) {
            const uniqueRemoteVless = Array.from(new Set(combinedRemoteVless));
            handleVlessSelection(uniqueRemoteVless);
          } else {
            showToast('所有遠端訂閱中皆未找到任何 VLESS 節點', false);
          }
        } catch (e) {
          showToast('連線失敗，請檢查網路或伺服器憑證', false);
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      } else {
        showToast('資料來源中未找到 VLESS 節點或訂閱網址', false);
      }
    }

    async function useAsArgoBase(index) {
      const urlVal = favs[index].url;
      const vlessNodes = extractVlessNodes(urlVal);
      
      if (vlessNodes.length > 0) {
        handleVlessSelection(vlessNodes);
        return;
      }
      
      const lines = urlVal.split(/[\\n\\r]+/);
      const urls = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('http')) {
          urls.push(lines[i].trim());
        }
      }
      
      if (urls.length > 0) {
        showToast('正在向多個遠端訂閱下載並提取 VLESS 節點...');
        try {
          const combinedRemoteVless = [];
          
          await Promise.all(urls.map(async (trimmedUrl) => {
            try {
              const apiTarget = window.location.origin + '/sub?url=' + encodeURIComponent(trimmedUrl) + '&target=base64';
              const resp = await fetch(apiTarget);
              if (resp.ok) {
                const b64Text = await resp.text();
                const decoded = safeBase64Decode(b64Text);
                const remoteVlessNodes = extractVlessNodes(decoded);
                combinedRemoteVless.push(...remoteVlessNodes);
              }
            } catch (e) {
              console.error('Failed to fetch from url:', trimmedUrl, e);
            }
          }));

          if (combinedRemoteVless.length > 0) {
            const uniqueRemoteVless = Array.from(new Set(combinedRemoteVless));
            handleVlessSelection(uniqueRemoteVless);
          } else {
            showToast('所有遠端訂閱中皆未找到任何 VLESS 節點', false);
          }
        } catch (e) {
          showToast('連線失敗，請檢查網路或伺服器憑證', false);
        }
      } else {
        showToast('該配置內未包含任何 VLESS 節點或訂閱網址', false);
      }
    }

    function extractVlessNodes(text) {
      const lines = text.split(/[\\n\\r]+/);
      const results = [];
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('vless://') || trimmed.startsWith('anytls://')) {
          results.push(trimmed);
        }
      }
      return results;
    }

    function handleVlessSelection(nodes) {
      if (nodes.length === 1) {
        document.getElementById('argoBaseVless').value = nodes[0];
        focusAndScrollToArgo();
        showToast('已成功載入 VLESS 節點為 Argo 基底！');
      } else {
        extractedNodes = nodes;
        openNodeSelectModal();
      }
    }

    function openNodeSelectModal() {
      const container = document.getElementById('nodeSelectContainer');
      const countEl = document.getElementById('nodeSelectCount');
      countEl.textContent = '已找到 ' + extractedNodes.length + ' 個 VLESS 節點';
      
      let html = '';
      for (let i = 0; i < extractedNodes.length; i++) {
        const node = extractedNodes[i];
        let nodeName = '未命名節點';
        try {
          const hashIndex = node.indexOf('#');
          if (hashIndex !== -1) {
            nodeName = decodeURIComponent(node.substring(hashIndex + 1));
          }
        } catch (e) {}
        
        html += '<label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 6px; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background=\\'var(--bg-hover)\\'" onmouseout="this.style.background=\\'transparent\\'" >' +
            '<input type="checkbox" class="node-checkbox" value="' + i + '" checked style="margin-top: 4px; width: 16px; height: 16px; cursor: pointer;">' +
            '<div style="flex: 1; font-size: 0.85rem; word-break: break-all;">' +
              '<span style="font-weight: 600; color: var(--primary);">' + nodeName + '</span>' +
              '<div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">' + node.substring(0, 80) + '...</div>' +
            '</div>' +
          '</label>';
      }
      container.innerHTML = html;
      
      document.getElementById('nodeSelectModal').classList.add('show');
    }

    function closeNodeSelectModal() {
      document.getElementById('nodeSelectModal').classList.remove('show');
    }

    function toggleSelectAllNodes() {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      const anyUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
      checkboxes.forEach(cb => cb.checked = anyUnchecked);
    }

    function confirmNodeSelection() {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      const selectedNodes = [];
      for (let i = 0; i < checkboxes.length; i++) {
        if (checkboxes[i].checked) {
          const idx = parseInt(checkboxes[i].value);
          selectedNodes.push(extractedNodes[idx]);
        }
      }
        
      if (selectedNodes.length === 0) {
        return showToast('請至少選擇一個節點', false);
      }
      
      document.getElementById('argoBaseVless').value = selectedNodes.join('\\n');
      
      closeNodeSelectModal();
      focusAndScrollToArgo();
      showToast('已成功載入 ' + selectedNodes.length + ' 個 VLESS 節點為 Argo 隧道基底！');
    }

    function focusAndScrollToArgo() {
      const targetEl = document.getElementById('argoBaseVless');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.focus();
    }

    function generateRandomTempDomain() {
      const words = [
        "accurate", "active", "alert", "alive", "beautiful", "brave", "busy", "calm", "clean", "clever",
        "cooperative", "courageous", "creative", "decisive", "eager", "enthusiastic", "energetic", "faithful",
        "friendly", "gentle", "happy", "healthy", "helpful", "honest", "industrious", "jolly", "kind", "lively",
        "lovely", "lucky", "obedient", "polite", "proud", "quick", "quiet", "relieved", "rich", "smiling",
        "splendid", "successful", "thoughtful", "victorious", "wary", "witty", "wonderful", "zealous",
        "obtained", "translated", "matched", "verified", "secured", "certified", "tested", "managed", "selected",
        "trusted", "combined", "cartridges", "apples", "bananas", "tigers", "lions", "eagles", "dolphins", "clouds",
        "waves", "rivers", "mountains", "forests", "stars", "oceans", "planets", "crystals", "diamonds", "pearls",
        "arrows", "shields", "swords", "books", "pens", "clocks", "keys", "locks", "lights", "lamps", "flags",
        "maps", "globes", "compasses", "anchors", "sails", "boats", "ships", "trains", "planes", "cars", "bikes"
      ];
      
      const result = [];
      for (let i = 0; i < 4; i++) {
        const idx = Math.floor(Math.random() * words.length);
        result.push(words[idx]);
      }
      const randomDomain = result.join('-') + '.trycloudflare.com';
      document.getElementById('argoTempDomain').value = randomDomain;
      showToast('已隨機產生臨時隧道網域：' + randomDomain);
    }
    
    function copyResult(id) {
      const input = document.getElementById(id);
      input.select();
      navigator.clipboard.writeText(input.value).then(() => showToast('已複製到剪貼簿'));
    }
    
    function showQr(id) {
      const url = document.getElementById(id).value;
      if(!url) return;
      
      const container = document.getElementById('qrcodeCanvas');
      container.innerHTML = '';
      
      document.getElementById('qrModalUrl').textContent = url;
      
      new QRCode(container, {
        text: url,
        width: 240,
        height: 240,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
      });
      
      document.getElementById('qrModal').classList.add('show');
    }

    function closeQrModal() {
      document.getElementById('qrModal').classList.remove('show');
    }
    
    function showToast(msg, isSuccess) {
      if (isSuccess === undefined) isSuccess = true;
      const t = document.getElementById('toast');
      const msgEl = document.getElementById('toastMsg');
      
      if(isSuccess) {
        t.classList.add('success');
        t.querySelector('svg').innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
      } else {
        t.classList.remove('success');
        t.querySelector('svg').innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
        t.querySelector('svg').style.color = 'var(--danger)';
      }
      
      msgEl.textContent = msg;
      t.classList.add('show');
      setTimeout(function() {
        t.classList.remove('show');
        setTimeout(function() {
          t.querySelector('svg').style.color = '';
        }, 300);
      }, 3000);
    }
    
    loadFavs();
  </script>
</body>
</html>
`;
