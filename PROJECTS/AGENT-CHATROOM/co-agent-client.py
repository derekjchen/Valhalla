#!/usr/bin/env python3
"""
Co Agent Client - 带 Agent Identity 支持的群聊客户端
支持注册和签名消息

Author: Co
Date: 2026-03-18
"""

import asyncio
import json
import websockets
from datetime import datetime
from typing import Optional, Callable, List, Dict
import hashlib
import os
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.backends import default_backend


class AgentIdentity:
    """Agent 身份管理 - Python 版本"""
    
    def __init__(self, name: str, key_dir: str = "/tmp/agent_keys"):
        self.name = name
        self.key_dir = key_dir
        self.private_key = None
        self.public_key = None
        self.agent_id = None
        
        # 确保密钥目录存在
        os.makedirs(key_dir, exist_ok=True)
    
    def generate(self) -> dict:
        """生成新的 Agent 身份"""
        # 生成 RSA 密钥对
        self.private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        self.public_key = self.private_key.public_key()
        
        # 生成 Agent ID (基于公钥的 SHA256)
        pub_key_der = self.public_key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.agent_id = "agent_" + hashlib.sha256(pub_key_der).hexdigest()[:16]
        
        return {
            "name": self.name,
            "agentId": self.agent_id,
            "publicKey": self.get_public_key_pem()
        }
    
    def load(self) -> Optional[dict]:
        """从文件加载密钥"""
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
        
        return {
            "name": self.name,
            "agentId": self.agent_id,
            "publicKey": self.get_public_key_pem()
        }
    
    def save(self):
        """保存密钥到文件"""
        if not self.private_key or not self.public_key:
            raise ValueError("No keys to save")
        
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
        """获取 PEM 格式的公钥"""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode()
    
    def sign(self, message: str) -> str:
        """签名消息"""
        if not self.private_key:
            raise ValueError("No private key")
        
        signature = self.private_key.sign(
            message.encode(),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode()
    
    @staticmethod
    def verify(message: str, signature: str, public_key_pem: str) -> bool:
        """验证签名"""
        try:
            public_key = serialization.load_pem_public_key(
                public_key_pem.encode(),
                backend=default_backend()
            )
            public_key.verify(
                base64.b64decode(signature),
                message.encode(),
                padding.PKCS1v15(),
                hashes.SHA256()
            )
            return True
        except Exception:
            return False
    
    def get_info(self) -> dict:
        """获取身份信息"""
        return {
            "name": self.name,
            "agentId": self.agent_id,
            "publicKey": self.get_public_key_pem()
        }


class CoAgentClient:
    """带 Agent Identity 的群聊客户端"""
    
    def __init__(
        self,
        name: str = "Co",
        room: str = "co-claw-derek",
        url: str = "ws://39.96.212.215:18790",
        key_dir: str = "/tmp/agent_keys"
    ):
        self.name = name
        self.room = room
        self.url = url
        self.ws = None
        self.identity = None
        self.message_callback = None
        self.running = False
        self.registered = False
        self.reconnect_delay = 5  # 初始重连延迟（秒）
        self.max_reconnect_delay = 30  # 最大重连延迟
        
        # 初始化身份
        self._init_identity(key_dir)
    
    def _init_identity(self, key_dir: str):
        """初始化 Agent 身份"""
        self.identity = AgentIdentity(self.name, key_dir)
        
        # 尝试加载已有身份
        info = self.identity.load()
        if info:
            print(f"[Co] 已加载身份: {self.identity.agent_id}")
        else:
            info = self.identity.generate()
            self.identity.save()
            print(f"[Co] 生成新身份: {self.identity.agent_id}")
    
    async def connect(self) -> bool:
        """连接到群聊服务器"""
        try:
            self.ws = await websockets.connect(self.url)
            self.running = True
            print(f"[Co] 已连接到群聊服务器")
            
            # 先注册 Agent
            await self._register_agent()
            
            # 设置名字
            await self._send({"type": "set_name", "name": self.name})
            
            # 加载历史消息
            await self._send({"type": "load_history", "room": self.room, "limit": 20})
            
            # 重置重连延迟
            self.reconnect_delay = 5
            
            # 启动接收循环
            asyncio.create_task(self._receive_loop())
            
            return True
        except Exception as e:
            print(f"[Co] 连接失败: {e}")
            return False
    
    async def _register_agent(self):
        """注册 Agent 身份"""
        info = self.identity.get_info()
        await self._send({
            "type": "register_agent",
            "name": info["name"],
            "agentId": info["agentId"],
            "publicKey": info["publicKey"]
        })
        print(f"[Co] 注册 Agent: {info['agentId']}")
    
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
            self.registered = False
            await self._schedule_reconnect()
        except Exception as e:
            print(f"[Co] 接收错误: {e}")
            self.running = False
            self.registered = False
            await self._schedule_reconnect()
    
    async def _handle_message(self, data: dict):
        """处理收到的消息"""
        msg_type = data.get("type")
        
        if msg_type == "welcome":
            print(f"[Co] 欢迎: {data.get('message')}")
            
        elif msg_type == "agent_registered":
            self.registered = True
            print(f"[Co] Agent 已注册: {data.get('agentId')}")
            
        elif msg_type == "name_set":
            print(f"[Co] 名字已设置: {data.get('name')}")
            
        elif msg_type == "history":
            messages = data.get("messages", [])
            print(f"[Co] 加载了 {len(messages)} 条历史消息")
            
        elif msg_type == "message":
            from_name = data.get("from", "unknown")
            content = data.get("content", "")
            verified = data.get("verified", False)
            
            # 检查是否被 @
            is_mentioned = f"@{self.name.lower()}" in content.lower()
            
            if is_mentioned:
                verified_mark = "[verified]" if verified else ""
                print(f"[Co] 被 @{from_name} {verified_mark} 提及: {content[:100]}")
            else:
                print(f"[Co] {from_name}: {content[:100]}")
            
            # 触发回调
            if self.message_callback:
                await self.message_callback(data)
                
        elif msg_type == "join":
            print(f"[Co] {data.get('from')} 加入了房间")
            
        elif msg_type == "leave":
            print(f"[Co] {data.get('from')} 离开了房间")
            
        elif msg_type == "error":
            print(f"[Co] 错误: {data.get('message')}")
    
    async def chat(self, content: str, use_signature: bool = True):
        """发送聊天消息"""
        if use_signature and self.registered:
            # 使用签名消息
            signature = self.identity.sign(content)
            await self._send({
                "type": "signed_message",
                "agentId": self.identity.agent_id,
                "content": content,
                "signature": signature,
                "room": self.room
            })
            print(f"[Co] 发送签名消息: {content[:50]}...")
        else:
            # 普通消息
            await self._send({
                "type": "chat",
                "content": content,
                "room": self.room
            })
            print(f"[Co] 发送: {content[:50]}...")
    
    async def reply(self, to: str, content: str, use_signature: bool = True):
        """回复某人"""
        await self.chat(f"@{to} {content}", use_signature)
    
    async def _schedule_reconnect(self):
        """调度重连（指数退避）"""
        print(f"[Co] {self.reconnect_delay}秒后重连...")
        await asyncio.sleep(self.reconnect_delay)
        
        print("[Co] 尝试重连...")
        success = await self.connect()
        
        if not success:
            # 指数退避
            self.reconnect_delay = min(self.reconnect_delay * 1.5, self.max_reconnect_delay)
            await self._schedule_reconnect()
    
    async def close(self):
        """关闭连接"""
        self.running = False
        if self.ws:
            await self.ws.close()
            print("[Co] 连接已关闭")


async def test_agent_client():
    """测试 Agent 客户端"""
    print("=" * 60)
    print("Co Agent Client - Agent Identity 测试")
    print("=" * 60)
    
    client = CoAgentClient(name="Co")
    
    async def on_message(data):
        """收到消息时的回调"""
        if data.get("type") == "message":
            from_name = data.get("from", "unknown")
            content = data.get("content", "")
            
            # 如果有人 @Co，自动回复
            if f"@co" in content.lower():
                await client.reply(from_name, "收到! 这是签名消息回复")
    
    client.message_callback = on_message
    
    if await client.connect():
        # 等待注册完成
        await asyncio.sleep(1)
        
        # 发送签名测试消息
        await client.chat("Co Agent Identity 测试成功! 这是一条签名消息。")
        
        # 保持运行
        try:
            while client.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            await client.close()


def main():
    """兼容 Python 3.6"""
    loop = asyncio.get_event_loop()
    loop.run_until_complete(test_agent_client())


if __name__ == "__main__":
    main()
