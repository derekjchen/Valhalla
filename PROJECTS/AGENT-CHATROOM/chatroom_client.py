#!/usr/bin/env python3
"""
CoPaw Chatroom Channel - WebSocket 客户端
让 Co 能持续在线，实时接收和发送消息

Author: Co
Date: 2026-03-18
"""

import asyncio
import json
import websockets
from datetime import datetime
from typing import Optional, Callable, List, Dict
import threading


class ChatroomClient:
    """群聊 WebSocket 客户端"""
    
    def __init__(
        self,
        name: str = "Co",
        room: str = "co-claw-derek",
        url: str = "ws://39.96.212.215:18790"
    ):
        self.name = name
        self.room = room
        self.url = url
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.message_callback: Optional[Callable] = None
        self.running = False
        self._loop = None
        self._thread = None
        
    async def connect(self) -> bool:
        """连接到群聊服务器"""
        try:
            self.ws = await websockets.connect(self.url)
            self.running = True
            
            # 设置名字
            await self._send({"type": "set_name", "name": self.name})
            
            # 加载历史消息
            await self._send({"type": "load_history", "room": self.room, "limit": 20})
            
            print(f"[Co] 已连接到群聊: {self.url}")
            print(f"[Co] 名字: {self.name}, 房间: {self.room}")
            
            # 启动接收循环
            asyncio.create_task(self._receive_loop())
            
            return True
        except Exception as e:
            print(f"[Co] 连接失败: {e}")
            return False
    
    async def _send(self, message: dict):
        """发送消息"""
        if self.ws:
            await self.ws.send(json.dumps(message))
    
    async def _receive_loop(self):
        """持续接收消息"""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    print(f"[Co] 无效消息: {message}")
        except websockets.exceptions.ConnectionClosed:
            print("[Co] 连接关闭")
            self.running = False
        except Exception as e:
            print(f"[Co] 接收错误: {e}")
            self.running = False
    
    async def _handle_message(self, data: dict):
        """处理收到的消息"""
        msg_type = data.get("type")
        
        if msg_type == "welcome":
            print(f"[Co] 欢迎: {data.get('message')}")
            
        elif msg_type == "name_set":
            print(f"[Co] 名字已设置: {data.get('name')}")
            
        elif msg_type == "history":
            messages = data.get("messages", [])
            print(f"[Co] 加载了 {len(messages)} 条历史消息")
            
        elif msg_type == "message":
            from_name = data.get("from", "unknown")
            content = data.get("content", "")
            mentions = data.get("mentions", [])
            timestamp = data.get("timestamp", "")
            
            # 检查是否被 @
            is_mentioned = any(
                f"@{self.name.lower()}" in m.lower() 
                for m in ([content] + mentions)
            )
            
            if is_mentioned:
                print(f"[Co] 📣 被 @{from_name} 提及: {content}")
            else:
                print(f"[Co] 💬 {from_name}: {content}")
            
            # 触发回调
            if self.message_callback:
                await self.message_callback(data)
                
        elif msg_type == "join":
            print(f"[Co] 🚪 {data.get('from')} 加入了房间")
            
        elif msg_type == "leave":
            print(f"[Co] 🚪 {data.get('from')} 离开了房间")
            
        elif msg_type == "error":
            print(f"[Co] ❌ 错误: {data.get('message')}")
    
    async def chat(self, content: str, mentions: List[str] = None):
        """发送聊天消息"""
        msg = {
            "type": "chat",
            "content": content,
            "room": self.room,
            "mentions": mentions or []
        }
        await self._send(msg)
        print(f"[Co] 📤 发送: {content}")
    
    async def reply(self, to: str, content: str):
        """回复某人"""
        await self.chat(f"@{to} {content}", mentions=[f"@{to}"])
    
    async def close(self):
        """关闭连接"""
        self.running = False
        if self.ws:
            await self.ws.close()
            print("[Co] 连接已关闭")
    
    def start_background(self, on_message: Callable = None):
        """在后台启动客户端"""
        self.message_callback = on_message
        
        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._loop.run_until_complete(self._run_forever())
        
        self._thread = threading.Thread(target=run_loop, daemon=True)
        self._thread.start()
        print("[Co] 后台客户端已启动")
    
    async def _run_forever(self):
        """永久运行"""
        while True:
            if not self.running:
                if await self.connect():
                    pass
                else:
                    await asyncio.sleep(5)  # 重连间隔
            await asyncio.sleep(1)


# 测试代码
async def test_client():
    """测试客户端"""
    client = ChatroomClient(name="Co-Test")
    
    async def on_message(data):
        """收到消息时的回调"""
        if data.get("type") == "message":
            from_name = data.get("from", "unknown")
            content = data.get("content", "")
            
            # 如果有人 @Co-Test，自动回复
            if f"@co-test" in content.lower():
                await client.reply(from_name, "收到！这是自动回复 🤖")
    
    client.message_callback = on_message
    
    if await client.connect():
        # 发送测试消息
        await client.chat("大家好！Co 测试客户端上线了 🤖")
        
        # 保持运行
        try:
            while client.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            await client.close()


if __name__ == "__main__":
    asyncio.run(test_client())