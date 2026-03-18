# Chatroom Channel for CoPaw
# 让 Co 能持续在线参与群聊

from typing import Optional, Callable, AsyncIterator, Any, Dict, List
import asyncio
import json
import websockets
from datetime import datetime
import logging

from copaw.app.channels.base import BaseChannel
from copaw.app.channels.schema import ChannelType

logger = logging.getLogger(__name__)


class ChatroomChannel(BaseChannel):
    """
    Agent Chatroom Channel
    
    让 Co 通过 WebSocket 持续连接群聊服务器，实时接收和发送消息。
    
    配置示例 (config.yaml):
        channels:
          chatroom:
            enabled: true
            url: "ws://39.96.212.215:18790"
            room: "co-claw-derek"
            name: "Co"
    """
    
    channel = "chatroom"  # 自定义 channel 类型
    
    # 不使用 manager 队列，我们自己管理 WebSocket 连接
    uses_manager_queue: bool = False
    
    def __init__(
        self,
        process: Callable[[Any], AsyncIterator[Any]],
        on_reply_sent: Optional[Callable[[str, str, str], None]] = None,
        url: str = "ws://39.96.212.215:18790",
        room: str = "co-claw-derek",
        name: str = "Co",
        **kwargs
    ):
        super().__init__(process, on_reply_sent, **kwargs)
        
        self.url = url
        self.room = room
        self.name = name
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.running = False
        self._receive_task: Optional[asyncio.Task] = None
        
    async def start(self):
        """启动 WebSocket 连接"""
        logger.info(f"[Chatroom] 正在连接到 {self.url}...")
        
        try:
            self.ws = await websockets.connect(self.url)
            self.running = True
            
            # 设置名字
            await self._send({"type": "set_name", "name": self.name})
            
            # 加载历史消息
            await self._send({"type": "load_history", "room": self.room, "limit": 20})
            
            # 发送上线消息
            await self.chat(f"🤖 {self.name} 已上线！")
            
            # 启动接收循环
            self._receive_task = asyncio.create_task(self._receive_loop())
            
            logger.info(f"[Chatroom] 已连接，名字: {self.name}, 房间: {self.room}")
            
        except Exception as e:
            logger.error(f"[Chatroom] 连接失败: {e}")
            self.running = False
            raise
    
    async def stop(self):
        """停止连接"""
        self.running = False
        if self._receive_task:
            self._receive_task.cancel()
        if self.ws:
            await self.ws.close()
            logger.info("[Chatroom] 连接已关闭")
    
    async def _send(self, message: dict):
        """发送消息"""
        if self.ws:
            await self.ws.send(json.dumps(message))
    
    async def chat(self, content: str, mentions: List[str] = None):
        """发送聊天消息"""
        await self._send({
            "type": "chat",
            "content": content,
            "room": self.room,
            "mentions": mentions or []
        })
        logger.debug(f"[Chatroom] 发送: {content[:50]}...")
    
    async def _receive_loop(self):
        """持续接收消息"""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    logger.warning(f"[Chatroom] 无效消息: {message[:100]}")
        except websockets.exceptions.ConnectionClosed:
            logger.info("[Chatroom] 连接关闭")
            self.running = False
        except asyncio.CancelledError:
            logger.info("[Chatroom] 接收循环被取消")
        except Exception as e:
            logger.error(f"[Chatroom] 接收错误: {e}")
            self.running = False
    
    async def _handle_message(self, data: dict):
        """处理收到的消息"""
        msg_type = data.get("type")
        
        if msg_type == "message":
            await self._handle_chat_message(data)
        elif msg_type == "join":
            logger.info(f"[Chatroom] 🚪 {data.get('from')} 加入了房间")
        elif msg_type == "leave":
            logger.info(f"[Chatroom] 🚪 {data.get('from')} 离开了房间")
        elif msg_type == "history":
            count = len(data.get("messages", []))
            logger.info(f"[Chatroom] 加载了 {count} 条历史消息")
        elif msg_type == "error":
            logger.error(f"[Chatroom] 错误: {data.get('message')}")
    
    async def _handle_chat_message(self, data: dict):
        """处理聊天消息"""
        from_name = data.get("from", "unknown")
        content = data.get("content", "")
        mentions = data.get("mentions", [])
        
        # 忽略自己发送的消息
        if from_name == self.name:
            return
        
        # 检查是否被 @
        is_mentioned = any(
            f"@{self.name.lower()}" in content.lower()
            for _ in [1]
        ) or any(
            f"@{self.name.lower()}" in m.lower()
            for m in mentions
        )
        
        if is_mentioned:
            logger.info(f"[Chatroom] 📣 被 @{from_name} 提及: {content}")
            
            # 创建 AgentRequest 并触发处理
            await self._process_message(from_name, content)
        else:
            logger.debug(f"[Chatroom] 💬 {from_name}: {content[:50]}...")
    
    async def _process_message(self, from_name: str, content: str):
        """处理消息并生成回复"""
        try:
            # 创建简单的请求对象
            request = {
                "user_id": from_name,
                "session_id": f"chatroom-{self.room}",
                "content": content,
                "channel": "chatroom",
                "metadata": {
                    "room": self.room,
                    "from": from_name
                }
            }
            
            # 调用 process 处理
            response_text = None
            async for event in self._process(request):
                if hasattr(event, 'content') and event.content:
                    for part in event.content:
                        if hasattr(part, 'text'):
                            response_text = part.text
                            break
            
            # 发送回复
            if response_text:
                await self.chat(f"@{from_name} {response_text}", mentions=[f"@{from_name}"])
            
        except Exception as e:
            logger.error(f"[Chatroom] 处理消息失败: {e}")
            await self.chat(f"@{from_name} 抱歉，处理消息时出错: {str(e)[:50]}")
    
    async def consume_one(self):
        """
        实现 BaseChannel 的 consume_one 方法
        由于我们使用自己的 WebSocket 连接，这个方法返回 None
        """
        return None


# Channel 注册
def get_channel_class():
    """返回 Channel 类"""
    return ChatroomChannel