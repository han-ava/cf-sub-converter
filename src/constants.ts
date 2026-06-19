// src/constants.ts
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
    .panel { 
      background-color: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.75rem; box-shadow: var(--shadow); 
      transform: translate3d(0,0,0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    .panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
    .panel-title { font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .panel-title svg { color: var(--text-muted); }
    .form-group { margin-bottom: 1.25rem; }
    .form-group:last-child { margin-bottom: 0; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: var(--text-muted); margin-bottom: 0.5rem; }
    textarea, input[type="text"] {
      width: 100%; background-color: var(--bg-input); border: 1px solid var(--border); color: var(--text-main); border-radius: var(--radius-md); padding: 0.875rem 1rem; font-size: 0.95rem; transition: border-color 0.2s ease, box-shadow 0.2s ease; outline: none;
    }
    textarea { font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; min-height: 140px; resize: vertical; line-height: 1.6; }
    textarea::placeholder, input::placeholder { color: #475569; }
    textarea:focus, input[type="text"]:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
    
    .hint { 
      font-size: 0.8rem; 
      color: var(--text-muted); 
      margin-top: 0.4rem; 
      display: flex; 
      align-items: flex-start; 
      gap: 6px; 
    }
    .hint svg {
      flex-shrink: 0;
      margin-top: 2px;
      width: 14px;
      height: 14px;
    }
    .hint span {
      display: inline;
      white-space: normal;
      word-break: break-word;
    }
    
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0.75rem 1.25rem; border-radius: var(--radius-md); font-weight: 600; font-size: 0.95rem; border: none; cursor: pointer; 
      transition: background-color 0.2s ease, transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; 
      user-select: none;
      transform: translate3d(0,0,0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    .btn-primary { background-color: var(--primary); color: white; width: 100%; padding: 1rem; font-size: 1.05rem; }
    .btn-primary:hover:not(:disabled) { background-color: var(--primary-hover); transform: translate3d(0, -1px, 0); }
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
      background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; cursor: pointer; 
      transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease; 
      position: relative;
      transform: translate3d(0,0,0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      min-width: 0; 
    }
    .fav-card:hover { border-color: var(--primary); transform: translate3d(0, -2px, 0); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .fav-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    
    .fav-url { 
      font-family: 'JetBrains Mono', monospace; 
      font-size: 0.75rem; 
      color: var(--text-muted); 
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: break-all;
    }
    
    .fav-actions { display: flex; gap: 8px; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); justify-content: flex-end; }
    .empty-state { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem; border: 1px dashed var(--border); border-radius: var(--radius-md); }
    
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(4px); z-index: 100; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;
    }
    .modal-overlay.show { display: flex; opacity: 1; }
    
    /* 💥 彈出視窗樣式優化：寬度放大到 720px，新增最大高度及滾動條 */
    .modal-content {
      background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); width: 92%; max-width: 720px; padding: 2rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); transform: scale(0.95); transition: transform 0.2s ease;
      max-height: 92vh;
      overflow-y: auto;
    }
    
    /* 💥 節點內容與訂閱連結加高、字型調整，看的更清楚 */
    #favUrl {
      min-height: 280px;
      font-size: 0.85rem;
    }
    
    .modal-footer { 
      display: flex; 
      gap: 12px; 
      margin-top: 2rem; 
      justify-content: flex-end; 
    }
    
    .toast {
      position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(20px); background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border); padding: 0.8rem 1.5rem; border-radius: 999px; font-weight: 500; font-size: 0.9rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); opacity: 0; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); z-index: 200; display: flex; align-items: center; gap: 8px;
    }
    .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    .toast.success svg { color: var(--success); }
    @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; }

    .cmd-group {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      align-items: center;
      width: 100%;
    }
    .cmd-group input {
      flex: 1;
      min-width: 0;
    }
    .cmd-group .btn {
      flex-shrink: 0;
      min-width: 110px;
    }

    @media (max-width: 768px) {
      textarea, input[type="text"] {
        font-size: 16px !important;
      }
    }

    @media (max-width: 640px) {
      .header {
        padding: 0.85rem 1.25rem;
      }
      .brand {
        font-size: 1.1rem;
      }
      .container {
        margin: 1.25rem auto;
        padding: 0 0.85rem;
        gap: 1rem;
      }
      .panel {
        padding: 1.25rem;
      }
      .panel-title {
        font-size: 1rem;
      }
      textarea {
        min-height: 110px;
      }
      .cmd-group {
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }
      .cmd-group .btn {
        width: 100%;
      }
      
      .result-item {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 1rem;
      }
      .result-icon-box { 
        display: none; 
      }
      .result-info {
        margin-bottom: 2px;
      }
      .result-name {
        font-size: 0.9rem;
      }
      .result-desc {
        font-size: 0.75rem;
      }
      .result-input-wrapper input {
        font-size: 0.75rem;
        padding: 0.5rem;
      }
      .result-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        width: 100%;
        margin-top: 4px;
      }
      .result-actions .btn-icon {
        width: 100%;
        height: 38px;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }

    @media (max-width: 520px) {
      .fav-grid {
        grid-template-columns: 1fr;
        gap: 0.85rem;
      }
      .fav-card {
        padding: 1rem;
      }
      .modal-content {
        padding: 1.25rem;
      }
    }
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
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>只保留名稱符合關鍵字的節點。例如輸入 <code>HK|TW</code>。</span>
        </div>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="excludeKeywords">排除關鍵字節點 (選填，多個用 | 分隔)</label>
        <input type="text" id="excludeKeywords" placeholder="examples: 流量|官網|重置|5x">
        <div class="hint">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>排除名稱符合關鍵字的節點（過濾垃圾廣告）。例如輸入 <code>5x</code>。</span>
        </div>
      </div>

      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="renameKeywords">節點名稱替換 (選填，多個用 | 分隔)</label>
        <input type="text" id="renameKeywords" placeholder="例如: DEL-[69云]|移动优化-專線">
        <div class="hint">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>刪除用 <code>DEL-關鍵字</code>，替換用 <code>尋找-替換</code>。若要將所有節點統一改名，請用 <code>ALL-新名稱</code>（例如 <code>ALL-JP</code>）。多組規則用 <code>|</code> 隔開。</span>
        </div>
      </div>
      
      <div class="form-group" style="margin-top: 1.5rem;">
        <label for="shortCode">自訂路徑短連結 (選填)</label>
        <input type="text" id="shortCode" placeholder="例如: my-sub-2026">
        <div class="hint">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>設定後將儲存於雲端，生成固定不變的短連結</span>
        </div>
      </div>
      
      <button class="btn btn-primary" id="generateBtn" onclick="generate()" style="margin-top: 2rem;">
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>執行轉換</span>
      </button>
    </main>

    <!-- ⚡ 轉換結果面板 -->
    <section class="results-wrapper" id="results">
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">
            <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            轉換結果
          </h2>
        </div>
        
        <!-- 1. 自適應 -->
        <div class="result-item">
          <div class="result-icon-box">
            <svg viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
          </div>
          <div class="result-info">
            <div class="result-name">自適應</div>
            <div class="result-desc">自動辨識客戶端 · 適用所有主流行動軟體</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="adaptiveUrl" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('adaptiveUrl')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('adaptiveUrl')" title="顯示 QR Code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                <path d="M21 21v.01"></path>
                <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                <path d="M3 12h.01"></path>
                <path d="M12 3h.01"></path>
                <path d="M12 16v.01"></path>
                <path d="M16 12h1"></path>
                <path d="M21 12v.01"></path>
                <path d="M12 21v-1"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. Base64 -->
        <div class="result-item">
          <div class="result-icon-box"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>
          <div class="result-info">
            <div class="result-name">Base64</div>
            <div class="result-desc">Base64 格式 · 適用 V2RayNG, PassWall</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="base64Url" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('base64Url')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('base64Url')" title="顯示 QR Code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                <path d="M21 21v.01"></path>
                <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                <path d="M3 12h.01"></path>
                <path d="M12 3h.01"></path>
                <path d="M12 16v.01"></path>
                <path d="M16 12h1"></path>
                <path d="M21 12v.01"></path>
                <path d="M12 21v-1"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- 3. Clash Meta -->
        <div class="result-item">
          <div class="result-icon-box"><svg viewBox="0 0 24 24"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="6.5"></line></svg></div>
          <div class="result-info">
            <div class="result-name">Clash Meta</div>
            <div class="result-desc">YAML 格式 · 適用 Clash Verge, ClashX</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="clashUrl" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('clashUrl')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('clashUrl')" title="顯示 QR Code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                <path d="M21 21v.01"></path>
                <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                <path d="M3 12h.01"></path>
                <path d="M12 3h.01"></path>
                <path d="M12 16v.01"></path>
                <path d="M16 12h1"></path>
                <path d="M21 12v.01"></path>
                <path d="M12 21v-1"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- 4. Sing-Box -->
        <div class="result-item">
          <div class="result-icon-box"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg></div>
          <div class="result-info">
            <div class="result-name">Sing-Box</div>
            <div class="result-desc">JSON 格式 · 適用 Surge, v2rayN 等</div>
          </div>
          <div class="result-input-wrapper"><input type="text" id="singboxUrl" readonly></div>
          <div class="result-actions">
            <button class="btn-icon" onclick="copyResult('singboxUrl')" title="複製連結"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            <button class="btn-icon" onclick="showQr('singboxUrl')" title="顯示 QR Code">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="5" height="5" x="3" y="3" rx="1"></rect>
                <rect width="5" height="5" x="16" y="3" rx="1"></rect>
                <rect width="5" height="5" x="3" y="16" rx="1"></rect>
                <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
                <path d="M21 21v.01"></path>
                <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
                <path d="M3 12h.01"></path>
                <path d="M12 3h.01"></path>
                <path d="M12 16v.01"></path>
                <path d="M16 12h1"></path>
                <path d="M21 12v.01"></path>
                <path d="M12 21v-1"></path>
              </svg>
            </button>
          </div>
        </div>

      </div>
    </section>

    <!-- ⚡ Argo 隧道一鍵生成器區塊 -->
    <main class="panel" style="margin-top: 1rem;">
      <div class="panel-header">
        <h2 class="panel-title" style="color: var(--primary);">
          <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
          Argo 隧道一鍵生成器
        </h2>
      </div>
      
      <div class="form-group">
        <button class="btn btn-ghost" id="parseVlessBtn" onclick="parseVlessNodes()" style="width: 100%; justify-content: center; font-weight: 600;">
          第一步：解析並載入目前輸入的 VLESS / VMess 節點
        </button>
      </div>

      <div id="vlessSelectorWrapper" style="display: none; margin-top: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; background: var(--bg-input);">
        <label style="margin-bottom: 0.75rem; display: block; font-weight: 600; color: var(--text-main);">選擇要複製並轉換的原始節點 (支援 VLESS / VMess，可多選)：</label>
        <div id="vlessCheckboxList" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 4px; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;">
          <!-- 複選框動態生成 -->
        </div>
        
        <div class="form-group">
          <label>1. VPS 本地監聽連接埠 (預設已自動匹配您所選節點之端口，可手動修改)</label>
          <input type="text" id="argoLocalPort" value="8080" placeholder="例如: 8080、12345 等">
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>2. Cloudflare Tunnel Token (選填，若留空則自動啟用臨時隨機隧道)</label>
          <input type="text" id="argoTunnelToken" placeholder="若使用臨時隧道請留空；固定隧道請貼上 eyJhIjoiY2...">
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>3. 自訂綁定域名 (固定隧道必填，臨時隨機隧道免填)</label>
          <input type="text" id="argoCustomDomain" placeholder="例如: argo.yourdomain.com">
        </div>

        <button class="btn btn-primary" id="generateArgoBtn" onclick="generateArgo()" style="margin-top: 1.5rem; background: var(--success);">
          第二步：一鍵生成 Argo 節點與一鍵部署腳本
        </button>
      </div>
    </main>

    <!-- ⚡ Argo 轉換結果看板 -->
    <section class="results-wrapper" id="argoResults" style="margin-top: 1rem;">
      <div class="panel">
        <div class="panel-header" style="border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;">
          <h2 class="panel-title" style="color: var(--success);">
            <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Argo 隧道生成成功
          </h2>
        </div>
        
        <!-- 一鍵極速部署指令 -->
        <div class="form-group" style="margin-top: 1.25rem;">
          <label style="color: var(--text-main); font-weight: 600;">📋 第一步：請在您的 VPS 上執行以下「一鍵極速安裝指令」【二選一，效果完全相同】(以 root 權限)：</label>
          
          <!-- curl 方案 -->
          <div class="cmd-group">
            <input type="text" id="argoCurlCmd" readonly style="font-family: monospace; font-size: 0.85rem; padding: 0.6rem 0.8rem; background: var(--bg-input);">
            <button class="btn btn-ghost" onclick="copyText('argoCurlCmd')">複製 curl 指令</button>
          </div>
          
          <div style="text-align: center; margin: 6px 0; font-size: 0.8rem; color: var(--text-muted); font-weight: bold;">或 (OR)</div>
          
          <!-- wget 方案 -->
          <div class="cmd-group">
            <input type="text" id="argoWgetCmd" readonly style="font-family: monospace; font-size: 0.85rem; padding: 0.6rem 0.8rem; background: var(--bg-input);">
            <button class="btn btn-ghost" onclick="copyText('argoWgetCmd')">複製 wget 指令</button>
          </div>
          
          <div class="hint" style="margin-top: 5px;">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;color: var(--success);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            VPS 將自動下載服務配置、啟動隧道。臨時隧道模式將在部署成功後直接於 VPS 終端機顯示最終 active 的節點連結！
          </div>
        </div>

        <!-- 第二步：顯示與複製整合後的明文列表 -->
        <div class="form-group" style="margin-top: 1.5rem;">
          <label style="color: var(--text-main); font-weight: 600;">🔗 第二步：新產生的 Argo 明文節點連結列表 (僅固定域名模式生效，臨時域名模式請直接在 VPS 複製)：</label>
          <textarea id="argoBase64Sub" placeholder="臨時域名具有動態性，一鍵指令部署成功後請直接於您 VPS 終端機內進行拷貝..." readonly style="min-height: 140px; font-size: 0.8rem; font-family: 'JetBrains Mono', monospace; line-height:1.6;"></textarea>
          <button class="btn btn-ghost" onclick="copyText('argoBase64Sub')" style="margin-top: 0.5rem; width: 100%; justify-content: center;">複製明文節點列表</button>
          <div class="hint" style="margin-top: 8px; color: var(--success);">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;color: var(--success);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>💡 提示：請複製第一步的指令至您的 VPS 執行。如果是臨時隧道，運行成功後請直接在您 VPS 終端機複製最終連線連結！</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 已儲存的配置 -->
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
        <div class="empty-state">目前尚未儲存 any 配置</div>
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
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="saveFav()" style="width: auto; padding: 0.6rem 1.25rem; font-size: 16px;">儲存配置</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast">
    <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
    <span id="toastMsg">提示訊息</span>
  </div>

  <script>
    let favs = [];
    
    async function loadFavs() {
      try {
        const resp = await fetch('/favs');
        if (resp.ok) favs = await resp.json();
        renderFavs();
      } catch(e) { console.error('Failed to load favs'); }
    }
    
    function renderFavs() {
      const grid = document.getElementById('favGrid');
      if (favs.length === 0) {
        grid.style.display = 'block';
        grid.innerHTML = '<div class="empty-state">目前尚未儲存 any 配置</div>';
        return;
      }
      grid.style.display = 'grid';
      grid.innerHTML = favs.map((f, i) => {
        const includeBadge = f.include ? \`<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); border-color: rgba(16, 185, 129, 0.2); margin-right: 4px;">保: \${f.include}</span>\` : '';
        const excludeBadge = f.exclude ? \`<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border-color: rgba(239, 68, 68, 0.2); margin-right: 4px;">排: \${f.exclude}</span>\` : '';
        const renameBadge = f.rename ? \`<span class="badge" style="background: rgba(59, 130, 246, 0.1); color: var(--primary); border-color: rgba(59, 130, 246, 0.2)">替: \${f.rename}</span>\` : '';
        
        return \`
          <div class="fav-card" onclick="useFav(\${i})">
            <div class="fav-title">
              <svg viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--primary)"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              \${f.name}
            </div>
            <div class="fav-url">\${f.url}</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
              \${includeBadge}
              \${excludeBadge}
              \${renameBadge}
            </div>
            <div class="fav-actions">
              <button class="btn btn-ghost" onclick="event.stopPropagation(); editFav(\${i})">編輯</button>
              <button class="btn btn-ghost btn-danger" onclick="event.stopPropagation(); deleteFav(\${i})">刪除</button>
            </div>
          </div>\`;
      }).join('');
    }
    
    async function saveFav() {
      const name = document.getElementById('favName').value.trim();
      const url = document.getElementById('favUrl').value.trim();
      const include = document.getElementById('favInclude').value.trim();
      const exclude = document.getElementById('favExclude').value.trim();
      const rename = document.getElementById('favRename').value.trim();
      if (!name || !url) return showToast('請完整填寫名稱與內容', false);
      
      const editIndex = document.getElementById('modal').dataset.edit;
      const saveBtn = document.querySelector('.modal-footer .btn-primary');
      const originalSaveText = saveBtn.textContent;
      saveBtn.textContent = '儲存中...';
      
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
        saveBtn.textContent = originalSaveText;
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
      if (!raw) return showToast('請先輸入節點連結 or 訂閱地址', false);
      
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
          if (include) baseUrl += '&include=' + encodeURIComponent(include);
          if (exclude) baseUrl += '&exclude=' + encodeURIComponent(exclude);
          if (rename) baseUrl += '&rename=' + encodeURIComponent(rename);
        }
        
        const sep = baseUrl.includes('?') ? '&' : '?';
        document.getElementById('adaptiveUrl').value = baseUrl;
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
    
    // ⚡ Argo 隧道前端解析邏輯 (支援 VLESS 與 VMess)
    async function parseVlessNodes() {
      const raw = document.getElementById('urlInput').value.trim();
      if (!raw) return showToast('請先在上方輸入節點連結或訂閱地址', false);
      
      const btn = document.getElementById('parseVlessBtn');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '正在與後端解析節點...';
      
      try {
        const resp = await fetch('/api/parse-argo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: raw })
        });
        
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || '解析失敗');
        }
        
        const nodes = await resp.json();
        const listEl = document.getElementById('vlessCheckboxList');
        
        if (nodes.length === 0) {
          showToast('目前輸入內容中未找到任何 VLESS / VMess 節點', false);
          document.getElementById('vlessSelectorWrapper').style.display = 'none';
          return;
        }
        
        listEl.innerHTML = nodes.map(n => \`
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <input type="checkbox" class="vless-chk" value="\${n.index}" data-port="\${n.port}" data-server="\${n.server}" data-host="\${n.host}" style="width: auto; height: auto; cursor: pointer;" onchange="syncDefaultPort()">
            <span style="font-size: 0.9rem; color: var(--text-main);">\${n.name} <span style="color: var(--text-muted); font-size: 0.8rem;">(\${n.server}:\${n.port} - \${n.type.toUpperCase()})</span></span>
          </label>
        \`).join('');
        
        document.getElementById('vlessSelectorWrapper').style.display = 'block';
        
        syncDefaultPort();
        
        showToast(\`解析完成，成功載入 \${nodes.length} 個 VLESS/VMess 節點！\`);
      } catch(e) {
        showToast('解析出錯: ' + e.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    // ⚡ 當勾選狀態改變時同步為所選節點之原生連接埠
    function syncDefaultPort() {
      const checkedInput = document.querySelector('.vless-chk:checked');
      if (checkedInput) {
        const port = checkedInput.getAttribute('data-port');
        document.getElementById('argoLocalPort').value = port;
      }
    }

    // ⚡ Argo 隧道一鍵生成
    async function generateArgo() {
      const raw = document.getElementById('urlInput').value.trim();
      const checkboxes = document.querySelectorAll('.vless-chk:checked');
      if (checkboxes.length === 0) return showToast('請至少選擇一個節點進行轉換', false);
      
      const indices = Array.from(checkboxes).map(cb => parseInt(cb.value));
      const port = document.getElementById('argoLocalPort').value.trim() || '8080';
      const token = document.getElementById('argoTunnelToken').value.trim();
      const domain = document.getElementById('argoCustomDomain').value.trim();
      
      if (token && !domain) return showToast('若使用固定隧道，必須填寫對應的自訂域名', false);
      
      const btn = document.getElementById('generateArgoBtn');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '正在生成中...';
      
      try {
        const resp = await fetch('/api/argo-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: raw, indices, port, token, domain })
        });
        
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || '生成失敗');
        }
        
        const res = await resp.json();
        const host = window.location.origin;

        // 1. 填入極簡一鍵指令
        const hasKv = res.scriptId && res.scriptId.trim() !== '';
        if (hasKv) {
          document.getElementById('argoCurlCmd').value = \`curl -sSL \${host}/argo/sh/\${res.scriptId} | bash\`;
          document.getElementById('argoWgetCmd').value = \`wget -qO- \${host}/argo/sh/\${res.scriptId} | bash\`;
        } else {
          document.getElementById('argoCurlCmd').value = "請綁定 KV 命名空間以解鎖極簡一鍵命令";
          document.getElementById('argoWgetCmd').value = "或在 wrangler.toml 中設定並部署。";
        }

        // 2. 下方明文文字框只顯示新產生的 Argo 節點
        const argoPlainLinks = res.argoNodes.map(x => x.link).join('\\n');
        document.getElementById('argoBase64Sub').value = argoPlainLinks;

        document.getElementById('argoResults').classList.add('show');
        showToast('🎉 Argo 隧道部署指令已成功生成！');
        document.getElementById('argoResults').scrollIntoView({ behavior: 'smooth' });
      } catch(e) {
        showToast('生成失敗: ' + e.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    function copyResult(id) {
      const input = document.getElementById(id);
      input.select();
      navigator.clipboard.writeText(input.value).then(() => showToast('已複製到剪貼簿'));
    }
    
    function copyText(id) {
      const el = document.getElementById(id);
      el.select();
      navigator.clipboard.writeText(el.value).then(() => showToast('已成功複製到剪貼簿！'));
    }

    function showQr(id) {
      const url = document.getElementById(id).value;
      if(!url) return;
      const win = window.open('', '_blank', 'width=420,height=480');
      if (!win) return showToast('請允許瀏覽器開啟彈出視窗', false);
      win.document.write(\`
        <!DOCTYPE html><html><head><meta charset="utf-8"><title>掃碼訂閱</title>
        <style>
          body { margin:0; background:#0f172a; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; }
          .qr-container { padding:24px; background:#ffffff; border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.5); }
          .title { margin-top:24px; font-size:16px; color:#f8fafc; font-weight:600; letter-spacing:0.5px; }
          .subtitle { margin-top:8px; font-size:13px; color:#94a3b8; text-align:center; max-width:280px; word-break:break-all;}
        </style>
        </head><body>
        <div class="qr-container"><div id="qr"></div></div>
        <div class="title">使用客戶端掃描行動條碼</div>
        <div class="subtitle\">\${url}</div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\\/script>
        <script>
          setTimeout(() => {
            new QRCode(document.getElementById('qr'), { text: "\${url}", width: 260, height: 260, colorDark: "#0f172a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
          }, 100);
        <\\/script>
        </body></html>
      \` );
    }
    
    function showToast(msg, isSuccess = true) {
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
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.querySelector('svg').style.color = '', 300);
      }, 3000);
    }
    
    loadFavs();
  </script>
</body>
</html>
`;
