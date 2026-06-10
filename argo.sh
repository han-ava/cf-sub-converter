#!/bin/bash
# Cloudflare Argo Tunnel 一鍵部署腳本 (由 cf-sub-converter 動態配置)
# 專案網址: https://github.com/sammy0101/cf-sub-converter

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# 動態變數佔位符 (由 Worker 自動替換)
NODE_TYPE="{{NODE_TYPE}}"
VLESS_UUID="{{VLESS_UUID}}"
VLESS_PATH="{{VLESS_PATH}}"
VLESS_TYPE="{{VLESS_TYPE}}"
VLESS_PORT="{{VLESS_PORT}}"
NODE_NAME="{{NODE_NAME}}"
TUNNEL_TOKEN="{{TUNNEL_TOKEN}}"
CUSTOM_DOMAIN="{{CUSTOM_DOMAIN}}"
VLESS_TLS="{{VLESS_TLS}}"

echo -e "${GREEN}=== 開始部署 Cloudflare Argo 隧道 (${NODE_NAME}) ===${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}錯誤: 請使用 root 權限執行此腳本！${NC}"
  exit 1
fi

# 1. 安裝 cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "正在下載安裝 cloudflared..."
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
else
    echo "cloudflared 已存在，跳過安裝。"
fi

SAFE_NODE_NAME=$(echo "$NODE_NAME" | sed 's/[^a-zA-Z0-9]/_/g')

# 💥 2. 雙重保險：VPS 本地執行期自動檢測並修正連接埠與 TLS 加密衝突
DETECTED_PORT="$VLESS_PORT"
DETECTED_TLS="$VLESS_TLS"

if command -v ss &> /dev/null; then
    # 檢查使用者輸入的埠在 VPS 上是否有監聽
    if ! ss -tln | grep -q ":$VLESS_PORT "; then
        echo -e "${RED}警告: 輸入的本地轉發埠 $VLESS_PORT 似乎未在本地監聽。正在探測常用埠...${NC}"
        if ss -tln | grep -q ":443 "; then
            echo -e "${GREEN}自動修正成功：偵測到 VPS 本地 Nginx/443 埠正在運行！已將轉發目標自動修正為: 443 (TLS) 埠。${NC}"
            DETECTED_PORT="443"
            DETECTED_TLS="true"
        elif ss -tln | grep -q ":80 "; then
            echo -e "${GREEN}自動修正成功：偵測到 VPS 本地 80 埠正在運行！已將轉發目標自動修正為: 80 埠。${NC}"
            DETECTED_PORT="80"
            DETECTED_TLS="false"
        fi
    fi
fi

LOCAL_URL="http://127.0.0.1:$DETECTED_PORT"
if [ "$DETECTED_TLS" = "true" ]; then
    LOCAL_URL="https://127.0.0.1:$DETECTED_PORT --no-tls-verify"
fi

# 3. 判斷並執行部署
if [ -n "$TUNNEL_TOKEN" ]; then
    echo -e "${GREEN}【固定隧道模式】正在配置服務...${NC}"
    cloudflared service uninstall &> /dev/null
    cloudflared service install "$TUNNEL_TOKEN"
    systemctl daemon-reload
    systemctl enable cloudflared
    systemctl restart cloudflared
    
    echo -e "${GREEN}固定隧道服務啟動成功！${NC}"
    echo "請確保已在 Cloudflare Dashboard 中將網域 '$CUSTOM_DOMAIN' 指向本地服務。"
    echo "提示：若您使用的是 TLS 加密端口 (如 443)，請在 Cloudflare Zero Trust 的 Tunnel 設置中，將 Service Type 設定為 HTTPS，並在 Additional HTTP settings 中開啟 [No TLS Verify] 屬性。"
    
    if [ "$NODE_TYPE" = "vless" ]; then
        FINAL_LINK="vless://$VLESS_UUID@$CUSTOM_DOMAIN:443?encryption=none&security=tls&type=$VLESS_TYPE&host=$CUSTOM_DOMAIN"
        if [ "$VLESS_TYPE" = "ws" ]; then
            FINAL_LINK="$FINAL_LINK&path=$(echo -n "$VLESS_PATH" | jq -s -R -r @uri 2>/dev/null || echo -n "$VLESS_PATH")"
        fi
        FINAL_LINK="$FINAL_LINK#$NODE_NAME"
    else
        VMESS_JSON="{\"v\":\"2\",\"ps\":\"$NODE_NAME\",\"add\":\"$CUSTOM_DOMAIN\",\"port\":443,\"id\":\"$VLESS_UUID\",\"aid\":0,\"scy\":\"auto\",\"net\":\"$VLESS_TYPE\",\"type\":\"none\",\"host\":\"$CUSTOM_DOMAIN\",\"path\":\"$VLESS_PATH\",\"tls\":\"tls\",\"sni\":\"$CUSTOM_DOMAIN\"}"
        VMESS_B64=$(echo -n "$VMESS_JSON" | base64 | tr -d '\n')
        FINAL_LINK="vmess://$VMESS_B64"
    fi
    echo -e "\n${GREEN}您的 Argo $NODE_TYPE 訂閱連結為:${NC}"
    echo -e "${GREEN}$FINAL_LINK${NC}\n"
else
    echo -e "${GREEN}【臨時隧道模式】正在啟動 Quick Tunnel...${NC}"
    systemctl stop cloudflared-argo-${SAFE_NODE_NAME} &> /dev/null
    
    cat <<EOF > /etc/systemd/system/cloudflared-argo-${SAFE_NODE_NAME}.service
[Unit]
Description=Cloudflare Argo Temporary Tunnel for ${NODE_NAME}
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --url $LOCAL_URL
Restart=always
RestartSec=5
StandardOutput=file:/var/log/cloudflared-argo-${SAFE_NODE_NAME}.log
StandardError=file:/var/log/cloudflared-argo-${SAFE_NODE_NAME}.log

[Install]
WantedBy=multi-user.target
EOF

    touch /var/log/cloudflared-argo-${SAFE_NODE_NAME}.log
    systemctl daemon-reload
    systemctl enable cloudflared-argo-${SAFE_NODE_NAME}
    systemctl start cloudflared-argo-${SAFE_NODE_NAME}
    
    echo "正在等待 Cloudflare 分配臨時域名 (約需 10-15 秒)..."
    TEMP_DOMAIN=""
    for i in {1..15}; do
        sleep 1
        TEMP_DOMAIN=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /var/log/cloudflared-argo-${SAFE_NODE_NAME}.log | head -n 1 | sed 's/https:\/\///')
        if [ -n "$TEMP_DOMAIN" ]; then
            break
        fi
    done
    
    if [ -n "$TEMP_DOMAIN" ]; then
        echo -e "${GREEN}獲取臨時域名成功: $TEMP_DOMAIN${NC}"
        if [ "$NODE_TYPE" = "vless" ]; then
            FINAL_LINK="vless://$VLESS_UUID@$TEMP_DOMAIN:443?encryption=none&security=tls&type=$VLESS_TYPE&host=$TEMP_DOMAIN"
            if [ "$VLESS_TYPE" = "ws" ]; then
                FINAL_LINK="$FINAL_LINK&path=$(echo -n "$VLESS_PATH" | jq -s -R -r @uri 2>/dev/null || echo -n "$VLESS_PATH")"
            fi
            FINAL_LINK="$FINAL_LINK#$NODE_NAME"
        else
            VMESS_JSON="{\"v\":\"2\",\"ps\":\"$NODE_NAME\",\"add\":\"$TEMP_DOMAIN\",\"port\":443,\"id\":\"$VLESS_UUID\",\"aid\":0,\"scy\":\"auto\",\"net\":\"$VLESS_TYPE\",\"type\":\"none\",\"host\":\"$TEMP_DOMAIN\",\"path\":\"$VLESS_PATH\",\"tls\":\"tls\",\"sni\":\"$TEMP_DOMAIN\"}"
            VMESS_B64=$(echo -n "$VMESS_JSON" | base64 | tr -d '\n')
            FINAL_LINK="vmess://$VMESS_B64"
        fi
        
        echo -e "\n${GREEN}=== 部署成功 ===${NC}"
        echo -e "原節點名稱: $NODE_NAME"
        echo -e "轉發連接埠: $DETECTED_PORT"
        echo -e "您的臨時 Argo 節點 $NODE_TYPE 連結為 (注意：VPS 重啟或重開服務後域名會刷新):"
        echo -e "${GREEN}$FINAL_LINK${NC}\n"
    else
        echo -e "${RED}錯誤: 獲取臨時域名超時！請執行 'cat /var/log/cloudflared-argo-${SAFE_NODE_NAME}.log' 檢查日誌。${NC}"
    fi
fi
