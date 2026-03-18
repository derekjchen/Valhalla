# Agent Identity System - 详细设计文档 v2

> **Author:** Co  
> **Date:** 2026-03-18  
> **Status:** 📋 等待讨论

---

## 1. 问题定义

### 1.1 核心问题

**如何唯一标识一个智能体？**

| 场景 | 问题 |
|------|------|
| 同名智能体 | 多个 "Co" 如何区分？ |
| 容器复制 | Docker 复制后是同一个还是新的？ |
| 身份冒充 | 如何防止 Agent A 冒充 Agent B？ |
| 身份共享 | 两个智能体能否共用一个 ID？ |

### 1.2 需求

- **Globally Unique**: 全球唯一
- **Immutable**: 创建后不可变
- **Verifiable**: 可被第三方验证
- **Anti-spoofing**: 防伪造
- **Anti-replay**: 防重放攻击

---

## 2. 方案对比

### 2.1 方案概览

| 方案 | 复杂度 | 安全性 | 去中心化 | 推荐场景 |
|------|--------|--------|----------|----------|
| A. 硬件指纹 | ⭐ | ⭐⭐ | ✅ | 单机/信任环境 |
| B. PKI 信任链 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ | 企业/有信任中心 |
| C. 去中心化注册表 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | 多 Agent 协作 |
| D. 区块链 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | 全球 Agent 网络 |

---

## 3. 推荐方案: 混合架构

### 3.1 设计思路

结合方案 B (PKI) 和方案 C (去中心化注册表):

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Identity System                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │   Agent      │────▶│   Registry   │◀────│  Verifier    │ │
│  │  (Private    │     │  (Public     │     │  (Any third  │ │
│  │   Key)       │     │   Key Store) │     │   party)     │ │
│  └──────────────┘     └──────────────┘     └──────────────┘ │
│         │                    │                    │          │
│         │    Register        │     Verify         │          │
│         └────────────────────┴────────────────────┘          │
│                                                              │
│  Agent ID = Hash(Public Key)                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Agent ID 结构

```json
{
  "id": "agent_0x7f3a9b2c1d4e5f6a",
  "display_name": "Co",
  "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...",
  "created_at": "2026-03-18T00:00:00Z",
  "fingerprint": {
    "container_id": "abc123...",
    "host_hash": "sha256:def456..."
  },
  "metadata": {
    "version": "1.0",
    "capabilities": ["chat", "code", "memory"],
    "endpoint": "ws://39.96.212.215:18790"
  },
  "certificate": {
    "issuer": "derek_ca",
    "serial": "12345",
    "valid_from": "2026-03-18",
    "valid_to": "2027-03-18",
    "signature": "..."
  }
}
```

### 3.3 注册流程

```
Step 1: Agent 启动
        │
        ▼
Step 2: 检查本地是否有私钥
        │
        ├── 有 ──▶ 使用现有私钥
        │
        └── 无 ──▶ 生成新的公私钥对
                        │
                        ▼
Step 3: 计算 Agent ID = Hash(Public Key)
        │
        ▼
Step 4: 向 Registry 查询 ID 是否已注册
        │
        ├── 已注册 ──▶ 检查证书是否有效
        │                    │
        │                    ├── 有效 ──▶ 正常使用
        │                    │
        │                    └── 无效 ──▶ 重新申请证书
        │
        └── 未注册 ──▶ 向 Registry 注册
                              │
                              ▼
                    Step 5: 向 Derek (CA) 申请证书
                              │
                              ▼
                    Step 6: Derek 验证后签发证书
                              │
                              ▼
                    Step 7: 保存证书，开始使用
```

### 3.4 身份验证流程

```
Agent A                          Registry                    Agent B
   │                                │                           │
   │ 1. Hello, I'm agent_0x7f3a... │                           │
   │───────────────────────────────▶│                           │
   │                                │                           │
   │ 2. Challenge: Sign this nonce │                           │
   │◀───────────────────────────────│                           │
   │                                │                           │
   │ 3. Signature(nonce, private_key)                          │
   │───────────────────────────────▶│                           │
   │                                │                           │
   │ 4. Verify signature with public_key                       │
   │                                │                           │
   │ 5. Verified! ✅                │                           │
   │◀───────────────────────────────│                           │
   │                                │                           │
   │                                │  6. Agent A is verified   │
   │                                │──────────────────────────▶│
   │                                │                           │
```

---

## 4. 核心组件

### 4.1 Agent Keypair

```python
# agent_identity.py

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.backends import default_backend
import hashlib
import json
from datetime import datetime
from pathlib import Path

class AgentIdentity:
    """Agent 身份管理"""
    
    def __init__(self, keystore_path: str = None):
        self.keystore_path = Path(keystore_path or "~/.agent/identity")
        self.private_key = None
        self.public_key = None
        self.agent_id = None
        
    def generate(self) -> str:
        """生成新的身份"""
        # 生成 RSA 密钥对
        self.private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        self.public_key = self.private_key.public_key()
        
        # 计算 Agent ID
        pub_bytes = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.agent_id = "agent_" + hashlib.sha256(pub_bytes).hexdigest()[:16]
        
        return self.agent_id
    
    def save(self, password: str = None):
        """保存身份到文件"""
        self.keystore_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 加密私钥
        encryption = serialization.NoEncryption()
        if password:
            encryption = serialization.BestAvailableEncryption(
                password.encode()
            )
        
        private_bytes = self.private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=encryption
        )
        
        public_bytes = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        # 保存
        (self.keystore_path / "private.pem").write_bytes(private_bytes)
        (self.keystore_path / "public.pem").write_bytes(public_bytes)
        
        # 保存元数据
        metadata = {
            "agent_id": self.agent_id,
            "created_at": datetime.utcnow().isoformat()
        }
        (self.keystore_path / "metadata.json").write_text(json.dumps(metadata))
    
    def load(self, password: str = None) -> bool:
        """从文件加载身份"""
        try:
            private_path = self.keystore_path / "private.pem"
            public_path = self.keystore_path / "public.pem"
            
            if not private_path.exists():
                return False
            
            # 加载私钥
            private_bytes = private_path.read_bytes()
            self.private_key = serialization.load_pem_private_key(
                private_bytes,
                password=password.encode() if password else None,
                backend=default_backend()
            )
            
            self.public_key = self.private_key.public_key()
            
            # 加载元数据
            metadata = json.loads(
                (self.keystore_path / "metadata.json").read_text()
            )
            self.agent_id = metadata["agent_id"]
            
            return True
        except Exception as e:
            print(f"加载身份失败: {e}")
            return False
    
    def sign(self, message: bytes) -> bytes:
        """签名"""
        return self.private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
    
    def verify(self, message: bytes, signature: bytes) -> bool:
        """验签"""
        try:
            self.public_key.verify(
                signature,
                message,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            return True
        except:
            return False
    
    def get_public_key_pem(self) -> str:
        """获取 PEM 格式公钥"""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode()
```

### 4.2 Agent Registry

```python
# agent_registry.py

import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict

class AgentRegistry:
    """Agent 注册表"""
    
    def __init__(self, storage_path: str = None):
        self.storage_path = Path(storage_path or "~/.agent/registry")
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.agents: Dict[str, dict] = {}
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
            return False  # 已存在
        
        self.agents[agent_id] = {
            "public_key": public_key,
            "registered_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        self._save()
        return True
    
    def get(self, agent_id: str) -> Optional[dict]:
        """获取 Agent 信息"""
        return self.agents.get(agent_id)
    
    def exists(self, agent_id: str) -> bool:
        """检查 Agent 是否存在"""
        return agent_id in self.agents
    
    def list(self) -> list:
        """列出所有 Agent"""
        return [
            {
                "id": agent_id,
                **info
            }
            for agent_id, info in self.agents.items()
        ]
```

### 4.3 挑战-响应验证

```python
# agent_auth.py

import secrets
import hashlib
from datetime import datetime, timedelta

class AgentAuth:
    """Agent 身份验证"""
    
    def __init__(self, registry: AgentRegistry):
        self.registry = registry
        self.challenges = {}  # agent_id -> { nonce, expires }
    
    def create_challenge(self, agent_id: str) -> str:
        """创建挑战"""
        nonce = secrets.token_hex(32)
        expires = datetime.utcnow() + timedelta(minutes=5)
        
        self.challenges[agent_id] = {
            "nonce": nonce,
            "expires": expires
        }
        
        return nonce
    
    def verify_response(self, agent_id: str, signature: bytes) -> bool:
        """验证响应"""
        # 检查挑战是否存在
        challenge = self.challenges.get(agent_id)
        if not challenge:
            return False
        
        # 检查是否过期
        if datetime.utcnow() > challenge["expires"]:
            del self.challenges[agent_id]
            return False
        
        # 获取 Agent 公钥
        agent_info = self.registry.get(agent_id)
        if not agent_info:
            return False
        
        # 验证签名
        from cryptography.hazmat.primitives import serialization
        public_key = serialization.load_pem_public_key(
            agent_info["public_key"].encode()
        )
        
        try:
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.asymmetric import padding
            
            public_key.verify(
                signature,
                challenge["nonce"].encode(),
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            
            # 清除已使用的挑战
            del self.challenges[agent_id]
            return True
        except:
            return False
```

---

## 5. 与群聊系统集成

### 5.1 修改点

1. **服务器端**: 添加身份验证中间件
2. **客户端**: 使用 Agent ID 替代 guest 名字
3. **消息格式**: 添加签名字段

### 5.2 消息格式扩展

```json
{
  "type": "chat",
  "from": "agent_0x7f3a9b2c",
  "display_name": "Co",
  "content": "大家好！",
  "room": "co-claw-derek",
  "timestamp": "2026-03-18T00:00:00Z",
  "signature": "...",
  "public_key": "..."
}
```

---

## 6. 安全考虑

### 6.1 攻击与防御

| 攻击 | 防御机制 |
|------|----------|
| 身份冒充 | 私钥签名验证 |
| 重放攻击 | 挑战-响应 + nonce + 时间戳 |
| 中间人攻击 | TLS + 证书验证 |
| 私钥泄露 | 密码加密存储 + 证书吊销 |

### 6.2 私钥保护

```python
# 私钥存储时加密
identity.save(password="strong_password_here")

# 或使用硬件安全模块 (HSM)
# 或使用环境变量
import os
password = os.environ.get("AGENT_KEY_PASSWORD")
```

---

## 7. 实现计划

### Phase 1: MVP (本周)

- [x] 设计文档
- [ ] AgentIdentity 类实现
- [ ] 本地注册表实现
- [ ] 基本验证流程

### Phase 2: 集成 (下周)

- [ ] 集成到群聊系统
- [ ] 集成到 CoPaw
- [ ] 测试验证

### Phase 3: 增强 (未来)

- [ ] Derek CA 签发证书
- [ ] 证书吊销机制
- [ ] 多租户支持

---

## 8. 讨论

待 Claw 和 Derek 确认：

1. **方案选择**: 混合架构是否合适？
2. **CA 角色**: Derek 作为根 CA 是否合适？
3. **注册表位置**: 放在哪里？谁维护？
4. **私钥保护**: 用什么方式保护私钥？

---

**Author:** Co  
**Last Updated:** 2026-03-18 07:15