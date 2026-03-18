#!/usr/bin/env python3
"""
Claw 的持续在线群聊客户端
保持 WebSocket 连接，实时接收@ 提醒

Author: Claw
Date: 2026-03-18
"""

import asyncio
import json
import websockets
import sys
from datetime import datetime
from pathlib import Path

# 配置
CONFIG = {
    "name": "claw",
    "room": "co-claw-derek",
    "url": "ws://localhost:18790",
    "log_file": "/home/admin/.openclaw/workspace/memory/claw-chatroom.log"
}

class ClawClient:
    """Claw 的群聊客户端"""
    
    def __init__(self, config: dict):
        self.name = config["name"]
        self.room = config["room"]
        self.url = config["url"]
        self.log_file = Path(config["log_file"])
        self.ws = None
        self.running = False
        
    def log(self, message: str):
        """记录日志"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"[{timestamp}] {message}\n"
        print(log_line, end="")
        
        # 写入日志文件
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.log_file, "a") as f:
            f.write(log_line)
    
    async def connect(self) -> bool:
        """连接到服务器"""
        try:
            self.ws = await websockets.connect(self.url)
            self.running = True
            
            # 设置名字
            await self.send({"type": "set_name", "name": self.name})
            self.log(f"✅ 已连接并设置名字为 '{self.name}'")
            
            # 加载历史消息（最近 20 条）
            await self.send({"type": "load_history", "room": self.room, "limit": 20})
            
            return True
        except Exception as e:
            self.log(f"❌ 连接失败：{e}")
            return False
    
    async def send(self, message: dict):
        """发送消息"""
        if self.ws:
            await self.ws.send(json.dumps(message))
    
    async def receive_loop(self):
        """持续接收消息"""
        self.log("👂 开始监听消息...")
        
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self.handle_message(data)
                except json.JSONDecodeError:
                    self.log(f"⚠️ 无效消息：{message}")
        except websockets.exceptions.ConnectionClosed:
            self.log("🔌 连接已关闭")
            self.running = False
        except Exception as e:
            self.log(f"❌ 接收错误：{e}")
            self.running = False
    
    async def handle_message(self, data: dict):
        """处理收到的消息"""
        msg_type = data.get("type")
        
        if msg_type == "welcome":
            self.log(f"👋 欢迎：{data.get('message')}")
            
        elif msg_type == "name_set":
            self.log(f"✓ 名字已确认：{data.get('name')}")
            
        elif msg_type == "history":
            messages = data.get("messages", [])
            self.log(f"📜 加载了 {len(messages)} 条历史消息")
            
        elif msg_type == "message":
            from_name = data.get("from", "unknown")
            content = data.get("content", "")
            mentions = data.get("mentions", [])
            
            # 检查是否被 @
            is_mentioned = any(
                f"@{self.name.lower()}" in m.lower()
                for m in ([content] + mentions)
            )
            
            if is_mentioned:
                self.log(f"📣 被 @{from_name} 提及：{content}")
                # 这里可以添加自动回复逻辑
            else:
                self.log(f"💬 {from_name}: {content}")
                
        elif msg_type == "join":
            self.log(f"🚪 {data.get('from')} 加入房间")
            
        elif msg_type == "leave":
            self.log(f"🚪 {data.get('from')} 离开房间")
            
        elif msg_type == "error":
            self.log(f"❌ 错误：{data.get('message')}")
    
    async def chat(self, content: str, mentions: list = None):
        """发送聊天消息"""
        msg = {
            "type": "chat",
            "content": content,
            "room": self.room,
            "mentions": mentions or []
        }
        await self.send(msg)
        self.log(f"📤 发送：{content}")
    
    async def run_forever(self):
        """永久运行（带自动重连）"""
        while True:
            try:
                self.log("🔄 尝试连接...")
                if await self.connect():
                    await self.receive_loop()
                
                # 连接断开后等待重连
                self.log("⏳ 5 秒后重连...")
                await asyncio.sleep(5)
                
            except KeyboardInterrupt:
                self.log("👋 用户中断，退出")
                break
            except Exception as e:
                self.log(f"❌ 异常：{e}")
                await asyncio.sleep(5)
    
    async def close(self):
        """关闭连接"""
        self.running = False
        if self.ws:
            await self.ws.close()
            self.log("🔌 连接已关闭")


async def main():
    """主函数"""
    print("=" * 60)
    print("🦞 Claw Chatroom Client - 持续在线模式")
    print("=" * 60)
    
    client = ClawClient(CONFIG)
    
    try:
        await client.run_forever()
    except KeyboardInterrupt:
        await client.close()
        print("\n👋 再见！")


if __name__ == "__main__":
    asyncio.run(main())
