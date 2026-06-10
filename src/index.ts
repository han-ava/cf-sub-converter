// @ts-ignore
import packageJson from '../package.json';
import { Env, ProxyNode } from './types';
import { HTML_PAGE } from './constants';
import { parseContent } from './parser';
import { toSingBoxWithTemplate, toClashWithTemplate, toBase64 } from './generator';
import { deduplicateNodeNames } from './utils';

const version = packageJson.version || '2.5.0';

// 輔助載入與解析節點（不含流量統計，專供 API 使用）
async function loadNodes(urlParam: string): Promise<ProxyNode[]> {
  const inputs = urlParam.split(/[\n\r|]+/); 
  const allNodes: ProxyNode[] = [];

  await Promise.all(inputs.map(async (input) => { 
    const trimmed = input.trim(); 
    if (!trimmed) return;
    
    if (trimmed.startsWith('http')) { 
      try { 
        const separator = trimmed.includes('?') ? '&' : '?';
        const fetchUrl = `${trimmed}${separator}t=${Date.now()}`;
        
        const resp = await fetch(fetchUrl, { 
          headers: { 
            'User-Agent': 'v2rayNG/1.8.5',
            'Accept': '*/*'
          } 
        }); 
        
        if (resp.ok) { 
          const text = await resp.text(); 
          if (!text.trim().startsWith('<')) {
             try {
               const parsed = await parseContent(text);
               allNodes.push(...parsed);
             } catch(err) {}
          }
        }
      } catch (e) {} 
    } else { 
      try {
        const parsed = await parseContent(trimmed);
        allNodes.push(...parsed); 
      } catch(err) {}
    }
  }));
  return allNodes;
}

// 安全的 Base64 編碼，防止中文節點名解析錯誤
function safeBtoa(str: string): string {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } catch (e) {
    return btoa(str);
  }
}

// 生成一鍵部署 bash 腳本 (相容 VLESS 與 VMess)
function makeVpsScript(node: ProxyNode, port: string, token: string, domain: string): string {
  const nodeType = node.type; // 'vless' 或 'vmess'
  const vlessType = node.network || 'ws';
  const vlessPath = node.wsPath || '/';
  const safeNodeName = node.name.replace(/[^a-zA-Z0-9]/g, '_');
  
  return `#!/bin/bash
# Cloudflare Argo Tunnel 一鍵部署腳本 (由 cf-sub-converter 自動生成)
# 適用於已使用 mack-a v2ray-agent 部署之 Xray/Sing-box 環境

GREEN='\\033[0;32m'
RED='\\033[0;31m'
NC='\\033[0m'

echo -e "\${GREEN}=== 開始部署 Cloudflare Argo 隧道 (\${NODE_NAME}) ===\${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "\${RED}錯誤: 請使用 root 權限執行此腳本！\${NC}"
  exit 1
fi

NODE_TYPE="${nodeType}"
VLESS_UUID="${node.uuid || ''}"
VLESS_PATH="${vlessPath}"
VLESS_TYPE="${vlessType}"
VLESS_PORT="${port}"
NODE_NAME="${node.name}"
TUNNEL_TOKEN="${token.trim()}"
CUSTOM_DOMAIN="${domain.trim()}"

# 下載安裝 cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "正在下載安裝 cloudflared..."
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
else
    echo "cloudflared 已存在，跳過安裝。"
fi

if [ -n "$TUNNEL_TOKEN" ]; then
    echo -e "\${GREEN}【固定隧道模式】正在配置服務...\${NC}"
    cloudflared service uninstall &> /dev/null
    cloudflared service install "$TUNNEL_TOKEN"
    systemctl daemon-reload
    systemctl enable cloudflared
    systemctl restart cloudflared
    
    echo -e "\${GREEN}部署成功！\${NC}"
    echo "請確保已在 Cloudflare Dashboard 中將網域 '$CUSTOM_DOMAIN' 指向本地 'http://localhost:$VLESS_PORT'"
    
    if [ "\$NODE_TYPE" = "vless" ]; then
        FINAL_LINK="vless://\$VLESS_UUID@\$CUSTOM_DOMAIN:443?encryption=none&security=tls&type=\$VLESS_TYPE&host=\$CUSTOM_DOMAIN"
        if [ "\$VLESS_TYPE" = "ws" ]; then
            FINAL_LINK="\$FINAL_LINK&path=\$(echo -n "\$VLESS_PATH" | jq -s -R -r @uri 2>/dev/null || echo -n "$VLESS_PATH")"
        fi
        FINAL_LINK="\$FINAL_LINK#Argo-\$NODE_NAME"
    else
        VMESS_JSON="{\\"v\\":\\"2\\",\\"ps\\":\\"Argo-\$NODE_NAME\\",\\"add\\":\\"\$CUSTOM_DOMAIN\\",\\"port\\":443,\\"id\\":\\"\$VLESS_UUID\\",\\"aid\\":0,\\"scy\\":\\"auto\\",\\"net\\":\\"\$VLESS_TYPE\\",\\"type\\":\\"none\\",\\"host\\":\\"\$CUSTOM_DOMAIN\\",\\"path\\":\\"\$VLESS_PATH\\",\\"tls\\":\\"tls\\",\\"sni\\":\\"\$CUSTOM_DOMAIN\\"}"
        VMESS_B64=\$(echo -n "\$VMESS_JSON" | base64 | tr -d '\\n')
        FINAL_LINK="vmess://\$VMESS_B64"
    fi
    echo -e "\\n\${GREEN}您的 Argo \$NODE_TYPE 訂閱連結為:\${NC}"
    echo -e "\${GREEN}\$FINAL_LINK\${NC}\\n"
else
    echo -e "\${GREEN}【臨時隧道模式】正在啟動 Quick Tunnel...\${NC}"
    systemctl stop cloudflared-argo-\${safeNodeName} &> /dev/null
    
    cat <<EOF > /etc/systemd/system/cloudflared-argo-\${safeNodeName}.service
[Unit]
Description=Cloudflare Argo Temporary Tunnel for \${NODE_NAME}
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:\$VLESS_PORT
Restart=always
RestartSec=5
StandardOutput=file:/var/log/cloudflared-argo-\${safeNodeName}.log
StandardError=file:/var/log/cloudflared-argo-\${safeNodeName}.log

[Install]
WantedBy=multi-user.target
EOF

    touch /var/log/cloudflared-argo-\${safeNodeName}.log
    systemctl daemon-reload
    systemctl enable cloudflared-argo-\${safeNodeName}
    systemctl start cloudflared-argo-\${safeNodeName}
    
    echo "正在等待 Cloudflare 分配臨時域名 (約需 10-15 秒)..."
    TEMP_DOMAIN=""
    for i in {1..15}; do
        sleep 1
        TEMP_DOMAIN=\$(grep -oE 'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com' /var/log/cloudflared-argo-\${safeNodeName}.log | head -n 1 | sed 's/https:\\/\\///')
        if [ -n "\$TEMP_DOMAIN" ]; then
            break
        fi
    done
    
    if [ -n "\$TEMP_DOMAIN" ]; then
        echo -e "\${GREEN}獲取域名成功: \$TEMP_DOMAIN\${NC}"
        if [ "\$NODE_TYPE" = "vless" ]; then
            FINAL_LINK="vless://\$VLESS_UUID@\$TEMP_DOMAIN:443?encryption=none&security=tls&type=\$VLESS_TYPE&host=\$TEMP_DOMAIN"
            if [ "\$VLESS_TYPE" = "ws" ]; then
                FINAL_LINK="\$FINAL_LINK&path=\$(echo -n "\$VLESS_PATH" | jq -s -R -r @uri 2>/dev/null || echo -n "\$VLESS_PATH")"
            fi
            FINAL_LINK="\$FINAL_LINK#Argo-Temp-\$NODE_NAME"
        else
            VMESS_JSON="{\\"v\\":\\"2\\",\\"ps\\":\\"Argo-Temp-\$NODE_NAME\\",\\"add\\":\\"\$TEMP_DOMAIN\\",\\"port\\":443,\\"id\\":\\"\$VLESS_UUID\\",\\"aid\\":0,\\"scy\\":\\"auto\\",\\"net\\":\\"\$VLESS_TYPE\\",\\"type\\":\\"none\\",\\"host\\":\\"\$TEMP_DOMAIN\\",\\"path\\":\\"\$VLESS_PATH\\",\\"tls\\":\\"tls\\",\\"sni\\":\\"\$TEMP_DOMAIN\\"}"
            VMESS_B64=\$(echo -n "\$VMESS_JSON" | base64 | tr -d '\\n')
            FINAL_LINK="vmess://\$VMESS_B64"
        fi
        
        echo -e "\\n\${GREEN}=== 部署成功 ===\${NC}"
        echo -e "原節點名稱: \$NODE_NAME"
        echo -e "轉發連接埠: \$VLESS_PORT"
        echo -e "您的臨時 Argo 節點 \$NODE_TYPE 連結為 (注意：VPS 重啟或重開服務後域名會刷新):"
        echo -e "\${GREEN}\$FINAL_LINK\${NC}\\n"
    else
        echo -e "\${RED}錯誤: 獲取臨時域名超時！請執行 'cat /var/log/cloudflared-argo-\${safeNodeName}.log' 檢查日誌。\${NC}"
    fi
fi
`;
}

export default {
async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
const url = new URL(request.url);

// 跨域預檢
if (request.method === 'OPTIONS') {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

// 💥 新增：GET /argo/sh/:id 路由 (供 VPS 執行 wget/curl 讀取一鍵腳本)
if (request.method === 'GET' && url.pathname.startsWith('/argo/sh/')) {
  const scriptId = url.pathname.split('/').pop();
  if (env.SUB_CACHE && scriptId) {
    const script = await env.SUB_CACHE.get(`script:${scriptId}`);
    if (script) {
      return new Response(script, {
        headers: { 
          'Content-Type': 'text/plain; charset=utf-8', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }
  }
  return new Response('# 錯誤: 該腳本不存在或已過期 (有效期 1 小時)，請在網頁上重新生成。\nexit 1\n', { 
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

// POST /api/parse-vless 
if (request.method === 'POST' && (url.pathname === '/api/parse-vless' || url.pathname === '/api/parse-argo')) {
  try {
    const body: any = await request.json();
    const rawUrl = body.url || '';
    if (!rawUrl.trim()) {
      return new Response(JSON.stringify({ error: '請輸入有效的節點內容' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    const allNodes = await loadNodes(rawUrl);
    const argoCompatibleNodes = allNodes.filter(n => n.type === 'vless' || n.type === 'vmess').map((n, idx) => ({
      index: idx,
      name: n.name,
      server: n.server,
      port: n.port,
      type: n.type
    }));

    return new Response(JSON.stringify(argoCompatibleNodes), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}

// POST /api/argo-generate (優化：返回對應節點與緩存腳本 ID)
if (request.method === 'POST' && url.pathname === '/api/argo-generate') {
  try {
    const body: any = await request.json();
    const rawUrl = body.url || '';
    const selectedIndices: number[] = body.indices || [];
    const port = body.port || '8080';
    const token = body.token || '';
    const domain = body.domain || '';

    if (!rawUrl.trim() || selectedIndices.length === 0) {
      return new Response(JSON.stringify({ error: '無效的參數或未選擇任何節點' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    const allNodes = await loadNodes(rawUrl);
    const compatibleNodes = allNodes.filter(n => n.type === 'vless' || n.type === 'vmess');
    const selectedObjects = selectedIndices.map(idx => compatibleNodes[idx]).filter(Boolean);

    if (selectedObjects.length === 0) {
      return new Response(JSON.stringify({ error: '選擇的節點不存在' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    let scripts = '';
    const generatedNodesData: any[] = [];

    for (let i = 0; i < selectedObjects.length; i++) {
      const node = selectedObjects[i];
      const originalIndex = selectedIndices[i];
      
      // 生成 VPS 安裝腳本
      scripts += makeVpsScript(node, port, token, domain) + '\n\n';

      // 判斷是否使用臨時域名，若無固定域名，則前端也插入一個明文佔位符節點
      const targetDomain = (token.trim() && domain.trim()) ? domain.trim() : "請在VPS執行一鍵安裝腳本獲取臨時域名.trycloudflare.com";
      const argoNodeName = (token.trim() && domain.trim()) ? `Argo-${node.name}` : `Argo-Temp-${node.name}`;

      let argoLink = '';
      if (node.type === 'vless') {
        argoLink = `vless://${node.uuid}@${targetDomain}:443?encryption=none&security=tls&type=${node.network || 'ws'}&host=${targetDomain}&path=${node.wsPath || '/'}#${encodeURIComponent(argoNodeName)}`;
      } else {
        const vmessObj = {
          v: "2", ps: argoNodeName, add: targetDomain, port: 443, id: node.uuid,
          aid: 0, scy: "auto", net: node.network || 'ws', type: "none",
          host: targetDomain, path: node.wsPath || '/', tls: "tls", sni: targetDomain
        };
        argoLink = 'vmess://' + safeBtoa(JSON.stringify(vmessObj));
      }

      generatedNodesData.push({ originalIndex, link: argoLink });
    }

    // 將 Bash 腳本存入 KV 中 (保留 1 小時 = 3600 秒)
    let scriptId = '';
    if (env.SUB_CACHE) {
      scriptId = crypto.randomUUID();
      await env.SUB_CACHE.put(`script:${scriptId}`, scripts, { expirationTtl: 3600 });
    }

    return new Response(JSON.stringify({ 
      scriptId: scriptId, 
      fullScript: scripts, // 萬一未綁定 KV 則作後備
      argoNodes: generatedNodesData 
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}

// 0. GET /version 
if (request.method === 'GET' && url.pathname === '/version') {
  return new Response(`subconverter v${version} ${url.host} backend\n`, {
    headers: { 
      'Content-Type': 'text/plain; charset=utf-8', 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    } 
  });
}

// 1. POST /save 
if (request.method === 'POST' && url.pathname === '/save') {
  try {
    const body: any = await request.json();
    if (!body.path || !body.content) return new Response('Missing path or content', { status: 400 });
    
    const saveData = {
      content: body.content,
      include: body.include || '',
      exclude: body.exclude || '',
      rename: body.rename || ''
    };
    await env.SUB_CACHE.put(body.path, JSON.stringify(saveData));
    
    const redirectUrl = `/?url=${encodeURIComponent(body.content)}&target=singbox&include=${encodeURIComponent(body.include || '')}&exclude=${encodeURIComponent(body.exclude || '')}&rename=${encodeURIComponent(body.rename || '')}`;
    return new Response(null, { 
      status: 302, 
      headers: { 'Location': redirectUrl } 
    });
  } catch (e) { return new Response('Error saving profile', { status: 500 }); }
}

// 2. KV 收藏 API
const FAVS_KEY = 'favorites';

async function getFavs(): Promise<any[]> {
  const data = await env.SUB_CACHE.get(FAVS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveFavs(favs: any[]): Promise<void> {
  await env.SUB_CACHE.put(FAVS_KEY, JSON.stringify(favs));
}

if (request.method === 'GET' && url.pathname === '/favs') {
  const favs = await getFavs();
  return new Response(JSON.stringify(favs), { 
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
  });
}

if (request.method === 'POST' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (!body.name || !body.url) return new Response('Missing name or url', { status: 400 });
    const favs = await getFavs();
    favs.push({ 
      name: body.name, 
      url: body.url, 
      include: body.include || '', 
      exclude: body.exclude || '',
      rename: body.rename || ''
    });
    await saveFavs(favs);
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error saving favorite', { status: 500 }); }
}

if (request.method === 'PUT' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (body.index === undefined || !body.name || !body.url) return new Response('Missing data', { status: 400 });
    const favs = await getFavs();
    if (body.index >= 0 && body.index < favs.length) {
      favs[body.index] = { 
        name: body.name, 
        url: body.url, 
        include: body.include || '', 
        exclude: body.exclude || '',
        rename: body.rename || ''
      };
      await saveFavs(favs);
    }
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error updating favorite', { status: 500 }); }
}

if (request.method === 'DELETE' && url.pathname === '/favs') {
  try {
    const body: any = await request.json();
    if (body.index === undefined) return new Response('Missing index', { status: 400 });
    const favs = await getFavs();
    if (body.index >= 0 && body.index < favs.length) {
      favs.splice(body.index, 1);
      await saveFavs(favs);
    }
    return new Response('OK', { status: 200 });
  } catch (e) { return new Response('Error deleting favorite', { status: 500 }); }
}

// 3. GET /path (讀取短連結或一般轉換)
let urlParam = url.searchParams.get('url') || '';
let includeParam = url.searchParams.get('include') || '';
let excludeParam = url.searchParams.get('exclude') || '';
let renameParam = url.searchParams.get('rename') || '';

const path = decodeURIComponent(url.pathname.slice(1)); 

if (path && path !== 'sub' && path !== 'favicon.ico' && path !== '') {
  const stored = await env.SUB_CACHE.get(path);
  if (stored) { 
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.content) {
        urlParam = parsed.content;
        if (!includeParam) includeParam = parsed.include || '';
        if (!excludeParam) excludeParam = parsed.exclude || '';
        if (!renameParam) renameParam = parsed.rename || '';
      }
    } catch (e) {
      urlParam = stored; 
    }
  }
}

if (!urlParam || urlParam.trim() === '') {
  if (path === 'sub') {
    return new Response('Error: Missing parameter "url"', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  const dynamicHtml = HTML_PAGE.replace('v2.5.0', `v${version}`);
  return new Response(dynamicHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// 4. 解析並下載 (支援流量資訊透傳與合併)
const inputs = urlParam.split(/[\n\r|]+/); 
const allNodes: ProxyNode[] = [];
const errors: string[] = [];

let totalUpload = 0;
let totalDownload = 0;
let totalTotal = 0;
let minExpire = 0;
let hasTrafficInfo = false;

await Promise.all(inputs.map(async (input) => { 
  const trimmed = input.trim(); 
  if (!trimmed) return;
  
  if (trimmed.startsWith('http')) { 
    try { 
      const separator = trimmed.includes('?') ? '&' : '?';
      const fetchUrl = `${trimmed}${separator}t=${Date.now()}`;
      
      const resp = await fetch(fetchUrl, { 
        headers: { 
          'User-Agent': 'v2rayNG/1.8.5',
          'Accept': '*/*'
        } 
      }); 
      
      if (resp.ok) { 
        const text = await resp.text(); 
        
        const userInfo = resp.headers.get('subscription-userinfo');
        if (userInfo) {
          hasTrafficInfo = true;
          const uploadMatch = userInfo.match(/upload=(\d+)/i);
          const downloadMatch = userInfo.match(/download=(\d+)/i);
          const totalMatch = userInfo.match(/total=(\d+)/i);
          const expireMatch = userInfo.match(/expire=(\d+)/i);

          totalUpload += uploadMatch ? parseInt(uploadMatch[1]) : 0;
          totalDownload += downloadMatch ? parseInt(downloadMatch[1]) : 0;
          totalTotal += totalMatch ? parseInt(totalMatch[1]) : 0;
          
          const expireVal = expireMatch ? parseInt(expireMatch[1]) : 0;
          if (expireVal > 0) {
            if (minExpire === 0 || expireVal < minExpire) {
              minExpire = expireVal; 
            }
          }
        }

        if (text.trim().startsWith('<')) {
           errors.push(`❌ [${trimmed}]\n失敗原因: 伺服器回傳了 HTML 網頁而不是訂閱代碼。`);
        } else {
           try {
             const parsed = await parseContent(text);
             allNodes.push(...parsed);
           } catch(err: any) {
             errors.push(`⚠️ [${trimmed}]\n失敗原因: ${err.message}\n內容預覽: ${text.substring(0, 100)}...`);
           }
        }
      } else {
        errors.push(`❌ [${trimmed}]\n失敗原因: HTTP 狀態碼 ${resp.status} ${resp.statusText}`);
      }
    } catch (e: any) {
      errors.push(`❌ [${trimmed}]\n連線錯誤: ${e.message}`);
    } 
  } else { 
    try {
      const parsed = await parseContent(trimmed);
      allNodes.push(...parsed); 
    } catch(err: any) {
      errors.push(`⚠️ [手動輸入內容]\n失敗原因: ${err.message}`);
    }
  }
}));

if (allNodes.length === 0) {
  const errorReport = `未解析到任何有效節點。\n\n🔍 詳細錯誤診斷報告：\n-------------------------\n${errors.join('\n\n-------------------------\n')}`;
  return new Response(errorReport, { 
    status: 400, 
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } 
  });
}

let filteredNodes = allNodes;

if (renameParam) {
  try {
    const rules = renameParam.split('|');
    for (const rule of rules) {
      const trimmedRule = rule.trim();
      if (!trimmedRule) continue;

      if (trimmedRule.startsWith('DEL-')) {
        const search = trimmedRule.substring(4); 
        if (search) {
          filteredNodes.forEach(node => {
            if (node.name) {
              node.name = node.name.split(search).join('');
            }
          });
        }
      } else if (trimmedRule.includes('-')) {
        const index = trimmedRule.indexOf('-');
        const search = trimmedRule.substring(0, index).trim();
        const replace = trimmedRule.substring(index + 1).trim();
        if (search && replace !== undefined) {
          filteredNodes.forEach(node => {
            if (node.name) {
              node.name = node.name.split(search).join(replace);
            }
          });
        }
      }
    }
  } catch (e) {
    console.error('Rename replacement failed:', e);
  }
}

const buildFilterRegex = (param: string): RegExp => {
  const safePattern = param.replace(/[xXｘＸ]/g, '[xXｘＸ×]').replace(/×/g, '[xXｘＸ×]');
  return new RegExp(safePattern, 'i');
};

if (includeParam) {
  try {
    const includeRegex = buildFilterRegex(includeParam);
    filteredNodes = filteredNodes.filter(node => includeRegex.test(node.name));
  } catch (e) {
    console.error('Invalid include regex:', e);
  }
}

if (excludeParam) {
  try {
    const excludeRegex = buildFilterRegex(excludeParam);
    filteredNodes = filteredNodes.filter(node => !excludeRegex.test(node.name));
  } catch (e) {
    console.error('Invalid exclude regex:', e);
  }
}

if (filteredNodes.length === 0) {
  return new Response('篩選與替換後，未剩下 any 有效節點。', { 
    status: 400, 
    headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
  });
}

const uniqueNodes = deduplicateNodeNames(filteredNodes);
const target = url.searchParams.get('target');

if (!target) {
  const host = `https://${url.host}`;
  const encodedUrl = encodeURIComponent(urlParam);
  let filterQuery = '';
  if (includeParam) filterQuery += `&include=${encodeURIComponent(includeParam)}`;
  if (excludeParam) filterQuery += `&exclude=${encodeURIComponent(excludeParam)}`;
  if (renameParam) filterQuery += `&rename=${encodeURIComponent(renameParam)}`;

  const htmlInfo = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>訂閱轉換結果</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; display: flex; justify-content: center; }
    .container { background: #1e293b; padding: 2rem; border-radius: 16px; max-width: 600px; width: 100%; }
    h1 { margin: 0 0 1.5rem 0; font-size: 1.5rem; text-align: center; }
    .result { background: #0f172a; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .result-title { font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 8px; }
    .result-link { background: #334155; padding: 0.8rem; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 0.85rem; }
    .btn { display: block; background: #22c55e; color: white; text-align: center; padding: 1rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 1.5rem; }
    .btn:hover { background: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ 篩選並轉換完成 (${uniqueNodes.length} 節點)</h1>
    <div class="result">
      <div class="result-title">📄 Sing-Box (JSON)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=singbox</div>
    </div>
    <div class="result">
      <div class="result-title">📋 Clash Meta (YAML)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=clash</div>
    </div>
    <div class="result">
      <div class="result-title">🔗 Base64 (原始)</div>
      <div class="result-link">${host}/?url=${encodedUrl}&target=base64</div>
    </div>
    <a class="btn" href="${host}/?url=${encodedUrl}&target=singbox">📥 下載 Sing-Box 訂閱</a>
  </div>
</body>
</html>
`;
  return new Response(htmlInfo, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

let result = '';
let contentType = 'text/plain';
let fileExt = '.txt';

if (target === 'clash') { 
  result = await toClashWithTemplate(uniqueNodes); 
  contentType = 'text/yaml'; 
  fileExt = '.yaml';
} else if (target === 'base64') { 
  result = toBase64(uniqueNodes); 
  contentType = 'text/plain'; 
  fileExt = '.txt';
} else { 
  result = await toSingBoxWithTemplate(uniqueNodes); 
  contentType = 'application/json'; 
  fileExt = '.json';
}

const filename = `subscription${fileExt}`;

const responseHeaders: Record<string, string> = {
  'Content-Type': `${contentType}; charset=utf-8`, 
  'Access-Control-Allow-Origin': '*', 
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'profile-title': filename, 
  'subscription-title': filename,
  'Content-Disposition': `inline; filename="${filename}"`,
  'Profile-Update-Interval': '3600',
};

if (hasTrafficInfo) {
  let userInfoHeader = `upload=${totalUpload}; download=${totalDownload}; total=${totalTotal}`;
  if (minExpire > 0) {
    userInfoHeader += `; expire=${minExpire}`;
  }
  responseHeaders['subscription-userinfo'] = userInfoHeader;
}

return new Response(result, { headers: responseHeaders });
}
};
