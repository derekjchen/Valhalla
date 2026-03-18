#!/bin/bash
# Sync Heartbeat Check - 每小时检查 Co 的同步消息

WORKSPACE="/home/admin/.openclaw/workspace"
SYNC_INBOX="$WORKSPACE/SHARED-MEMORY/sync-inbox"
CHATROOM_LOGS="$WORKSPACE/PROJECTS/SHARED-MEMORY/chatroom"
MEMORY_FILE="$WORKSPACE/memory/heartbeat-sync-state.json"

# 创建状态文件（如果不存在）
if [ ! -f "$MEMORY_FILE" ]; then
    echo '{"lastCheck": 0, "lastSyncMessage": null, "lastChatroomMessage": null}' > "$MEMORY_FILE"
fi

# 读取上次检查状态
LAST_CHECK=$(cat "$MEMORY_FILE" | grep -o '"lastCheck": [0-9]*' | grep -o '[0-9]*')
LAST_SYNC=$(cat "$MEMORY_FILE" | grep -o '"lastSyncMessage": "[^"]*"' | cut -d'"' -f4)
LAST_CHAT=$(cat "$MEMORY_FILE" | grep -o '"lastChatroomMessage": "[^"]*"' | cut -d'"' -f4)

NOW=$(date +%s)
NEW_MESSAGES=()

# 检查 sync-inbox 新消息
if [ -d "$SYNC_INBOX" ]; then
    for file in "$SYNC_INBOX"/*.json; do
        [ -f "$file" ] || continue
        FILENAME=$(basename "$file")
        if [ "$FILENAME" != "$LAST_SYNC" ]; then
            # 检查是否是 Co 的消息
            FROM=$(cat "$file" | grep -o '"from": "[^"]*"' | head -1 | cut -d'"' -f4)
            if [ "$FROM" = "co" ]; then
                NEW_MESSAGES+=("📬 Co 有新同步消息：$FILENAME")
            fi
        fi
    done
fi

# 检查 chatroom 新消息
if [ -d "$CHATROOM_LOGS" ]; then
    LATEST_CHAT=$(ls -t "$CHATROOM_LOGS"/*.jsonl 2>/dev/null | head -1)
    if [ -n "$LATEST_CHAT" ]; then
        CHAT_FILENAME=$(basename "$LATEST_CHAT")
        LAST_LINE=$(tail -1 "$LATEST_CHAT" 2>/dev/null)
        if [ -n "$LAST_LINE" ] && [ "$CHAT_FILENAME" != "$LAST_CHAT" ]; then
            FROM=$(echo "$LAST_LINE" | grep -o '"from":"[^"]*"' | cut -d'"' -f4)
            if [ -n "$FROM" ] && [ "$FROM" != "guest-cvylk2" ]; then
                NEW_MESSAGES+=("💬 Chatroom 有新消息来自：$FROM")
            fi
        fi
    fi
fi

# 更新状态文件
LATEST_SYNC=$(ls -t "$SYNC_INBOX"/*.json 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "null")
LATEST_CHAT_FILE=$(ls -t "$CHATROOM_LOGS"/*.jsonl 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "null")

cat > "$MEMORY_FILE" << EOF
{
  "lastCheck": $NOW,
  "lastSyncMessage": "$LATEST_SYNC",
  "lastChatroomMessage": "$LATEST_CHAT_FILE",
  "checkHistory": [
    {"time": $NOW, "found": ${#NEW_MESSAGES[@]}}
  ]
}
EOF

# 输出结果
if [ ${#NEW_MESSAGES[@]} -gt 0 ]; then
    echo "=== 发现新消息 ==="
    for msg in "${NEW_MESSAGES[@]}"; do
        echo "$msg"
    done
    exit 1  # 有新消息时返回非零，触发通知
else
    echo "✅ 无新消息 - $(date '+%Y-%m-%d %H:%M:%S')"
    exit 0
fi
