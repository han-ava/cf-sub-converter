// 這裡將網址改為你當前專案 (cf-sub-converter) 的 Raw 連結
// 注意：GitHub 是區分大小寫的，請確保檔名 (.JSON / .YAML) 與你上傳的完全一致
export const REMOTE_CONFIG = {
  singbox: 'https://raw.githubusercontent.com/sammy0101/myself/refs/heads/main/Sing-Box_Rules.JSON',
  clash: 'https://raw.githubusercontent.com/sammy0101/myself/refs/heads/main/Clash_Rules.YAML'
};

export const HTML_PAGE = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>訂閱轉換器 | Sub Converter</title>
  
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>">
  
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root { --bg: #09090b; --card-bg: #18181b; --input-bg: #27272a; --text-main: #fafafa; --text-sub: #a1a1aa; --accent: #22d3ee; --accent-hover: #06b6d4; --border: #3f3f46; --success: #22c55e; --danger: #ef4444; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text-main); min-height: 100vh; padding: 0; }
    
    .hero { background: linear-gradient(180deg, #18181b 0%, #09090b 100%); padding: 60px 20px 40px; text-align: center; border-bottom: 1px solid var(--border); }
    .logo { font-size: 3.5rem; margin-bottom: 1rem; }
    .hero h1 { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.03em; margin-bottom: 0.5rem; background: linear-gradient(135deg, #fafafa 0%, #a1a1aa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { color: var(--text-sub); font-size: 1.1rem; max-width: 500px; margin: 0 auto; }
    .tagline { display: inline-flex; align-items: center; gap: 8px; margin-top: 1.5rem; padding: 8px 16px; background: rgba(34, 211, 238, 0.1); border: 1px solid rgba(34, 211, 238, 0.2); border-radius: 100px; }
    .tagline span { color: var(--accent); font-size: 0.9rem; font-weight: 500; }
    
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
    .card-title { font-size: 1rem; font-weight: 600; color: var(--accent); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    
    .input-section label { display: block; font-size: 0.85rem; color: var(--text-sub); margin-bottom: 8px; font-weight: 500; }
    textarea { width: 100%; background: var(--input-bg); border: 1px solid var(--border); color: var(--text-main); padding: 16px; border-radius: 12px; font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.9rem; outline: none; resize: vertical; min-height: 120px; line-height: 1.6; transition: all 0.2s; }
    textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(34, 211, 248, 0.1); }
    
    .short-link { margin-top: 16px; }
    .short-link input { width: 100%; background: var(--input-bg); border: 1px solid var(--border); color: var(--text-main); padding: 14px 16px; border-radius: 10px; outline: none; font-size: 0.95rem; }
    .short-link input:focus { border-color: var(--accent); }
    .short-link-hint { font-size: 0.8rem; color: var(--text-sub); margin-top: 8px; }
    
    .generate-btn { width: 100%; background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%); color: #09090b; border: none; padding: 18px; border-radius: 12px; font-size: 1.1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 24px; display: flex; align-items: center; justify-content: center; gap: 10px; }
    .generate-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(34, 211, 238, 0.3); }
    .generate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    
    .results { display: none; margin-top: 32px; }
    .results.show { display: block; }
    .results-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    
    .result-item { background: var(--input-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 16px; }
    .result-icon { width: 48px; height: 48px; background: var(--card-bg); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
    .result-info { flex: 1; }
    .result-name { font-weight: 600; font-size: 1rem; margin-bottom: 4px; }
    .result-desc { font-size: 0.8rem; color: var(--text-sub); }
    .result-link { flex: 2; }
    .result-link input { width: 100%; background: var(--card-bg); border: none; color: var(--text-main); padding: 10px 14px; border-radius: 8px; font-family: monospace; font-size: 0.85rem; }
    .result-copy { background: var(--border); color: var(--text-main); border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .result-copy:hover { background: var(--accent); color: #09090b; }
    
    .qr-section { display: flex; flex-direction: column; align-items: center; margin-top: 24px; padding: 24px; background: var(--input-bg); border-radius: 12px; }
    .qr-section h4 { color: var(--text-sub); margin-bottom: 16px; font-weight: 500; }
    #qrcode { padding: 12px; background: #fff; border-radius: 12px; }
    
    .fav-section { margin-top: 24px; }
    .fav-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .fav-add-btn { background: var(--border); color: var(--text-main); border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .fav-add-btn:hover { background: var(--accent); color: #09090b; }
    .fav-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .fav-card { background: var(--input-bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px; cursor: pointer; transition: all 0.2s; }
    .fav-card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .fav-card-name { font-weight: 600; margin-bottom: 4px; }
    .fav-card-url { font-size: 0.8rem; color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fav-card-actions { display: flex; gap: 8px; margin-top: 10px; }
    .fav-card-btn { font-size: 0.8rem; color: var(--text-sub); cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .fav-card-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-main); }
    .fav-card-delete { color: var(--danger); }
    .fav-card-delete:hover { background: rgba(239, 68, 68, 0.2); }
    
    .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; align-items: center; justify-content: center; }
    .modal.show { display: flex; }
    .modal-content { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 24px; width: 90%; max-width: 500px; }
    .modal-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 20px; }
    .modal-actions { display: flex; gap: 12px; margin-top: 20px; }
    .modal-btn { flex: 1; padding: 12px; border-radius: 10px; font-weight: 600; cursor: pointer; border: none; }
    .modal-btn-cancel { background: var(--input-bg); color: var(--text-main); }
    .modal-btn-save { background: var(--accent); color: #09090b; }
    
    .footer { text-align: center; padding: 40px 20px; color: var(--text-sub); font-size: 0.9rem; }
    .footer a { color: var(--accent); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    
    .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--success); color: white; padding: 14px 28px; border-radius: 12px; font-weight: 600; opacity: 0; transition: all 0.3s; z-index: 200; }
    .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    
    @media (max-width: 640px) {
      .hero h1 { font-size: 1.8rem; }
      .result-item { flex-direction: column; align-items: flex-start; }
      .result-link { width: 100%; }
      .result-copy { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="logo">⚡</div>
    <h1>Sub Converter</h1>
    <p>一鍵生成 SingBox / Clash / Base64 三種訂閱格式，適用於所有主流客戶端</p>
    <div class="tagline"><span>🌍 智能分流</span> · <span>☁️ 雲端儲存</span> · <span>🔒 隱私保護</span></div>
  </div>
  
  <div class="container">
    <div class="card">
      <div class="input-section">
        <label>📥 輸入訂閱連結或節點 (多個用換行分隔)</label>
        <textarea id="urlInput" placeholder="vmess://xxxxxx|ss://xxxxxx|trojan://xxxxxx&#10;https://example.com/sub"></textarea>
      </div>
      
      <div class="short-link">
        <label>🔗 自訂短連結 (可選)</label>
        <input type="text" id="shortCode" placeholder="my-sub">
        <div class="short-link-hint">設定後可생成長期有效的自訂連結，資料將儲存於雲端</div>
      </div>
      
      <button class="generate-btn" onclick="generate()">⚡ 立即生成</button>
    </div>
    
    <div class="results" id="results">
      <div class="results-title">🎉 生成的訂閱連結</div>
      
      <div class="result-item">
        <div class="result-icon">📄</div>
        <div class="result-info">
          <div class="result-name">Sing-Box</div>
          <div class="result-desc">JSON 格式 · 支援 Surge、v2rayN、Shadowrocket</div>
        </div>
        <div class="result-link"><input type="text" id="singboxUrl" readonly></div>
        <button class="result-copy" onclick="copyResult('singboxUrl')">複製</button>
      </div>
      
      <div class="result-item">
        <div class="result-icon">📋</div>
        <div class="result-info">
          <div class="result-name">Clash Meta</div>
          <div class="result-desc">YAML 格式 · 支援 Clash Verge、ClashX、Meta</div>
        </div>
        <div class="result-link"><input type="text" id="clashUrl" readonly></div>
        <button class="result-copy" onclick="copyResult('clashUrl')">複製</button>
      </div>
      
      <div class="result-item">
        <div class="result-icon">🔗</div>
        <div class="result-info">
          <div class="result-name">Base64</div>
          <div class="result-desc">原始連結 · 支援 V2RayNG、帆樯</div>
        </div>
        <div class="result-link"><input type="text" id="base64Url" readonly></div>
        <button class="result-copy" onclick="copyResult('base64Url')">複製</button>
      </div>
      
      <div class="qr-section">
        <h4>📱 手機掃碼</h4>
        <div id="qrcode"></div>
      </div>
    </div>
    
    <div class="card fav-section">
      <div class="fav-header">
        <div class="card-title" style="margin:0">⭐ 收藏的訂閱</div>
        <button class="fav-add-btn" onclick="openModal()">+ 新增</button>
      </div>
      <div class="fav-grid" id="favGrid">
        <div style="color: var(--text-sub); font-size: 0.9rem;">暫無收藏...</div>
      </div>
    </div>
  </div>
  
  <div class="modal" id="modal">
    <div class="modal-content">
      <div class="modal-title">新增收藏</div>
      <div class="input-section">
        <label>名稱</label>
        <textarea id="favName" style="min-height: 50px;"></textarea>
      </div>
      <div class="input-section" style="margin-top: 16px;">
        <label>訂閱連結</label>
        <textarea id="favUrl" style="min-height: 100px;"></textarea>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" onclick="closeModal()">取消</button>
        <button class="modal-btn modal-btn-save" onclick="saveFav()">儲存</button>
      </div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <div class="footer">
    <a href="https://github.com/sammy0101/cf-sub-converter" target="_blank">GitHub</a> · 開源免費使用
  </div>
  
  <script>
    let favs = [];
    
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
        grid.innerHTML = '<div style="color: var(--text-sub); font-size: 0.9rem;">暫無收藏...</div>';
        return;
      }
      grid.innerHTML = favs.map((f, i) => \`<div class="fav-card" onclick="useFav(\${i})">
        <div class="fav-card-name">\${f.name}</div>
        <div class="fav-card-url">\${f.url.substring(0, 40)}...</div>
        <div class="fav-card-actions">
          <span class="fav-card-btn" onclick="event.stopPropagation(); editFav(\${i})">編輯</span>
          <span class="fav-card-btn fav-card-delete" onclick="event.stopPropagation(); deleteFav(\${i})">刪除</span>
        </div>
      </div>\`).join('');
    }
    
    async function saveFav() {
      const name = document.getElementById('favName').value.trim();
      const url = document.getElementById('favUrl').value.trim();
      if (!name || !url) return alert('請填寫名稱和連結');
      
      const editIndex = document.getElementById('modal').dataset.edit;
      
      try {
        if (editIndex !== '') {
          await fetch('/favs', { 
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ index: parseInt(editIndex), name, url }) 
          });
        } else {
          await fetch('/favs', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ name, url }) 
          });
        }
        closeModal();
        loadFavs();
        showToast('💾 已儲存');
      } catch(e) { alert('儲存失敗'); }
    }
    
    async function deleteFav(index) {
      if (!confirm('確定刪除？')) return;
      try {
        await fetch('/favs', { 
          method: 'DELETE', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ index }) 
        });
        loadFavs();
        showToast('🗑️ 已刪除');
      } catch(e) {}
    }
    
    function useFav(index) {
      document.getElementById('urlInput').value = favs[index].url;
      document.getElementById('shortCode').value = favs[index].name;
      showToast('📥 已載入: ' + favs[index].name);
    }
    
    function editFav(index) {
      document.getElementById('favName').value = favs[index].name;
      document.getElementById('favUrl').value = favs[index].url;
      document.getElementById('modal').dataset.edit = index;
      document.getElementById('modal').classList.add('show');
    }
    
    function openModal() {
      document.getElementById('favName').value = '';
      document.getElementById('favUrl').value = '';
      document.getElementById('modal').dataset.edit = '';
      document.getElementById('modal').classList.add('show');
    }
    
    function closeModal() {
      document.getElementById('modal').classList.remove('show');
    }
    
    async function generate() {
      const raw = document.getElementById('urlInput').value.trim();
      if (!raw) return alert('請輸入訂閱連結');
      
      const btn = document.querySelector('.generate-btn');
      btn.disabled = true;
      btn.textContent = '⏳ 處理中...';
      
      const host = window.location.origin;
      const shortCode = document.getElementById('shortCode').value.trim();
      let final = '';
      let urlToFetch = '';
      
      try {
        if (shortCode) {
          await fetch('/save', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ path: shortCode, content: raw }) 
          });
          urlToFetch = \`\${host}/\${shortCode}\`;
        } else {
          const encodedUrl = encodeURIComponent(raw);
          urlToFetch = \`\${host}/?url=\${encodedUrl}\`;
        }
        
        document.getElementById('singboxUrl').value = urlToFetch + '&target=singbox';
        document.getElementById('clashUrl').value = urlToFetch + '&target=clash';
        document.getElementById('base64Url').value = urlToFetch + '&target=base64';
        
        document.getElementById('results').classList.add('show');
        
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: urlToFetch + '&target=singbox', width: 160, height: 160 });
        
        showToast('⚡ 生成完成');
      } catch(e) {
        alert('生成失敗: ' + e.message);
      }
      
      btn.disabled = false;
      btn.textContent = '⚡ 立即生成';
    }
    
    function copyResult(id) {
      const input = document.getElementById(id);
      navigator.clipboard.writeText(input.value).then(() => showToast('✅ 複製成功'));
    }
    
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }
    
    loadFavs();
  </script>
</body>
</html>
`;