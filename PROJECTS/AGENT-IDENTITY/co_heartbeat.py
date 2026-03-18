#!/usr/bin/env python3
"""
Co 心跳脚本 - 每小时检查群聊并主动参与

功能:
1. 检查 sync-inbox 新消息
2. 检查 chatroom 活动
3. 检查服务器状态
4. 提醒待办事项
5. 主动参与讨论

Author: Co
Date: 2026-03-18
"""

import asyncio
import json
import websockets
from datetime import datetime
from pathlib import Path
import sys
import os

# 配置
CHATROOM_URL = "ws://localhost:18790"
ROOM = "co-claw-derek"
NAME = "Co"
WORKSPACE = Path("/home/admin/.openclaw/workspace")
SYNC_INBOX = WORKSPACE / "SHARED-MEMORY" / "sync-inbox"
CHATROOM_LOGS = WORKSPACE / "SHARED-MEMORY" / "chatroom"
HEARTBEAT_LOG = WORKSPACE / "memory" / "co-heartbeat.log"
STATUS_FILE = WORKSPACE / "memory" / "co-heartbeat-state.json"


def check_sync_inbox():
    """检查 sync-inbox 新消息"""
    try:
        if not SYNC_INBOX.exists():
            return "⚠️ sync-inbox 不存在"
        
        files = list(SYNC_INBOX.glob("*.json"))
        if not files:
            return "✅ sync-inbox: 无新消息"
        
        # 检查是否有未读消息
        unread = []
        for f in files:
            try:
                data = json.loads(f.read_text())
                if data.get("to") == "co" and not data.get("read"):
                    unread.append(f.name)
            except:
                pass
        
        if unread:
            return f"📬 sync-inbox: {len(unread)} 条未读消息"
        return f"✅ sync-inbox: {len(files)} 条消息 (已读)"
    except Exception as e:
        return f"❌ sync-inbox 检查失败：{e}"


def check_chatroom_activity():
    """检查 chatroom 活动"""
    try:
        if not CHATROOM_LOGS.exists():
            return "⚠️ chatroom 日志不存在"
        
        files = list(CHATROOM_LOGS.glob("*.jsonl"))
        if not files:
            return "⚠️ chatroom: 无聊天记录"
        
        # 读取最新文件的最后几条
        latest = max(files, key=lambda f: f.stat().st_mtime)
        lines = latest.read_text().strip().split('\n')[-5:]
        
        # 统计活动
        derek_msgs = sum(1 for l in lines if '"from":"Derek"' in l)
        claw_msgs = sum(1 for l in lines if '"from":"claw"' in l)
        
        if derek_msgs or claw_msgs:
            return f"💬 chatroom: Derek({derek_msgs}) Claw({claw_msgs}) 活跃"
        return "⚠️ chatroom: 暂无新消息"
    except Exception as e:
        return f"❌ chatroom 检查失败：{e}"


def check_server_status():
    """检查服务器状态"""
    try:
        import subprocess
        result = subprocess.Popen(
            "pgrep -f 'node server/index.js' > /dev/null 2>&1 && echo 'running' || echo 'stopped'",
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        stdout, stderr = result.communicate()
        if 'running' in stdout:
            return "✅ 服务器：正常运行"
        return "⚠️ 服务器：未运行"
    except:
        return "❌ 服务器：检查失败"


def get_pending_tasks():
    """获取待办事项"""
    tasks = []
    
    # 检查 HEARTBEAT.md
    heartbeat_file = WORKSPACE / "HEARTBEAT.md"
    if heartbeat_file.exists():
        content = heartbeat_file.read_text()
        if "创建远程仓库" in content:
            tasks.append("⚠️ Derek 今晚创建远程仓库")
    
    return tasks


async def send_heartbeat():
    """发送有意义的心跳消息"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    # 收集状态信息
    sync_status = check_sync_inbox()
    chatroom_status = check_chatroom_activity()
    server_status = check_server_status()
    pending_tasks = get_pending_tasks()
    
    # 构建心跳消息
    heartbeat_msg = f"""💓 心跳检查 ({timestamp})

**检查项目:**
- {sync_status}
- {chatroom_status}
- {server_status}"""
    
    if pending_tasks:
        heartbeat_msg += "\n\n**待办提醒:**\n" + "\n".join(pending_tasks)
    
    heartbeat_msg += "\n\n**下一步:** 等 Derek 指示"
    
    try:
        async with websockets.connect(CHATROOM_URL, close_timeout=5) as ws:
            # 设置名字
            await ws.send(json.dumps({"type": "set_name", "name": NAME}))
            
            # 等待确认
            await asyncio.wait_for(ws.recv(), timeout=3)
            
            # 发送心跳消息
            await ws.send(json.dumps({
                "type": "chat",
                "content": heartbeat_msg,
                "room": ROOM
            }))
            
            # 记录日志
            HEARTBEAT_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(HEARTBEAT_LOG, "a") as f:
                f.write(f"[{timestamp}] {heartbeat_msg}\n")
            
            # 保存状态
            status = {
                "timestamp": timestamp,
                "sync": sync_status,
                "chatroom": chatroom_status,
                "server": server_status,
                "tasks": pending_tasks
            }
            with open(STATUS_FILE, "w") as f:
                json.dump(status, f, indent=2, ensure_ascii=False)
            
            print(f"✅ 心跳发送成功：{timestamp}")
            
    except Exception as e:
        print(f"❌ 心跳发送失败：{e}")


if __name__ == "__main__":
    # 兼容旧版本 Python
    loop = asyncio.get_event_loop()
    loop.run_until_complete(send_heartbeat())
