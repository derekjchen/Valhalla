#!/usr/bin/env python3
"""
Co Persistent Client - 持续在线的群聊客户端
支持 Agent Identity 和自动重连（指数退避）

Author: Co
Date: 2026-03-18
"""

import asyncio
import json
import websockets
import hashlib
import os
import base64
import signal
import sys
from datetime import datetime
from typing import Optional, Callable
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.backends import default_backend


class AgentIdentity:
    """Agent 身份管理"""
    
    def __init__(self, name: str, key_dir: str = "/tmp/agent_keys"):
        self.name = name
        self.key_dir = key_dir
        self.private_key = None
        self.public_key = None
        self.agent_id = None
        os.makedirs(key_dir, exist_ok=True)
    
    def generate(self) -> dict:
        self.private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        self.public_key = self.private_key.public_key()
        pub_key_der = self.public_key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.agent_id = "agent_" + hashlib.sha256(pub_key_der).hexdigest()[:16]
        return self.get_info()
    
    def load(self) -> Optional[dict]:
        priv_path = os.path.join(self.key_dir, f"{self.name}.private.pem")
        pub_path = os.path.join(self.key_dir, f"{self.name}.public.pem")
        id_path = os.path.join(self.key_dir, f"{self.name}.id")
        
        if not os.path.exists(priv_path):
            return None
        
        with open(priv_path, "rb") as f:
            self.private_key = serialization.load_pem_private_key(
                f.read(), password=None, backend=default_backend()
            )
        with open(pub_path, "rb") as f:
            self.public_key = serialization.load_pem_public_key(
                f.read(), backend=default_backend()
            )
        with open(id_path, "r") as f:
            self.agent_id = f.read().strip()
        return self.get_info()
    
    def save(self):
        priv_path = os.path.join(self.key_dir, f"{self.name}.private.pem")
        pub_path = os.path.join(self.key_dir, f"{self.name}.public.pem")
        id_path = os.path.join(self.key_dir, f"{self.name}.id")
        
        with open(priv_path, "wb") as f:
            f.write(self.private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        os.chmod(priv_path, 0o600)
        with open(pub_path, "wb") as f:
            f.write(self.get_public_key_pem().encode())
        with open(id_path, "w") as f:
            f.write(self.agent_id)
    
    def get_public_key_pem(self) -> str:
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode()
    
    def sign(self, message: str) -> str:
        signature = self.private_key.sign(
            message.encode(),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode()
    
    def get_info(self) -> dict:
        return {
            "name": self.name,
            "agentId": self.agent_id,
            "publicKey": self.get_public_key_pem()
        }


class CoPersistentClient:
    """持续在线的群聊客户端"""
    
    def __init__(
        self,
        name: str = "Co",
        room: str = "co-claw-derek",
        url: str = "ws://39.96.212.215:18790",
        key_dir: str = "/tmp/agent_keys",
        log_file: str = "/tmp/co-persistent.log"
    ):
        self.name = name
        self.room = room
        self.url = url
        self.ws = None
        self.identity = None
        self.running = False
        self.registered = False
        self.log_file = log_file
        self.message_callback = None
        
        # 重连参数（指数退避）
        self.reconnect_delay = 5  # 初始延迟 5 秒
        self.max_reconnect_delay = 30  # 最大延迟 30 秒
        self.reconnect_factor = 1.5  # 退避因子
        
        # 初始化身份
        self._init_identity(key_dir)
    
    def _init_identity(self, key_dir: str):
        self.identity = AgentIdentity(self.name, key_dir)
        info = self.identity.load()
        if info:
            self.log(f"已加载身份: {self.identity.agent_id}")
        else:
            info = self.identity.generate()
            self.identity.save()
            self.log(f"生成新身份: {self.identity.agent_id}")
    
    def log(self, message: str):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {message}"
        print(line)
        if self.log_file:
            with open(self.log_file, "a") as f:
                f.write(line + "\n")
    
    async def connect(self) -> bool:
        try:
            self.log(f"连接到 {self.url}...")
            self.ws = await websockets.connect(self.url)
            self.running = True
            self.log("已连接")
            
            # 注册 Agent
            info = self.identity.get_info()
            await self._send({
                "type": "register_agent",
                "name": info["name"],
                "agentId": info["agentId"],
                "publicKey": info["publicKey"]
            })
            
            # 设置名字
            await self._send({"type": "set_name", "name": self.name})
            
            # 加载历史
            await self._send({"type": "load_history", "room": self.room, "limit": 20})
            
            # 重置重连延迟
            self.reconnect_delay = 5
            
            # 启动接收循环
            asyncio.create_task(self._receive_loop())
            
            return True
        except Exception as e:
            self.log(f"连接失败: {e}")
            return False
    
    async def _send(self, message: dict):
        if self.ws:
            await self.ws.send(json.dumps(message))
    
    async def _receive_loop(self):
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    self.log(f"无效消息: {message[:50]}")
        except websockets.exceptions.ConnectionClosed:
            self.log("连接关闭")
            self.running = False
            self.registered = False
            await self._schedule_reconnect()
        except Exception as e:
            self.log(f"接收错误: {e}")
            self.running = False
            self.registered = False
            await self._schedule_reconnect()
    
    async def _handle_message(self, data: dict):
        msg_type = data.get("type")
        
        if msg_type == "welcome":
            self.log(f"欢迎: {data.get('message', '')[:50]}")
        elif msg_type == "agent_registered":
            self.registered = True
            self.log(f"Agent 已注册: {data.get('agentId')}")
        elif msg_type == "name_set":
            self.log(f"名字已设置: {data.get('name')}")
        elif msg_type == "history":
            self.log(f"加载了 {len(data.get('messages', []))} 条历史消息")
        elif msg_type == "message":
            from_name = data.get("from", "unknown")
            content = data.get("content", "")
            verified = data.get("verified", False)
            
            # 检查 @
            if f"@{self.name.lower()}" in content.lower():
                mark = "[verified]" if verified else ""
                self.log(f"被 @{from_name} {mark} 提及: {content[:100]}")
                
                # 触发回调
                if self.message_callback:
                    await self.message_callback(data)
            else:
                self.log(f"{from_name}: {content[:100]}")
        elif msg_type == "join":
            self.log(f"{data.get('from')} 加入")
        elif msg_type == "leave":
            self.log(f"{data.get('from')} 离开")
        elif msg_type == "error":
            self.log(f"错误: {data.get('message')}")
    
    async def chat(self, content: str, use_signature: bool = True):
        if use_signature and self.registered:
            signature = self.identity.sign(content)
            await self._send({
                "type": "signed_message",
                "agentId": self.identity.agent_id,
                "content": content,
                "signature": signature,
                "room": self.room
            })
            self.log(f"发送签名消息: {content[:50]}...")
        else:
            await self._send({
                "type": "chat",
                "content": content,
                "room": self.room
            })
            self.log(f"发送: {content[:50]}...")
    
    async def reply(self, to: str, content: str):
        await self.chat(f"@{to} {content}")
    
    async def _schedule_reconnect(self):
        """指数退避重连"""
        self.log(f"{self.reconnect_delay}秒后重连...")
        await asyncio.sleep(self.reconnect_delay)
        
        self.log("尝试重连...")
        success = await self.connect()
        
        if not success:
            # 指数退避
            self.reconnect_delay = min(
                self.reconnect_delay * self.reconnect_factor,
                self.max_reconnect_delay
            )
            await self._schedule_reconnect()
    
    async def close(self):
        self.running = False
        if self.ws:
            await self.ws.close()
            self.log("连接已关闭")


async def main():
    print("=" * 60)
    print("Co Persistent Client - 持续在线模式")
    print("=" * 60)
    
    client = CoPersistentClient(name="Co")
    
    # 设置消息回调
    async def on_mention(data):
        from_name = data.get("from", "unknown")
        content = data.get("content", "")
        # 可以添加自动回复逻辑
        # await client.reply(from_name, "收到!")
    
    client.message_callback = on_mention
    
    # 连接
    if await client.connect():
        client.log("开始监听消息...")
    
    # 处理退出信号
    def signal_handler(sig, frame):
        client.log("收到退出信号")
        client.running = False
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 保持运行
    while client.running:
        await asyncio.sleep(1)
    
    await client.close()


if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
