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
ORIGIN_HOST="{{ORIGIN_HOST}}"

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

# 2. 雙重保險：VPS 本地執行期自動檢測並修正連接埠與 TLS 加密衝突
DETECTED_PORT="$VLESS_PORT"

if command -v ss &> /dev/null; then
    if ! ss -tln | grep -qE ":$VLESS_PORT([[:space:]]|$)"; then
        echo -e "${RED}警告: 本地轉發埠 $VLESS_PORT 似乎未在本地監聽。正在探測常用埠...${NC}"
        if ss -tln | grep -qE ":443([[:space:]]|$)"; then
            echo -e "${GREEN}自動修正成功：偵測到 VPS 本地 Nginx/443 埠正在運行！已將轉發目標自動修正為: 443 埠。${NC}"
            DETECTED_PORT="443"
        elif ss -tln | grep -qE ":80([[:space:]]|$)"; then
            echo -e "${GREEN}自動修正成功：偵測到 VPS 本地 80 埠正在運行！已將轉發目標自動修正為: 80 埠。${NC}"
            DETECTED_PORT="80"
        fi
    fi
fi

# 智慧探測：自動探測目標連接埠是否啟用 TLS 加密
DETECTED_TLS="false"
if curl -s -k --connect-timeout 2 "https://127.0.0.1:$DETECTED_PORT" &>/dev/null; then
    echo "偵測到本地轉發埠 $DETECTED_PORT 為 TLS 加密連接埠，自動開啟 HTTPS 轉發與 SNI 對齊模式。"
    DETECTED_TLS="true"
else
    echo "偵測到本地轉發埠 $DETECTED_PORT 為明文連接埠，自動開啟 HTTP 轉發模式。"
fi

LOCAL_URL="http://127.0.0.1:$DETECTED_PORT"
EXTRA_ARGS=""
if [ "$DETECTED_TLS" = "true" ]; then
    LOCAL_URL="https://127.0.0.1:$DETECTED_PORT"
    EXTRA_ARGS="--no-tls-verify"
fi

# 重寫 Host Header 與 TLS SNI
if [ -n "$ORIGIN_HOST" ]; then
    echo "已自動啟用 HTTP 主機頭部重寫 (Host Header 重寫為: $ORIGIN_HOST)"
    EXTRA_ARGS="$EXTRA_ARGS --http-host-header $ORIGIN_HOST"
    if [ "$DETECTED_TLS" = "true" ]; then
        echo "已自動啟用 TLS SNI 重寫為: $ORIGIN_HOST"
        EXTRA_ARGS="$EXTRA_ARGS --origin-server-name $ORIGIN_HOST"
    fi
fi

# 4. 判斷並執行部署
if [ -n "$TUNNEL_TOKEN" ]; then
    echo -e "${GREEN}【固定隧道模式】正在配置服務...${NC}"
    cloudflared service uninstall &> /dev/null
    cloudflared service install "$TUNNEL_TOKEN"
    systemctl daemon-reload
    systemctl enable cloudflared
    systemctl restart cloudflared
    
    echo -e "\n${GREEN}=== 部署成功 【固定域名模式】 ===${NC}"
    echo -e "原節點名稱: $NODE_NAME"
    echo -e "轉發連接埠: $DETECTED_PORT"
    echo -e "綁定自訂域名: $CUSTOM_DOMAIN"
    
    if [ "$NODE_TYPE" = "vless" ]; then
        FINAL_LINK="vless://$VLESS_UUID@$CUSTOM_DOMAIN:443?encryption=none&security=tls&type=$VLESS_TYPE&host=$CUSTOM_DOMAIN"
        if [ "$VLESS_TYPE" = "ws" ]; then
            FINAL_LINK="$FINAL_LINK&path=$VLESS_PATH"
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
ExecStart=/usr/local/bin/cloudflared tunnel --url $LOCAL_URL $EXTRA_ARGS
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable cloudflared-argo-${SAFE_NODE_NAME}
    systemctl start cloudflared-argo-${SAFE_NODE_NAME}
    
    echo "正在等待 Cloudflare 分配臨時域名 (約需 10-15 秒)..."
    TEMP_DOMAIN=""
    for i in {1..15}; do
        sleep 1
        # 💥 核心修正：改用系統級 journalctl 探測，並搭配 tail -n 1 永遠提取最新活著的網域，徹底解決 530 緩存！
        TEMP_DOMAIN=$(journalctl -u cloudflared-argo-${SAFE_NODE_NAME} -n 50 --no-pager 2>/dev/null | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' | tail -n 1 | cut -d'/' -f3)
        if [ -n "$TEMP_DOMAIN" ]; then
            break
        fi
    done
    
    if [ -n "$TEMP_DOMAIN" ]; then
        echo -e "${GREEN}獲取臨時域名成功: $TEMP_DOMAIN${NC}"
        if [ "$NODE_TYPE" = "vless" ]; then
            FINAL_LINK="vless://$VLESS_UUID@$TEMP_DOMAIN:443?encryption=none&security=tls&type=$VLESS_TYPE&host=$TEMP_DOMAIN"
            if [ "$VLESS_TYPE" = "ws" ]; then
                FINAL_LINK="$FINAL_LINK&path=$VLESS_PATH"
            fi
            FINAL_LINK="$FINAL_LINK#$NODE_NAME"
        else
            VMESS_JSON="{\"v\":\"2\",\"ps\":\"$NODE_NAME\",\"add\":\"$TEMP_DOMAIN\",\"port\":443,\"id\":\"$VLESS_UUID\",\"aid\":0,\"scy\":\"auto\",\"net\":\"$VLESS_TYPE\",\"type\":\"none\",\"host\":\"$TEMP_DOMAIN\",\"path\":\"$VLESS_PATH\",\"tls\":\"tls\",\"sni\":\"$TEMP_DOMAIN\"}"
            VMESS_B64=$(echo -n "$VMESS_JSON" | base64 | tr -d '\n')
            FINAL_LINK="vmess://$VMESS_B64"
        fi
        
        echo -e "\n${GREEN}=== 部署成功 【臨時域名模式】 ===${NC}"
        echo -e "原節點名稱: $NODE_NAME"
        echo -e "轉發連接埠: $DETECTED_PORT"
        echo -e "分配的臨時域名: $TEMP_DOMAIN"
        echo -e "您的臨時 Argo 節點 $NODE_TYPE 連結為 (注意：VPS 重啟或重開服務後域名會刷新):"
        echo -e "${GREEN}$FINAL_LINK${NC}\n"
    else
        echo -e "${RED}錯誤: 獲取臨時域名超時！請執行 'journalctl -u cloudflared-argo-${SAFE_NODE_NAME} -n 30' 檢查日誌。${NC}"
    fi
fi
