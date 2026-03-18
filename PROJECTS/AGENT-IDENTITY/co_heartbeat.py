#!/usr/bin/env python3
"""
Co 心跳脚本 - 每小时检查群聊并与 Claw 对齐

功能:
1. 连接群聊发送心跳消息
2. 检查 Claw 是否在线
3. 交换状态信息
4. 记录心跳日志

Author: Co
Date: 2026-03-18
"""

import asyncio
import json
import websockets
from datetime import datetime
from pathlib import Path
import sys

# 配置
CHATROOM_URL = "ws://39.96.212.215:18790"
ROOM = "co-claw-derek"
NAME = "Co"
HEARTBEAT_LOG = Path("/app/working/logs/heartbeat.log")
STATUS_FILE = Path("/app/working/logs/last_heartbeat.json")


async def send_heartbeat():
    """发送心跳消息"""
    timestamp = datetime.utcnow().isoformat()
    
    try:
        async with websockets.connect(CHATROOM_URL, close_timeout=5) as ws:
            # 设置名字
            await ws.send(json.dumps({"type": "set_name", "name": NAME}))
            
            # 等待确认
            await asyncio.wait_for(ws.recv(), timeout=3)
            
            # 发送心跳消息
            heartbeat_msg = f"💓 心跳检查 {timestamp[:16]} - Co 运行正常"
            await ws.send(json.dumps({
                "type": "chat",
                "content": heartbeat_msg,
                "room": ROOM
            }))
            
            # 检查 Claw 是否在线
            await ws.send(json.dumps({
                "type": "list_users",
                "room": ROOM
            }))
            
            # 接收用户列表
            log_message = "未知状态"
            try:
                response = await asyncio.wait_for(ws.recv(), timeout=3)
                data = json.loads(response)
                if data.get("type") == "user_list":
                    users = data.get("users", [])
                    claw_online = any("claw" in u.lower() for u in users)
                    
                    if claw_online:
                        # Claw 在线，发送对齐请求
                        await ws.send(json.dumps({
                            "type": "chat",
                            "content": "@claw 🦞 心跳对齐：Co 状态正常，请确认你的状态",
                            "room": ROOM
                        }))
                        log_message = f"✅ Claw 在线，已发送对齐请求"
                    else:
                        log_message = f"⏳ Claw 离线，等待下次检查"
                    
                    print(f"在线用户: {users}")
                    print(log_message)
            except asyncio.TimeoutError:
                log_message = "⚠️ 获取用户列表超时"
                print(log_message)
            
            # 记录日志
            log_heartbeat(timestamp, True, log_message)
            
            print(f"✅ 心跳发送成功: {timestamp}")
            return True
            
    except Exception as e:
        error_msg = f"❌ 心跳失败: {e}"
        print(error_msg)
        log_heartbeat(timestamp, False, error_msg)
        return False


def log_heartbeat(timestamp: str, success: bool, message: str):
    """记录心跳日志"""
    HEARTBEAT_LOG.parent.mkdir(parents=True, exist_ok=True)
    
    # 写入日志文件
    log_line = f"{timestamp} | {'SUCCESS' if success else 'FAILED'} | {message}\n"
    with open(HEARTBEAT_LOG, "a") as f:
        f.write(log_line)
    
    # 写入状态文件
    status = {
        "last_heartbeat": timestamp,
        "success": success,
        "message": message,
        "agent_id": "agent_93502504a73f6905"
    }
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


def show_recent_logs(n: int = 5):
    """显示最近的日志"""
    if HEARTBEAT_LOG.exists():
        print(f"\n📜 最近 {n} 条心跳日志:")
        with open(HEARTBEAT_LOG, "r") as f:
            lines = f.readlines()[-n:]
            for line in lines:
                print(f"  {line.strip()}")
    else:
        print("\n📜 暂无心跳日志")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Co 心跳脚本")
    parser.add_argument("--logs", action="store_true", help="显示最近日志")
    parser.add_argument("--status", action="store_true", help="显示当前状态")
    args = parser.parse_args()
    
    if args.logs:
        show_recent_logs()
    elif args.status:
        if STATUS_FILE.exists():
            print("\n📊 当前状态:")
            status = json.loads(STATUS_FILE.read_text())
            for key, value in status.items():
                print(f"  {key}: {value}")
        else:
            print("\n📊 暂无状态信息")
    else:
        print(f"🕐 Co 心跳检查 - {datetime.utcnow().isoformat()}")
        print("=" * 50)
        asyncio.run(send_heartbeat())