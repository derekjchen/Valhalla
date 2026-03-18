#!/bin/bash
# Chatroom Server Watchdog
# 监控服务器进程，如果挂了自动重启

CHATROOM_DIR="/home/admin/.openclaw/workspace/PROJECTS/AGENT-CHATROOM"
LOG_FILE="/tmp/chatroom-watchdog.log"
CHECK_INTERVAL=30  # 每 30 秒检查一次

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_and_restart() {
    # 检查服务器进程
    if ! pgrep -f "node server/index.js" > /dev/null; then
        log "⚠️ 服务器进程未运行，尝试重启..."
        
        # 检查端口是否被占用
        if netstat -tln 2>/dev/null | grep -q ":18790"; then
            log "⚠️ 端口 18790 被占用，等待清理..."
            sleep 5
        fi
        
        # 启动服务器
        cd "$CHATROOM_DIR"
        nohup node server/index.js > /tmp/chatroom.log 2>&1 &
        
        sleep 2
        
        # 验证是否启动成功
        if pgrep -f "node server/index.js" > /dev/null; then
            log "✅ 服务器已重启"
        else
            log "❌ 服务器重启失败"
        fi
    fi
}

log "🐕 Chatroom Watchdog 启动"
log "检查间隔：${CHECK_INTERVAL}秒"

while true; do
    check_and_restart
    sleep $CHECK_INTERVAL
done
