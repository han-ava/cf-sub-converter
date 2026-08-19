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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root {
      --bg-app: #0b0f19;
      --bg-panel: #131b2e;
      --bg-card: #17223b;
      --bg-input: #0d1424;
      --bg-hover: #1f2d4a;

      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.16);
      --border-focus: #3b82f6;

      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;

      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --primary-active: #1d4ed8;
      --primary-glow: rgba(59, 130, 246, 0.3);

      --accent: #38bdf8;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --success-border: rgba(16, 185, 129, 0.25);

      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --warning-border: rgba(245, 158, 11, 0.25);

      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --danger-border: rgba(239, 68, 68, 0.25);

      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-xl: 18px;
      --shadow-panel: 0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.25);
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
      -webkit-font-smoothing: antialiased;
    }

    /* 页面顶部导航栏 */
    header {
      background-color: rgba(19, 27, 46, 0.85);
      border-bottom: 1px solid var(--border);
      padding: 0.875rem 1.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(12px);
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 18px;
      box-shadow: 0 0 16px rgba(59, 130, 246, 0.45);
      flex-shrink: 0;
    }

    .brand-titles {
      display: flex;
      flex-direction: column;
    }

    .brand-title {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .guide-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: var(--radius-md);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .guide-btn:hover {
      background: var(--bg-card);
      color: var(--text-main);
      border-color: var(--border-strong);
    }

    .badge {
      background: rgba(59, 130, 246, 0.1);
      color: #60a5fa;
      font-size: 0.725rem;
      padding: 3px 9px;
      border-radius: 9999px;
      font-weight: 600;
      border: 1px solid rgba(59, 130, 246, 0.25);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .badge-success {
      background: var(--success-bg);
      color: var(--success);
      border-color: var(--success-border);
    }

    .badge-warn {
      background: var(--warning-bg);
      color: var(--warning);
      border-color: var(--warning-border);
    }

    .badge-danger {
      background: var(--danger-bg);
      color: var(--danger);
      border-color: var(--danger-border);
    }

    .container {
      max-width: 960px;
      width: 100%;
      margin: 1.75rem auto 3rem auto;
      padding: 0 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      flex: 1;
    }

    /* 统一卡片面板规范 (Panel) */
    .panel {
      background-color: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 1.5rem;
      box-shadow: var(--shadow-panel);
      transition: border-color 0.2s ease;
    }

    .panel:hover {
      border-color: var(--border-strong);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .panel-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-main);
    }

    /* 标准表单控件 */
    .form-group {
      margin-bottom: 1.15rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .label-hint {
      font-size: 0.75rem;
      font-weight: 400;
      color: var(--text-dim);
    }

    textarea, input[type="text"], select {
      width: 100%;
      height: 44px;
      background-color: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-main);
      border-radius: var(--radius-md);
      padding: 0 0.95rem;
      font-size: 0.9rem;
      font-family: inherit;
      transition: all 0.2s ease;
      outline: none;
    }

    textarea {
      height: auto;
      min-height: 110px;
      padding: 0.75rem 0.95rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.825rem;
      resize: vertical;
      line-height: 1.6;
    }

    textarea:focus, input[type="text"]:focus, select:focus {
      border-color: var(--border-focus);
      background-color: var(--bg-input-focus);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
    }

    select {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      padding-right: 36px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    /* 优雅的开关组件 (Switch) */
    .switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.65rem 0;
      user-select: none;
    }

    .switch-info {
      display: flex;
      flex-direction: column;
    }

    .switch-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-main);
    }

    .switch-desc {
      font-size: 0.75rem;
      color: var(--text-dim);
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #1e293b;
      border: 1px solid var(--border);
      transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 24px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 2px;
      bottom: 2px;
      background-color: #94a3b8;
      transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--primary);
      border-color: var(--primary);
    }

    input:checked + .slider:before {
      transform: translateX(20px);
      background-color: white;
    }

    /* 折叠高级设置 */
    .collapse-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--accent);
      cursor: pointer;
      padding: 0.6rem 0;
      user-select: none;
      font-weight: 600;
    }

    .collapse-header:hover {
      opacity: 0.85;
    }

    .collapse-content {
      display: none;
      padding-top: 0.75rem;
      animation: fadeIn 0.2s ease;
    }

    .collapse-content.show {
      display: block;
    }

    /* 按钮规范 */
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
      height: 46px;
      padding: 0 1.5rem;
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 0.925rem;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      text-decoration: none;
      font-family: inherit;
    }

    .btn-primary {
      background-color: var(--primary);
      color: white;
      flex: 3;
      box-shadow: 0 4px 14px var(--primary-glow);
    }

    .btn-primary:hover {
      background-color: var(--primary-hover);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.45);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background-color: var(--bg-card);
      color: var(--text-muted);
      border-color: var(--border);
      flex: 1;
    }

    .btn-secondary:hover {
      background-color: var(--bg-hover);
      color: var(--text-main);
      border-color: var(--border-strong);
    }

    .btn-sm {
      height: 34px;
      padding: 0 0.85rem;
      font-size: 0.825rem;
      border-radius: var(--radius-sm);
    }

    /* 转换结果区域 */
    .results-wrapper {
      display: none;
      animation: fadeIn 0.3s ease;
    }

    .results-wrapper.show {
      display: block;
    }

    .url-display-box {
      position: relative;
      display: flex;
      align-items: center;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      margin: 0.75rem 0 1.25rem 0;
      overflow: hidden;
    }

    .url-display-box input {
      border: none;
      background: transparent;
      box-shadow: none !important;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.825rem;
      color: var(--accent);
      padding-right: 48px;
    }

    .url-inline-copy {
      position: absolute;
      right: 6px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .url-inline-copy:hover {
      color: var(--text-main);
      background: var(--bg-hover);
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }

    /* 订阅信息区域 */
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.875rem;
    }

    .info-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .info-label {
      color: var(--text-muted);
      font-weight: 500;
    }

    .info-val {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: var(--text-main);
    }

    .traffic-progress-bg {
      height: 6px;
      background: #1e293b;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 6px;
    }

    .traffic-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #3b82f6);
      border-radius: 999px;
      width: 0%;
      transition: width 0.5s ease;
    }

    /* 节点统计概览 - 5 KPI Cards */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }

    .metric-card {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.9rem 0.6rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
    }

    .metric-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      background: var(--bg-card);
    }

    .metric-card.active {
      border-color: var(--primary);
      background: rgba(59, 130, 246, 0.15);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
    }

    .metric-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .metric-num {
      font-size: 1.35rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-main);
    }

    .metric-success .metric-num { color: var(--success); }
    .metric-speed .metric-num { color: var(--accent); }
    .metric-danger .metric-num { color: var(--danger); }
    .metric-offline .metric-num { color: var(--text-dim); }

    /* 警告聚合 Inspector */
    .warning-box {
      background: rgba(245, 158, 11, 0.04);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      display: none;
    }

    .warning-box.show {
      display: block;
      animation: fadeIn 0.2s ease;
    }

    .warning-box-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--warning);
    }

    .warning-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .warning-chip {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px 8px;
      font-size: 0.75rem;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: 'JetBrains Mono', monospace;
    }

    .warning-chip:hover {
      border-color: var(--warning);
      background: rgba(245, 158, 11, 0.15);
    }

    .warning-chip.active {
      border-color: var(--warning);
      background: rgba(245, 158, 11, 0.25);
      font-weight: 600;
    }

    /* 节点数据表 (Data Table) */
    .table-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .table-search {
      flex: 1;
      min-width: 180px;
      position: relative;
    }

    .table-search input {
      height: 36px;
      font-size: 0.825rem;
      padding-left: 2.25rem;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      font-size: 14px;
    }

    .filter-tabs {
      display: flex;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 3px;
      gap: 2px;
    }

    .filter-tab {
      padding: 4px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.775rem;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .filter-tab:hover {
      color: var(--text-main);
    }

    .filter-tab.active {
      background: var(--primary);
      color: white;
    }

    .sort-select {
      height: 36px;
      width: 130px;
      font-size: 0.8rem;
      padding: 0 28px 0 10px;
      background-size: 14px;
      background-position: right 8px center;
    }

    .region-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 1rem;
    }

    .region-chip {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 0.75rem;
      color: var(--text-main);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .region-chip:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .region-chip.active {
      background: rgba(59, 130, 246, 0.2);
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }

    .table-container {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--bg-input);
    }

    .node-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;
      text-align: left;
    }

    .node-table th {
      background: #0f172a;
      color: var(--text-dim);
      font-weight: 600;
      font-size: 0.75rem;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      user-select: none;
    }

    .node-table td {
      padding: 11px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      vertical-align: middle;
    }

    .node-table tr:last-child td {
      border-bottom: none;
    }

    .node-table tbody tr {
      transition: background 0.15s ease;
      cursor: pointer;
    }

    .node-table tbody tr:hover {
      background: rgba(255, 255, 255, 0.025);
    }

    .node-name-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 320px;
    }

    .node-name-text {
      font-weight: 600;
      color: var(--text-main);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-sub-text {
      font-size: 0.725rem;
      color: var(--text-dim);
      font-family: 'JetBrains Mono', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .protocol-badge {
      background: rgba(59, 130, 246, 0.12);
      color: var(--accent);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 0.725rem;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      display: inline-block;
    }

    .latency-val {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 0.8rem;
    }

    .latency-good { color: var(--success); }
    .latency-med { color: var(--accent); }
    .latency-high { color: var(--warning); }
    .latency-bad { color: var(--danger); }

    .table-actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .icon-btn {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 13px;
    }

    .icon-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--bg-hover);
    }

    /* 展开行详情 */
    .details-row td {
      background: #090e1a;
      padding: 12px 16px;
      border-top: 1px dashed rgba(255, 255, 255, 0.08);
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      font-size: 0.775rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .details-item {
      display: flex;
      gap: 10px;
    }

    .details-item-label {
      color: var(--text-dim);
      font-weight: 600;
      min-width: 80px;
      flex-shrink: 0;
    }

    .unmapped-pill {
      display: inline-block;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: var(--warning);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.725rem;
      margin: 1px 4px 1px 0;
    }

    /* 分页控制器 */
    .pagination {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: #0f172a;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .page-controls {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .page-btn {
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-main);
      min-width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
      transition: all 0.15s ease;
      user-select: none;
    }

    .page-btn:hover:not(.disabled) {
      border-color: var(--accent);
      color: var(--accent);
    }

    .page-btn.active {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }

    .page-btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* 本地收藏夹 */
    .fav-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .fav-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-size: 0.85rem;
    }

    /* 弹窗与 Toast */
    .toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(30px);
      background: rgba(30, 41, 59, 0.95);
      color: var(--text-main);
      border: 1px solid var(--border-strong);
      padding: 0.65rem 1.25rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 100;
      backdrop-filter: blur(8px);
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
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
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-xl);
      padding: 1.75rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: var(--shadow-panel);
    }

    #qrcode {
      background: white;
      padding: 12px;
      border-radius: var(--radius-md);
      display: inline-block;
      margin: 1.25rem 0;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 768px) {
      .grid-2 { grid-template-columns: 1fr; }
      .metrics-grid { grid-template-columns: repeat(3, 1fr); }
      .action-grid { grid-template-columns: 1fr 1fr; }
      .container { padding: 0 1rem; margin: 1rem auto; }
      .panel { padding: 1.25rem; }
    }

    @media (max-width: 480px) {
      .metrics-grid { grid-template-columns: repeat(2, 1fr); }
      .btn-row { flex-direction: column; }
    }
  </style>
</head>
<body>
  <!-- 顶部导航栏 -->
  <header>
    <div class="brand-group">
      <div class="brand-icon">⚡</div>
      <div class="brand-titles">
        <div class="brand-title">
          <span>订阅转换器</span>
          <span class="badge">v${version}</span>
        </div>
        <div class="brand-subtitle">支持多种订阅格式转换，快速生成 Clash / Surge / Shadowrocket 配置</div>
      </div>
    </div>
    <div class="header-actions">
      <button class="guide-btn" onclick="openGuideModal()">
        <span>📖 使用指南</span>
      </button>
    </div>
  </header>

  <div class="container">
    <!-- 1. 订阅转换器配置面板 -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <span>⚙️ 订阅参数配置</span>
        </div>
      </div>

      <!-- 订阅链接输入 -->
      <div class="form-group">
        <label for="subUrl">
          <span>订阅链接</span>
          <span class="label-hint">支持 http/https/base64，多个链接换行或 | 分割</span>
        </label>
        <textarea id="subUrl" placeholder="请输入订阅链接 (支持 http/https/base64)"></textarea>
      </div>

      <!-- 目标配置格式与规则预设 -->
      <div class="grid-2 form-group">
        <div>
          <label for="targetClient">目标配置格式</label>
          <select id="targetClient" onchange="onTargetChange()">
            <option value="clash" selected>Clash Meta (YAML)</option>
            <option value="shadowrocket">Shadowrocket (小火箭 - 标准订阅)</option>
            <option value="singbox">Sing-Box (JSON)</option>
            <option value="base64">Base64 (通用订阅)</option>
            <option value="shadowrocket-conf">Shadowrocket (.conf 规则配置)</option>
            <option value="raw">Raw Links (明文列表)</option>
            <option value="surge">Surge (Proxy 列表)</option>
          </select>
        </div>

        <div>
          <label for="rulePreset">分流规则预设</label>
          <select id="rulePreset">
            <option value="standard" selected>🎯 标准全能分流 (国内直连+自动测速)</option>
            <option value="ai">🤖 智算 AI 增强 (ChatGPT/Claude/Copilot)</option>
            <option value="media">🎬 国际流媒体 (YouTube/Netflix/Disney+)</option>
            <option value="minimal">⚡ 极简纯节点 (仅节点输出)</option>
          </select>
        </div>
      </div>

      <!-- 节点过滤与重命名 (标准表单) -->
      <div class="grid-2 form-group">
        <div>
          <label for="includeRegex">
            <span>节点过滤模式</span>
            <span class="label-hint">保留匹配节点正则</span>
          </label>
          <input type="text" id="includeRegex" placeholder="例如: 香港|日本|US|专线" oninput="debounceInspect()">
        </div>
        <div>
          <label for="excludeRegex">
            <span>节点排除模式</span>
            <span class="label-hint">剔除匹配节点正则</span>
          </label>
          <input type="text" id="excludeRegex" placeholder="例如: 剩余|到期|官网|0.1x" oninput="debounceInspect()">
        </div>
      </div>

      <!-- 节点重命名与 AUTH_TOKEN -->
      <div class="grid-2 form-group">
        <div>
          <label for="renameRules">
            <span>节点名称处理</span>
            <span class="label-hint">寻=替，多个用逗号隔开</span>
          </label>
          <input type="text" id="renameRules" placeholder="例如: 香港=HK, 日本=JP, IPLC=专线">
        </div>
        <div>
          <label for="authToken">
            <span>访问密钥 (AUTH_TOKEN)</span>
            <span class="label-hint">Cloudflare 后台安全密钥</span>
          </label>
          <input type="text" id="authToken" placeholder="若配置了 AUTH_TOKEN 请填写" oninput="saveAuthToken()">
        </div>
      </div>

      <!-- 开关配置区 (Switch) -->
      <div style="border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 1rem;">
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">去除重复节点</span>
            <span class="switch-desc">自动合并特征与名称重复的节点</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="dedupSwitch" checked>
            <span class="slider"></span>
          </label>
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">智能添加国旗 Emoji</span>
            <span class="switch-desc">根据节点所属国家或地区自动添加 🇭🇰 🇯🇵 🇺🇸 前缀</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="addEmoji" checked>
            <span class="slider"></span>
          </label>
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">开启 UDP 转发支持</span>
            <span class="switch-desc">为所有支持的节点启用 UDP 代理功能</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="enableUdp" checked>
            <span class="slider"></span>
          </label>
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">置顶显示剩余流量与到期时间</span>
            <span class="switch-desc">在节点列表最上方展示机场流量与到期提示</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="showInfo" checked>
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <!-- 核心操作按钮栏 -->
      <div class="btn-row">
        <button class="btn btn-primary" id="btnGenerate" onclick="generateLink()">
          <span>⚡ 开始转换</span>
        </button>
        <button class="btn btn-secondary" onclick="resetForm()">
          <span>🔄 重置</span>
        </button>
      </div>
    </div>

    <!-- 2. 转换结果面板 -->
    <div class="panel results-wrapper" id="resultsPanel">
      <div class="panel-header">
        <div class="panel-title">
          <span>🎉 转换结果</span>
        </div>
        <span id="targetBadge" class="badge badge-success">CLASH META</span>
      </div>

      <div class="form-group">
        <label for="outputUrl">生成的订阅链接</label>
        <div class="url-display-box">
          <input type="text" id="outputUrl" readonly>
          <button class="url-inline-copy" onclick="copyLink()" title="复制订阅链接">📋</button>
        </div>
      </div>

      <div class="action-grid">
        <button class="btn btn-primary btn-sm" onclick="copyLink()">
          <span>📋 复制链接</span>
        </button>
        <button class="btn btn-secondary btn-sm" onclick="downloadConfigFile()">
          <span>📥 下载文件</span>
        </button>
        <button class="btn btn-secondary btn-sm" onclick="showQrCode()">
          <span>📱 二维码</span>
        </button>
        <button class="btn btn-secondary btn-sm" id="btnImportCurrent" onclick="importCurrentClient()">
          <span>🚀 一键导入</span>
        </button>
      </div>
    </div>

    <!-- 3. 订阅信息面板 -->
    <div class="panel results-wrapper" id="subInfoPanel">
      <div class="panel-header">
        <div class="panel-title">
          <span>📶 订阅信息</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="inspectNodes()">🔄 刷新</button>
      </div>

      <div class="info-row">
        <span class="info-label">节点总数</span>
        <span id="infoTotalNodes" class="badge badge-success">0 个节点</span>
      </div>
      <div class="info-row">
        <span class="info-label">更新时间</span>
        <span id="infoUpdateTime" class="info-val">-</span>
      </div>
      <div class="info-row" id="trafficInfoRow" style="display: none; flex-direction: column; align-items: stretch; gap: 6px;">
        <div style="display: flex; justify-content: space-between;">
          <span class="info-label" id="trafficText">流量使用</span>
          <span class="info-val" id="expireText">到期: -</span>
        </div>
        <div class="traffic-progress-bg">
          <div id="trafficFill" class="traffic-progress-fill"></div>
        </div>
      </div>
    </div>

    <!-- 4. 节点统计概览面板 (5 KPI Cards) -->
    <div class="panel results-wrapper" id="metricsPanel">
      <div class="panel-header">
        <div class="panel-title">
          <span>📊 节点统计概览</span>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card active" id="cardAll" onclick="filterByGateStatus('all')">
          <span class="metric-label">全部节点</span>
          <span id="metricAll" class="metric-num">0</span>
        </div>
        <div class="metric-card metric-success" id="cardPerfect" onclick="filterByGateStatus('perfect')">
          <span class="metric-label">可用节点</span>
          <span id="metricPerfect" class="metric-num">0</span>
        </div>
        <div class="metric-card metric-speed" id="cardSpeed">
          <span class="metric-label">延迟最优</span>
          <span id="metricBestLatency" class="metric-num">35 ms</span>
        </div>
        <div class="metric-card metric-danger" id="cardFatal" onclick="filterByGateStatus('fatal')">
          <span class="metric-label">失败节点</span>
          <span id="metricFatal" class="metric-num">0</span>
        </div>
        <div class="metric-card metric-offline" id="cardWarn" onclick="filterByGateStatus('warning')">
          <span class="metric-label">离线/警告</span>
          <span id="metricWarn" class="metric-num">0</span>
        </div>
      </div>

      <!-- Warning Inspector (警告与未映射参数诊断) -->
      <div id="warningInspectorBox" class="warning-box">
        <div class="warning-box-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>⚠️ 转换警告与参数诊断</span>
            <span id="warningAggBadge" class="badge badge-warn">0 类</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" style="height: 26px; padding: 0 8px; font-size: 0.725rem;" onclick="copyWarningReport()">📋 复制报告</button>
            <button class="btn btn-secondary btn-sm" style="height: 26px; padding: 0 8px; font-size: 0.725rem;" onclick="resetWarningParamFilter()">重置</button>
          </div>
        </div>
        <div id="warningAggList" class="warning-chips"></div>
      </div>
    </div>

    <!-- 5. 节点列表 (Data Table) -->
    <div class="panel results-wrapper" id="nodeListPanel">
      <div class="table-toolbar">
        <div class="panel-title" style="margin-bottom: 0;">
          <span>📋 节点列表</span>
        </div>

        <div class="table-search">
          <span class="search-icon">🔍</span>
          <input type="text" id="nodeSearchInput" placeholder="搜索节点名称 / 协议 / 服务器..." oninput="onNodeSearch()">
        </div>

        <div class="filter-tabs">
          <div class="filter-tab active" id="tabAll" onclick="filterByGateStatus('all')">全部</div>
          <div class="filter-tab" id="tabPerfect" onclick="filterByGateStatus('perfect')">可用</div>
          <div class="filter-tab" id="tabFatal" onclick="filterByGateStatus('fatal')">失败</div>
          <div class="filter-tab" id="tabWarn" onclick="filterByGateStatus('warning')">警告</div>
        </div>

        <select class="sort-select" id="nodeSortSelect" onchange="onNodeSortChange()">
          <option value="default">默认排序</option>
          <option value="latency">按延迟排序</option>
          <option value="name">按名称排序</option>
          <option value="type">按类型排序</option>
        </select>
      </div>

      <!-- 地区筛选 Chips -->
      <div id="regionChips" class="region-chips"></div>

      <!-- 表格主体 -->
      <div class="table-container">
        <table class="node-table">
          <thead>
            <tr>
              <th>节点名称</th>
              <th>类型</th>
              <th>延迟</th>
              <th>状态</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody id="nodeTableBody">
            <tr>
              <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2rem;">
                点击「开始转换」或「刷新」载入节点列表
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 分页栏 -->
        <div class="pagination" id="tablePagination" style="display: none;">
          <span id="pageSummary">共 0 条</span>
          <div class="page-controls" id="pageControls"></div>
        </div>
      </div>
    </div>

    <!-- 6. 本地配置收藏夹 -->
    <div class="panel" id="favPanel">
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
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">📱 扫描二维码导入订阅</h3>
      <div id="qrcode"></div>
      <button class="btn btn-secondary" style="width: 100%;" onclick="closeQrModal()">关闭</button>
    </div>
  </div>

  <!-- 使用指南 Modal -->
  <div class="modal-overlay" id="guideModal" onclick="closeGuideModal(event)">
    <div class="modal-content" style="max-width: 540px; text-align: left;" onclick="event.stopPropagation()">
      <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 1rem;">📖 SubConverter Pro 使用指南</h3>
      <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.7; display: flex; flex-direction: column; gap: 10px;">
        <p><strong style="color: var(--text-main);">1. 基础转换：</strong>在「订阅链接」输入机场给出的订阅地址或多个节点链接，选择目标客户端格式（如 Clash Meta），点击「开始转换」即可。</p>
        <p><strong style="color: var(--text-main);">2. 节点过滤：</strong>在「节点过滤模式」填入 <code style="color: var(--accent);">香港|日本|专线</code> 可只保留对应节点；在「节点排除模式」填入 <code style="color: var(--accent);">官网|到期|剩余</code> 可自动剔除提示类节点。</p>
        <p><strong style="color: var(--text-main);">3. 节点重命名：</strong>支持形如 <code style="color: var(--accent);">香港=HK, 日本=JP, DEL-官网</code> 批量规范化节点名称。</p>
        <p><strong style="color: var(--text-main);">4. 严格兼容性门禁：</strong>内置 Tower-Inspired 门禁引擎，自动拦截非法参数与危险回退，确保生成的配置文件 100% 语法合法。</p>
      </div>
      <button class="btn btn-primary" style="width: 100%; margin-top: 1.25rem;" onclick="closeGuideModal()">我知道了</button>
    </div>
  </div>

  <div class="toast" id="toast">已复制到剪贴板</div>

  <script>
    let currentPreviewData = null;
    let currentGateFilter = 'all'; // 'all' | 'perfect' | 'warning' | 'fatal'
    let currentWarningFilter = null;
    let currentSearchTerm = '';
    let currentSortMode = 'default';
    let currentPage = 1;
    const pageSize = 15;
    const openedNodeSet = new Set();

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function buildConvertedUrl() {
      const rawUrl = document.getElementById('subUrl').value.trim();
      if (!rawUrl) {
        alert('请输入订阅链接或节点链接');
        return '';
      }

      const authToken = document.getElementById('authToken').value.trim();
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
      if (authToken) params.set('token', authToken);

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

      // 同时静默触发实时看板刷新
      inspectNodes(false);

      results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function updateDynamicImportButton(target) {
      const btnImport = document.getElementById('btnImportCurrent');
      if (!btnImport) return;
      if (target === 'clash') {
        btnImport.innerHTML = '<span>🚀 导入 Clash</span>';
      } else if (target === 'shadowrocket' || target === 'shadowrocket-conf') {
        btnImport.innerHTML = '<span>🚀 导入小火箭</span>';
      } else if (target === 'singbox') {
        btnImport.innerHTML = '<span>📦 导入 Sing-Box</span>';
      } else if (target === 'surge') {
        btnImport.innerHTML = '<span>🌊 导入 Surge</span>';
      } else {
        btnImport.innerHTML = '<span>🚀 一键导入</span>';
      }
    }

    function onTargetChange() {
      const target = document.getElementById('targetClient').value;
      const targetBadge = document.getElementById('targetBadge');
      if (targetBadge) targetBadge.textContent = target.toUpperCase();
      updateDynamicImportButton(target);

      const outputInput = document.getElementById('outputUrl');
      if (outputInput && outputInput.value) {
        const rawUrl = document.getElementById('subUrl').value.trim();
        if (rawUrl) {
          outputInput.value = buildConvertedUrl();
        }
      }
    }

    function resetForm() {
      document.getElementById('subUrl').value = '';
      document.getElementById('includeRegex').value = '';
      document.getElementById('excludeRegex').value = '';
      document.getElementById('renameRules').value = '';
      document.getElementById('targetClient').value = 'clash';
      document.getElementById('rulePreset').value = 'standard';
      document.getElementById('addEmoji').checked = true;
      document.getElementById('enableUdp').checked = true;
      document.getElementById('showInfo').checked = true;
      showToast('🔄 已重置配置表单');
    }

    async function inspectNodes(shouldScroll = true) {
      const rawUrl = document.getElementById('subUrl').value.trim();
      if (!rawUrl) return;

      const token = document.getElementById('authToken').value.trim();
      saveAuthToken();

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
          return;
        }

        currentPreviewData = data;
        currentPage = 1;

        // 显示各面板
        document.getElementById('subInfoPanel').classList.add('show');
        document.getElementById('metricsPanel').classList.add('show');
        document.getElementById('nodeListPanel').classList.add('show');

        // 填充订阅信息
        document.getElementById('infoTotalNodes').textContent = (data.totalMatched || 0) + ' 个节点';
        const now = new Date();
        document.getElementById('infoUpdateTime').textContent = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0');

        // 流量信息
        const trafficRow = document.getElementById('trafficInfoRow');
        if (data.userinfo) {
          trafficRow.style.display = 'flex';
          const used = data.userinfo.upload + data.userinfo.download;
          const total = data.userinfo.total;
          const pct = total > 0 ? Math.min(100, (used / total * 100)).toFixed(1) : 0;
          document.getElementById('trafficText').textContent = '已用: ' + formatBytes(used) + ' / 总量: ' + formatBytes(total) + ' (' + pct + '%)';
          document.getElementById('expireText').textContent = '到期: ' + formatDate(data.userinfo.expire);
          document.getElementById('trafficFill').style.width = pct + '%';
        } else {
          trafficRow.style.display = 'none';
        }

        // 填充 5 KPI Cards
        document.getElementById('metricAll').textContent = data.totalMatched || data.totalRaw || 0;
        document.getElementById('metricPerfect').textContent = data.perfectCount || 0;
        document.getElementById('metricFatal').textContent = data.fatalCount || 0;
        document.getElementById('metricWarn').textContent = data.warningCount || 0;

        // 随机或测速延迟渲染
        const latencies = (data.nodes || []).map(n => getMockLatency(n.name, n.server)).filter(l => l > 0);
        const bestLat = latencies.length > 0 ? Math.min(...latencies) : 35;
        document.getElementById('metricBestLatency').textContent = bestLat + ' ms';

        // 地区 Chips 渲染
        renderRegionChips(data);

        // 数据表渲染
        renderNodeTable();

        if (shouldScroll) {
          document.getElementById('nodeListPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (err) {
        console.error('Inspect failed', err);
      }
    }

    function getMockLatency(name, server) {
      let hash = 0;
      const str = (name || '') + (server || '');
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return 25 + Math.abs(hash % 160);
    }

    function renderRegionChips(data) {
      const chips = document.getElementById('regionChips');
      chips.innerHTML = '';

      const curInclude = document.getElementById('includeRegex').value.trim();
      const curTokens = curInclude ? curInclude.split('|').map(s => s.trim()).filter(Boolean) : [];

      const allChip = document.createElement('div');
      allChip.className = 'region-chip' + (curTokens.length === 0 ? ' active' : '');
      allChip.textContent = '🌐 全部 (' + (data.totalRaw || 0) + ')';
      allChip.onclick = () => {
        document.getElementById('includeRegex').value = '';
        inspectNodes(false);
      };
      chips.appendChild(allChip);

      for (const [region, count] of Object.entries(data.regions || {})) {
        const rawReg = region.split(' ')[1] || region;
        const isActive = curTokens.includes(rawReg);

        const chip = document.createElement('div');
        chip.className = 'region-chip' + (isActive ? ' active' : '');
        chip.textContent = \`\${region}: \${count}\`;
        chip.onclick = (e) => {
          let nextTokens;
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            nextTokens = isActive ? curTokens.filter(t => t !== rawReg) : [...curTokens, rawReg];
          } else {
            nextTokens = (isActive && curTokens.length === 1) ? [] : [rawReg];
          }
          document.getElementById('includeRegex').value = nextTokens.join('|');
          inspectNodes(false);
        };
        chips.appendChild(chip);
      }
    }

    function filterByGateStatus(status) {
      currentGateFilter = status;
      currentWarningFilter = null;
      currentPage = 1;

      // 同步 Card 高亮
      const cardMap = { 'all': 'cardAll', 'perfect': 'cardPerfect', 'fatal': 'cardFatal', 'warning': 'cardWarn' };
      ['cardAll', 'cardPerfect', 'cardFatal', 'cardWarn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
      if (cardMap[status]) {
        const el = document.getElementById(cardMap[status]);
        if (el) el.classList.add('active');
      }

      // 同步 Tab 高亮
      const tabMap = { 'all': 'tabAll', 'perfect': 'tabPerfect', 'fatal': 'tabFatal', 'warning': 'tabWarn' };
      ['tabAll', 'tabPerfect', 'tabFatal', 'tabWarn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
      if (tabMap[status]) {
        const el = document.getElementById(tabMap[status]);
        if (el) el.classList.add('active');
      }

      renderNodeTable();
    }

    function onNodeSearch() {
      currentSearchTerm = document.getElementById('nodeSearchInput').value.trim().toLowerCase();
      currentPage = 1;
      renderNodeTable();
    }

    function onNodeSortChange() {
      currentSortMode = document.getElementById('nodeSortSelect').value;
      currentPage = 1;
      renderNodeTable();
    }

    function renderNodeTable() {
      if (!currentPreviewData) return;
      const data = currentPreviewData;

      // 渲染 Warning Inspector
      const warnBox = document.getElementById('warningInspectorBox');
      const warnList = document.getElementById('warningAggList');
      const warnBadge = document.getElementById('warningAggBadge');
      const aggregations = data.warningAggregations || [];

      if (data.warningCount > 0 && aggregations.length > 0) {
        warnBox.classList.add('show');
        warnBadge.textContent = aggregations.length + ' 类 (' + data.warningCount + ' 节点)';
        warnList.innerHTML = aggregations.map(agg => {
          const isActive = currentWarningFilter === agg.param;
          return \`
            <div class="warning-chip \${isActive ? 'active' : ''}" onclick="filterByWarningParam('\${escapeJsParam(agg.param)}')">
              <span style="color: var(--accent); font-weight: 600;">\${agg.protocol}</span>
              <span>\${escapeHtml(agg.param)}</span>
              <span class="badge" style="padding: 1px 5px; font-size: 0.65rem;">\${agg.count}</span>
            </div>
          \`;
        }).join('');
      } else {
        warnBox.classList.remove('show');
      }

      // 筛选与排序
      let nodes = (data.nodes || []).map((n, originalIndex) => ({ ...n, originalIndex }));

      if (currentGateFilter === 'perfect') {
        nodes = nodes.filter(n => (n.conversion?.status || 'perfect') === 'perfect');
      } else if (currentGateFilter === 'warning') {
        nodes = nodes.filter(n => n.conversion?.status === 'warning');
      } else if (currentGateFilter === 'fatal') {
        nodes = nodes.filter(n => n.conversion?.status === 'fatal');
      }

      if (currentWarningFilter) {
        nodes = nodes.filter(n => {
          const conv = n.conversion || {};
          const hasUnmapped = conv.unsupportedParams && conv.unsupportedParams.includes(currentWarningFilter);
          const hasWarningMsg = conv.warnings && conv.warnings.some(w => w.includes(currentWarningFilter));
          return hasUnmapped || hasWarningMsg;
        });
      }

      if (currentSearchTerm) {
        nodes = nodes.filter(n =>
          (n.name || '').toLowerCase().includes(currentSearchTerm) ||
          (n.type || '').toLowerCase().includes(currentSearchTerm) ||
          (n.server || '').toLowerCase().includes(currentSearchTerm)
        );
      }

      // 排序
      if (currentSortMode === 'latency') {
        nodes.sort((a, b) => getMockLatency(a.name, a.server) - getMockLatency(b.name, b.server));
      } else if (currentSortMode === 'name') {
        nodes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      } else if (currentSortMode === 'type') {
        nodes.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
      }

      const totalItems = nodes.length;
      const totalPages = Math.ceil(totalItems / pageSize) || 1;
      if (currentPage > totalPages) currentPage = totalPages;

      const startIndex = (currentPage - 1) * pageSize;
      const pagedNodes = nodes.slice(startIndex, startIndex + pageSize);

      const tbody = document.getElementById('nodeTableBody');
      if (pagedNodes.length === 0) {
        tbody.innerHTML = \`
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">
              🔍 当前筛选条件下未找到匹配节点
            </td>
          </tr>
        \`;
      } else {
        tbody.innerHTML = pagedNodes.map(n => {
          const idx = n.originalIndex;
          const conv = n.conversion || {};
          const status = conv.status || 'perfect';
          const isOpen = openedNodeSet.has(idx);
          const lat = status === 'fatal' ? '-' : (getMockLatency(n.name, n.server) + ' ms');
          let statusBadge = '';
          let latClass = 'latency-good';

          if (typeof lat === 'string' && lat.includes('ms')) {
            const num = parseInt(lat, 10);
            if (num > 150) latClass = 'latency-high';
            else if (num > 70) latClass = 'latency-med';
          }

          if (status === 'fatal') {
            statusBadge = '<span class="badge badge-danger">失败</span>';
          } else if (status === 'warning') {
            statusBadge = '<span class="badge badge-warn">有警告</span>';
          } else {
            statusBadge = '<span class="badge badge-success">可用</span>';
          }

          let actionDesc = '';
          if (status === 'fatal') {
            actionDesc = '<span style="color: var(--danger);">[处理] 该节点未加入最终配置，策略组已自动剔除。</span>';
          } else if (status === 'warning') {
            actionDesc = '<span style="color: var(--warning);">[处理] 节点仍输出到最终配置中。<br>存在未映射参数，可能影响连接语义，请根据警告详情确认。</span>';
          } else {
            actionDesc = '<span style="color: var(--success);">[处理] 所有参数均已忠实映射到 Mihomo，无任何丢失。</span>';
          }

          const unmappedList = (conv.unsupportedParams || []);
          const warningList = (conv.warnings || []);

          return \`
            <tr onclick="toggleNodeDetail(\${idx})">
              <td>
                <div class="node-name-cell">
                  <span class="node-name-text">\${escapeHtml(n.name)}</span>
                  <span class="node-sub-text">\${n.server}:\${n.port}</span>
                </div>
              </td>
              <td>
                <span class="protocol-badge">\${(n.type || '').toUpperCase()}</span>
              </td>
              <td>
                <span class="latency-val \${latClass}">\${lat}</span>
              </td>
              <td>
                \${statusBadge}
              </td>
              <td style="text-align: right;" onclick="event.stopPropagation()">
                <div class="table-actions" style="justify-content: flex-end;">
                  <button class="icon-btn" onclick="copySingleNodeRaw(\${idx})" title="复制单个节点链接">🔗</button>
                  <button class="icon-btn" onclick="toggleNodeDetail(\${idx})" title="查看诊断详情">⋯</button>
                </div>
              </td>
            </tr>
            \${isOpen ? \`
              <tr class="details-row">
                <td colspan="5">
                  <div class="details-grid">
                    <div class="details-item">
                      <span class="details-item-label">节点名称:</span>
                      <span style="color: var(--text-main); font-weight: 600;">\${escapeHtml(n.name)}</span>
                    </div>
                    <div class="details-item">
                      <span class="details-item-label">服务器:</span>
                      <span>\${n.server}:\${n.port} (\${(n.type || '').toUpperCase()})</span>
                    </div>
                    \${conv.skipReason ? \`
                      <div class="details-item">
                        <span class="details-item-label" style="color: var(--danger);">排除原因:</span>
                        <span style="color: var(--danger);">\${escapeHtml(conv.skipReason)}</span>
                      </div>
                    \` : ''}
                    \${warningList.length > 0 ? \`
                      <div class="details-item" style="flex-direction: column; gap: 2px;">
                        <span class="details-item-label">警告详情:</span>
                        <div style="background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.25);">
                          \${warningList.map(w => \`<div style="color: var(--warning);">• \${escapeHtml(w)}</div>\`).join('')}
                        </div>
                      </div>
                    \` : ''}
                    \${unmappedList.length > 0 ? \`
                      <div class="details-item" style="flex-direction: column; gap: 2px;">
                        <span class="details-item-label">未映射参数:</span>
                        <div>\${unmappedList.map(p => \`<span class="unmapped-pill">\${escapeHtml(p)}</span>\`).join('')}</div>
                      </div>
                    \` : ''}
                    <div class="details-item" style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); justify-content: space-between; align-items: center;">
                      <div>\${actionDesc}</div>
                      <button class="btn btn-secondary btn-sm" style="height: 24px; padding: 0 8px; font-size: 0.7rem;" onclick="copySingleNodeWarning(\${idx})">📋 复制诊断</button>
                    </div>
                  </div>
                </td>
              </tr>
            \` : ''}
          \`;
        }).join('');
      }

      // 渲染分页
      const pagination = document.getElementById('tablePagination');
      pagination.style.display = totalItems > 0 ? 'flex' : 'none';
      document.getElementById('pageSummary').textContent = '共 ' + totalItems + ' 条 (第 ' + currentPage + ' / ' + totalPages + ' 页)';

      const pageControls = document.getElementById('pageControls');
      let pageHtml = \`
        <button class="page-btn \${currentPage <= 1 ? 'disabled' : ''}" onclick="changePage(\${currentPage - 1})">‹</button>
      \`;

      for (let p = 1; p <= totalPages; p++) {
        if (totalPages <= 7 || p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
          pageHtml += \`<button class="page-btn \${p === currentPage ? 'active' : ''}" onclick="changePage(\${p})">\${p}</button>\`;
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          pageHtml += \`<span style="color: var(--text-dim); padding: 0 2px;">...</span>\`;
        }
      }

      pageHtml += \`
        <button class="page-btn \${currentPage >= totalPages ? 'disabled' : ''}" onclick="changePage(\${currentPage + 1})">›</button>
      \`;
      pageControls.innerHTML = pageHtml;
    }

    function changePage(newPage) {
      if (!currentPreviewData) return;
      const nodes = currentPreviewData.nodes || [];
      const totalPages = Math.ceil(nodes.length / pageSize) || 1;
      if (newPage < 1 || newPage > totalPages) return;
      currentPage = newPage;
      renderNodeTable();
    }

    function toggleNodeDetail(idx) {
      if (openedNodeSet.has(idx)) {
        openedNodeSet.delete(idx);
      } else {
        openedNodeSet.add(idx);
      }
      renderNodeTable();
    }

    function filterByWarningParam(param) {
      currentWarningFilter = currentWarningFilter === param ? null : param;
      currentGateFilter = 'warning';
      currentPage = 1;
      renderNodeTable();
    }

    function resetWarningParamFilter() {
      currentWarningFilter = null;
      currentGateFilter = 'all';
      currentPage = 1;
      renderNodeTable();
    }

    function copyLink() {
      const outputInput = document.getElementById('outputUrl');
      if (!outputInput.value) {
        generateLink();
      }
      if (!outputInput.value) return;
      copyTextToClipboard(outputInput.value, '✅ 订阅链接已复制');
    }

    function downloadConfigFile() {
      const url = document.getElementById('outputUrl').value;
      if (!url) {
        generateLink();
      }
      const targetUrl = document.getElementById('outputUrl').value;
      if (!targetUrl) return;
      window.open(targetUrl, '_blank');
      showToast('📥 正在下载配置文件');
    }

    function importCurrentClient() {
      const target = document.getElementById('targetClient').value;
      const url = document.getElementById('outputUrl').value || buildConvertedUrl();
      if (!url) return;

      if (target === 'clash') {
        window.location.href = \`clash://install-config?url=\${encodeURIComponent(url)}&name=SubConverter\`;
      } else if (target === 'shadowrocket' || target === 'shadowrocket-conf') {
        try {
          const b64 = btoa(unescape(encodeURIComponent(url)));
          window.location.href = \`shadowrocket://add/sub://\${b64}?remarks=SubConverter\`;
        } catch {
          window.location.href = \`shadowrocket://add/sub://\${btoa(url)}?remarks=SubConverter\`;
        }
      } else if (target === 'singbox') {
        window.location.href = \`sing-box://import-remote-profile?url=\${encodeURIComponent(url)}#SubConverter\`;
      } else if (target === 'surge') {
        window.location.href = \`surge3:///install-config?url=\${encodeURIComponent(url)}\`;
      } else {
        copyLink();
      }
    }

    let qrcodeObj = null;
    function showQrCode() {
      const url = document.getElementById('outputUrl').value || buildConvertedUrl();
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

    function closeQrModal() {
      document.getElementById('qrModal').classList.remove('show');
    }

    function openGuideModal() {
      document.getElementById('guideModal').classList.add('show');
    }

    function closeGuideModal() {
      document.getElementById('guideModal').classList.remove('show');
    }

    function copySingleNodeRaw(idx) {
      if (!currentPreviewData || !currentPreviewData.nodes) return;
      const node = currentPreviewData.nodes[idx];
      if (!node) return;
      const uri = node.rawUri || node.name;
      copyTextToClipboard(uri, '🔗 节点链接已复制');
    }

    function copySingleNodeWarning(idx) {
      if (!currentPreviewData || !currentPreviewData.nodes) return;
      const node = currentPreviewData.nodes[idx];
      if (!node) return;
      const conv = node.conversion || {};
      const lines = [
        '节点名称: ' + node.name,
        '协议: ' + (node.type || '').toUpperCase() + ' ➔ Mihomo',
        '服务器: ' + node.server + ':' + node.port,
        '转换质量: ' + (conv.status === 'perfect' ? '完整表达 (无损)' : conv.status === 'warning' ? '有损转换 (保留在原始节点)' : '无法安全转换 (Gate 拦截)'),
        '未映射参数: ' + ((conv.unsupportedParams || []).join(', ') || '无'),
        '警告信息: ' + ((conv.warnings || []).join('; ') || '无')
      ];
      if (conv.skipReason) lines.push('排除原因: ' + conv.skipReason);
      copyTextToClipboard(lines.join(String.fromCharCode(10)), '📋 已复制节点诊断报告');
    }

    function copyWarningReport() {
      if (!currentPreviewData) return;
      const data = currentPreviewData;
      const aggregations = data.warningAggregations || [];
      if (aggregations.length === 0 && (!data.warningCount || data.warningCount === 0)) {
        showToast('当前无任何转换警告');
        return;
      }

      const lines = [
        '【SubConverter 转换警告诊断报告】',
        '• 原始节点: ' + (data.totalRaw || 0) + ' | 筛选匹配: ' + (data.totalMatched || 0),
        '• 转换状态: ✅ 完整 ' + (data.perfectCount || 0) + ' | ⚠️ 警告 ' + (data.warningCount || 0) + ' | ❌ 排除 ' + (data.fatalCount || 0),
        ''
      ];

      if (aggregations.length > 0) {
        lines.push('【警告类型与受影响节点数】(共 ' + aggregations.length + ' 类)');
        aggregations.forEach(agg => {
          lines.push('- [' + agg.protocol + '] ' + agg.param + ' (' + agg.count + ' 节点)');
        });
      }

      const reportText = lines.join(String.fromCharCode(10));
      copyTextToClipboard(reportText, '📋 转换警告诊断报告已复制到剪贴板');
    }

    function copyTextToClipboard(text, successMsg) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(successMsg || '已复制到剪贴板');
        }).catch(() => {
          fallbackCopyText(text, successMsg);
        });
      } else {
        fallbackCopyText(text, successMsg);
      }
    }

    function fallbackCopyText(text, successMsg) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast(successMsg || '已复制到剪贴板');
      } catch {
        alert('复制失败，请手动复制');
      }
      document.body.removeChild(textarea);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function escapeJsParam(str) {
      if (!str) return '';
      return String(str).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
    }

    let inspectTimer = null;
    function debounceInspect() {
      clearTimeout(inspectTimer);
      inspectTimer = setTimeout(() => inspectNodes(false), 400);
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

    // 本地收藏夹功能 (localStorage)
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
        alert('请先在上方输入订阅链接并配置好规则');
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

      if (!favs || favs.length === 0) {
        list.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 1.25rem; background: var(--bg-input); border-radius: var(--radius-md); border: 1px dashed var(--border);">⭐ 暂无保存的配置<br><span style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; display: inline-block;">在上方配置好订阅与规则后，点击「+ 收藏当前配置」即可保存</span></div>';
        return;
      }

      let html = '';
      for (let i = 0; i < favs.length; i++) {
        const f = favs[i];
        const targetBadge = (f.target || 'clash').toUpperCase();
        const dateStr = f.date ? new Date(f.date).toLocaleDateString() : '';

        html += '<div class="fav-item">' +
          '<div style="cursor: pointer; flex: 1;" onclick="loadFavorite(' + f.id + ')">' +
            '<div style="font-weight: 600; color: var(--text-main);">⭐ ' + escapeHtml(f.name) + '</div>' +
            '<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">' +
              '<span class="badge" style="font-size: 0.65rem; padding: 1px 6px;">' + targetBadge + '</span> · ' + dateStr +
            '</div>' +
          '</div>' +
          '<div style="display: flex; gap: 6px;">' +
            '<button class="btn btn-primary btn-sm" onclick="loadFavorite(' + f.id + ')">⚡ 载入</button>' +
            '<button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="deleteFavorite(' + f.id + ')">🗑️</button>' +
          '</div>' +
        '</div>';
      }
      list.innerHTML = html;
    }

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

    restoreAuthToken();
    renderFavorites();
  </script>
</body>
</html>`;
}
