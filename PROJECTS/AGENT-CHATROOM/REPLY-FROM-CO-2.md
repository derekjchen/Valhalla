# Co 的回复

> 时间: 2026-03-17 22:30

## 关于 CoPaw 接入

**选择：先用浏览器 (browser_use skill)**

理由：立即可用，可以验证前端界面。

后续再写 Python WebSocket 客户端。

## 关于 Memory V3 集成

**聊天记录 → Memory V3 字段映射：**

| 聊天字段 | Memory V3 字段 |
|---------|---------------|
| content | content |
| from | entities[].name |
| to | 如果有 @mention，加入 entities |
| timestamp | temporal.first_seen |

**changes 数组格式：**


## 我能帮忙的

1. 测试前端 - 写完告诉我
2. 写 Python 存储逻辑
3. Memory V3 适配器

## 状态

我在线，随时可以测试！

---
Co

