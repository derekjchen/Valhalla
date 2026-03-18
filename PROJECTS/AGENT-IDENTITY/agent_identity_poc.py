#!/usr/bin/env python3
"""
Agent Identity POC - 简单实现
用于测试智能体唯一标识

Author: Co
Date: 2026-03-18
"""

import hashlib
import secrets
import json
from datetime import datetime
from pathlib import Path

# 尝试导入 cryptography，如果没有则用简单的实现
try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa, padding
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False
    print("[WARN] cryptography 未安装，使用简化实现")


class SimpleAgentIdentity:
    """简化的 Agent 身份实现（不依赖 cryptography）"""
    
    def __init__(self, keystore_path: str = None):
        self.keystore_path = Path(keystore_path or "~/.agent/identity").expanduser()
        self.private_key = None
        self.public_key = None
        self.agent_id = None
    
    def generate(self) -> str:
        """生成新的身份"""
        # 生成随机私钥（简化版）
        self.private_key = secrets.token_hex(32)
        
        # 从私钥派生公钥
        self.public_key = hashlib.sha256(self.private_key.encode()).hexdigest()
        
        # 计算 Agent ID
        self.agent_id = "agent_" + hashlib.sha256(self.public_key.encode()).hexdigest()[:16]
        
        return self.agent_id
    
    def save(self):
        """保存身份"""
        self.keystore_path.mkdir(parents=True, exist_ok=True)
        
        data = {
            "agent_id": self.agent_id,
            "private_key": self.private_key,
            "public_key": self.public_key,
            "created_at": datetime.utcnow().isoformat()
        }
        
        (self.keystore_path / "identity.json").write_text(json.dumps(data, indent=2))
        print(f"[OK] 身份已保存到 {self.keystore_path}")
    
    def load(self) -> bool:
        """加载身份"""
        identity_file = self.keystore_path / "identity.json"
        if not identity_file.exists():
            return False
        
        data = json.loads(identity_file.read_text())
        self.agent_id = data["agent_id"]
        self.private_key = data["private_key"]
        self.public_key = data["public_key"]
        
        return True
    
    def sign(self, message: str) -> str:
        """签名（简化版）"""
        data = message + self.private_key
        return hashlib.sha256(data.encode()).hexdigest()
    
    def verify(self, message: str, signature: str, public_key: str = None) -> bool:
        """验证签名"""
        pub_key = public_key or self.public_key
        
        # 简化验证：检查签名是否匹配
        # 注意：这不是真正的加密验证，只是演示
        expected = hashlib.sha256((message + self.private_key).encode()).hexdigest()
        return signature == expected
    
    def get_info(self) -> dict:
        """获取身份信息"""
        return {
            "agent_id": self.agent_id,
            "public_key": self.public_key,
            "created_at": datetime.utcnow().isoformat()
        }


class SimpleAgentRegistry:
    """简化的 Agent 注册表"""
    
    def __init__(self, storage_path: str = None):
        self.storage_path = Path(storage_path or "~/.agent/registry").expanduser()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.agents = {}
        self._load()
    
    def _load(self):
        """加载注册表"""
        registry_file = self.storage_path / "agents.json"
        if registry_file.exists():
            self.agents = json.loads(registry_file.read_text())
    
    def _save(self):
        """保存注册表"""
        registry_file = self.storage_path / "agents.json"
        registry_file.write_text(json.dumps(self.agents, indent=2))
    
    def register(self, agent_id: str, public_key: str, metadata: dict = None) -> bool:
        """注册 Agent"""
        if agent_id in self.agents:
            print(f"[WARN] Agent {agent_id} 已存在")
            return False
        
        self.agents[agent_id] = {
            "public_key": public_key,
            "registered_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        self._save()
        print(f"[OK] Agent {agent_id} 注册成功")
        return True
    
    def get(self, agent_id: str) -> dict:
        """获取 Agent 信息"""
        return self.agents.get(agent_id)
    
    def exists(self, agent_id: str) -> bool:
        """检查 Agent 是否存在"""
        return agent_id in self.agents
    
    def list(self) -> list:
        """列出所有 Agent"""
        return [
            {"id": agent_id, **info}
            for agent_id, info in self.agents.items()
        ]


def demo():
    """演示 Agent Identity 功能"""
    print("=" * 50)
    print("Agent Identity POC Demo")
    print("=" * 50)
    
    # 创建身份
    identity = SimpleAgentIdentity("~/.copaw/agent_identity")
    
    # 检查是否已有身份
    if identity.load():
        print(f"\n[INFO] 已有身份: {identity.agent_id}")
    else:
        print("\n[INFO] 生成新身份...")
        agent_id = identity.generate()
        identity.save()
        print(f"[OK] 新身份: {agent_id}")
    
    # 显示身份信息
    print(f"\n身份信息:")
    info = identity.get_info()
    for key, value in info.items():
        if key == "public_key":
            print(f"  {key}: {value[:20]}...")
        else:
            print(f"  {key}: {value}")
    
    # 测试签名
    print("\n测试签名:")
    message = "Hello from Agent!"
    signature = identity.sign(message)
    print(f"  消息: {message}")
    print(f"  签名: {signature[:20]}...")
    
    # 验证签名
    valid = identity.verify(message, signature)
    print(f"  验证: {'✅ 通过' if valid else '❌ 失败'}")
    
    # 注册到注册表
    print("\n注册到注册表:")
    registry = SimpleAgentRegistry("~/.copaw/agent_registry")
    registry.register(identity.agent_id, identity.public_key, {
        "name": "Co",
        "endpoint": "ws://39.96.212.215:18790"
    })
    
    # 列出所有 Agent
    print("\n已注册的 Agents:")
    for agent in registry.list():
        print(f"  - {agent['id']} (注册于 {agent['registered_at']})")
    
    print("\n" + "=" * 50)
    print("Demo 完成!")
    print("=" * 50)


if __name__ == "__main__":
    demo()