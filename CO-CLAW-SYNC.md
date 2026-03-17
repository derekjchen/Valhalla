# CoPaw ↔ OpenClaw 记忆同步协议

> **起草者:** Claw (OpenClaw)  
> **版本:** v0.2 (更新版)  
> **日期:** 2026-03-17  
> **参与讨论:** Derek (设计者), Co (CoPaw), Claw (OpenClaw)

---

## 一、背景与目标

### 背景
- **CoPaw (Co)**: Python + AgentScope，Memory V3 架构（四维分层：原子/语义/场景/偏好）
- **OpenClaw (Claw)**: Node.js + OpenClaw，文件系统记忆（`MEMORY.md` + `memory/YYYY-MM-DD.md`）
- **共同用户**: Derek (Asia/Shanghai)

### 目标
1. **避免信息孤岛** — 两边学到的东西能互通
2. **保持架构独立** — 不强制统一技术栈，只定义交换格式
3. **异步优先** — 通过文件/API 异步同步，不依赖实时通信
4. **人类可读** — 同步文件本身也可由 Derek 直接阅读

---

## 二、记忆模型对比

| 层级 | CoPaw Memory V3 | OpenClaw | 映射关系 |
|------|-----------------|----------|----------|
| **原子层** | 原始对话 + 时序索引 | `memory/YYYY-MM-DD.md` (原始日志) | ✅ 直接映射 |
| **语义层** | 实体提取 + 关系图谱 | `MEMORY.md` ( curated 记忆) | ⚠️ 需结构化 |
| **场景层** | 场景标签 + 上下文快照 | 无显式场景，按日期组织 | 🔶 需补充场景元数据 |
| **偏好层** | 偏好演化 (changes 数组) | 无独立偏好层，混在 `MEMORY.md` | 🔶 需新增结构 |

---

## 三、同步协议设计

### 3.1 同步方向

```
┌─────────────┐         ┌─────────────┐
│   CoPaw     │ ←────→  │  OpenClaw   │
│  (Memory V3)│  双向   │ (File-based)│
└─────────────┘  同步    └─────────────┘
       ↓                       ↓
┌─────────────────────────────────────┐
│     共享同步文件 (JSON + Markdown)   │
│     /workspace/SHARED-MEMORY/       │
└─────────────────────────────────────┘
```

### 3.2 文件格式

**方案 A: JSON (推荐)**
```json
{
  "schema": "co-claw-sync.v1",
  "source": "copaw|openclaw",
  "timestamp": "2026-03-17T21:30:00+08:00",
  "entries": [
    {
      "id": "uuid-or-hash",
      "type": "fact|preference|event|decision",
      "content": "人类可读的描述",
      "shared": true,
      "privacy": {
        "level": "public|internal|confidential",
        "reason": "工作机密，不同步" 
      },
      "structured": {
        "entities": ["Derek", "CoPaw", "Memory V3"],
        "tags": ["memory", "architecture", "preference"],
        "scene": "development|personal|decision",
        "confidence": 0.95
      },
      "temporal": {
        "first_seen": "2026-03-17",
        "last_seen": "2026-03-17",
        "frequency": 1
      },
      "preference_delta": {
        "type": "reinforce|override|decay",
        "field": "tech_stack",
        "old_value": "Python",
        "new_value": "Node.js",
        "reason": "用户选择 OpenClaw 处理个人场景"
      }
    }
  ]
}
```

**隐私标记说明:**
| 字段 | 类型 | 说明 |
|------|------|------|
| `shared` | boolean | `true`=可共享，`false`=私有 (放入 quarantine) |
| `privacy.level` | string | `public`=完全共享，`internal`=仅实例内，`confidential`=不同步 |
| `privacy.reason` | string | 可选，说明为何限制共享 (如"工作机密") |

**处理规则:**
- `shared: true` 或无标记 → 正常同步
- `shared: false` → 移入 `quarantine/` 目录，记录日志但不合并
- `privacy.level: confidential` → 完全跳过，不写入同步文件

**方案 B: Markdown (辅助，人类可读)**
```markdown
# 同步记录 2026-03-17

## 事实
- Derek 使用 Asia/Shanghai 时区
- Co 在 Docker 中运行，通过钉钉接入

## 偏好演化
- **技术栈**: Python → Node.js (场景分工：Co 工作，Claw 个人)
- **记忆系统**: Memory V3 (Co) + 文件系统 (Claw) 共存

## 决策
- 创建共享同步协议，实现双向记忆同步
```

### 3.3 同步目录结构

**ECS-2 共享位置** (由 Derek 确认具体路径):
```
# CoPaw (Docker) 侧
/app/working/storage/shared-memory/   # Co 的共享输出目录

# OpenClaw 侧 (宿主机 workspace)
/home/admin/.openclaw/workspace/SHARED-MEMORY/

# 建议：通过 Docker volume 映射实现共享
# docker run -v /app/working/storage/shared-memory:/workspace/SHARED-MEMORY ...
```

**目录结构:**
```
/workspace/SHARED-MEMORY/
├── sync-inbox/           # 待处理的入站同步
│   ├── from-copaw-2026-03-17.json
│   └── from-openclaw-2026-03-17.json
├── sync-outbox/          # 待发送的出站同步
│   └── to-copaw-2026-03-17.json
├── merged/               # 已合并的共享记忆
│   └── 2026-03.md
├── quarantine/           # 隔离区 (shared=false 或待审核)
│   └── pending-review.json
└── PROTOCOL.md           # 本协议文档
```

### 3.4 同步触发条件

| 触发方式 | CoPaw | OpenClaw | 说明 |
|----------|-------|----------|------|
| **定时 (cron)** | 每日 23:00 | 每日 23:00 | 批量同步当天记忆，默认配置 |
| **事件驱动** | 新记忆写入时 | 新记忆写入时 | 检测到 `shared: true` 立即触发 |
| **手动** | Derek 触发 | Derek 触发 | 强制同步命令 |
| **心跳** | 心跳检查时 | 心跳检查时 | 检查是否有待同步 |

**Cron Job 配置示例:**

```bash
# CoPaw 侧 (ECS-2)
0 23 * * * /app/working/scripts/sync-to-openclaw.sh

# OpenClaw 侧
0 23 * * * cd /home/admin/.openclaw/workspace && node scripts/process-sync-inbox.js
```

**事件驱动伪代码:**
```javascript
// 当新记忆写入时检查
function onMemoryWrite(entry) {
    if (entry.shared === true || entry.shared === undefined) {
        // 默认共享，加入 outbox
        addToOutbox(entry);
        // 可选：立即触发同步而非等待 cron
        if (entry.urgent === true) {
            triggerSyncImmediately();
        }
    } else {
        // 私有记忆，不共享
        log('Private memory, skipping sync');
    }
}
```

---

## 四、冲突解决策略

### 4.1 冲突类型

1. **事实冲突** — 两边记录了矛盾的信息
   - 例：Co 记录 "Derek 喜欢 Python"，Claw 记录 "Derek 喜欢 Node.js"
   - 解决：使用时间戳 + 场景标签，保留两者并标注场景

2. **偏好冲突** — 偏好演化方向相反
   - 例：Co 记录 "reinforce Python"，Claw 记录 "override → Node.js"
   - 解决：保留演化轨迹，不覆盖，用 `preference_delta` 记录变化

3. **重复记录** — 同一事件被两边都记录
   - 解决：通过 `id` 哈希去重（基于 content + timestamp）

### 4.2 合并规则

```
IF 同类型 + 同实体 + 时间差 < 1小时
  → 合并为一条，增加 frequency
ELSE IF 偏好冲突
  → 保留两条，标注场景上下文
ELSE
  → 独立存储
```

---

## 五、实现建议

### 5.1 CoPaw 侧 (Co)

```python
# 伪代码示例
def sync_to_openclaw(entries: List[MemoryEntry]):
    payload = {
        "schema": "co-claw-sync.v1",
        "source": "copaw",
        "timestamp": now_iso(),
        "entries": [entry.to_sync_format() for entry in entries]
    }
    write_to_inbox("/workspace/SHARED-MEMORY/sync-inbox/from-copaw-{}.json".format(today()))
```

### 5.2 OpenClaw 侧 (Claw)

```javascript
// 伪代码示例
async function processSyncInbox() {
    const inboxFiles = await readDir('/workspace/SHARED-MEMORY/sync-inbox/');
    for (const file of inboxFiles) {
        const data = JSON.parse(await readFile(file));
        await mergeIntoMemory(data);
        await moveToFile(file, '/workspace/SHARED-MEMORY/merged/');
    }
}
```

### 5.3 安全考虑

- **权限** — 确保 Co 的 Docker 容器能写入宿主 workspace
- **验证** — 同步文件加 HMAC 签名（可选，防止恶意注入）
- **审计** — 保留所有同步记录，Derek 可随时审查

---

## 六、待确认/待讨论问题

### ✅ 已确认 (Derek 补充)

1. **共享位置**: ECS-2 上 Co 的数据在 `/app/working/storage/`，需通过 Docker volume 映射到共享目录
2. **同步时机**: 支持 cron 定时 + 事件驱动 (新记忆写入时检测 `shared: true`)
3. **隐私标记**: 增加 `shared: true/false` 字段，私有记忆放入 quarantine 隔离区

### 🔶 待 Derek + Co 确认

1. **ECS-2 共享路径** — 具体用哪个目录？建议：
   - Co 侧：`/app/working/storage/shared-memory/`
   - 通过 volume 映射到 OpenClaw：`/home/admin/.openclaw/workspace/SHARED-MEMORY/`

2. **同步频率** — 每日 23:00 一次够吗？还是需要更频繁（如每 6 小时）？

3. **数据量限制** — 每次同步最多多少条？是否需要压缩/摘要？

4. **偏好层优先级** — 如果两边偏好冲突，以谁为准？（建议：按场景分工）

5. **Memory V3 细节** — `changes` 数组的具体格式？Claw 需要适配。

6. **AB 测试容器** — memory-v1-test 和 memory-v2-test 两个容器的数据要同步吗？

### 🔶 给 Claw 自己的 TODO

- [ ] 在本地的 `memory/` 目录中增加场景标签支持
- [ ] 为偏好演化单独创建一个文件（如 `PREFERENCES.md`）
- [ ] 实现 `process-sync-inbox.js` 脚本
- [ ] 添加 cron job 配置

---

## 七、下一步

### 阶段一：基础设施 (Derek 主导)

1. **确认共享路径** — 在 ECS-2 上创建共享目录，配置 Docker volume 映射
2. **权限设置** — 确保 Co 容器能写入共享目录
3. **协议审核** — 审阅本协议 v0.2，确认无遗漏

### 阶段二：CoPaw 侧实现 (Co 主导)

4. **实现导出函数** — 将 Memory V3 条目转为同步 JSON 格式
5. **添加 shared 标记** — 在 Memory V3 中支持 `shared: true/false` 字段
6. **配置 cron job** — 设置定时同步任务 (或通过事件触发)

### 阶段三：OpenClaw 侧实现 (Claw 主导)

7. **实现导入脚本** — `scripts/process-sync-inbox.js`
8. **实现合并逻辑** — 解析同步文件并合并到 `MEMORY.md`
9. **配置 cron job** — 设置定时处理入站同步

### 阶段四：测试与上线

10. **手动测试** — Derek 触发一次完整同步流程
11. **验证合并** — 检查记忆是否正确合并，无冲突
12. **自动化上线** — 启用 cron job，进入正常运行

---

## 附录 A: 示例同步记录

```json
{
  "schema": "co-claw-sync.v1",
  "source": "copaw",
  "timestamp": "2026-03-17T21:00:00+08:00",
  "entries": [
    {
      "id": "sha256:abc123...",
      "type": "preference",
      "content": "用户选择 Claw 处理个人/webchat 场景，Co 处理工作/钉钉场景",
      "structured": {
        "entities": ["Derek", "Claw", "Co"],
        "tags": ["分工", "场景", "偏好"],
        "scene": "decision"
      },
      "temporal": {
        "first_seen": "2026-03-17",
        "last_seen": "2026-03-17",
        "frequency": 1
      },
      "preference_delta": {
        "type": "reinforce",
        "field": "assistant分工",
        "value": "Co=工作/钉钉, Claw=个人/webchat",
        "reason": "基于部署方式和频道特性的自然分工"
      }
    },
    {
      "id": "sha256:def456...",
      "type": "fact",
      "content": "Co 在 Docker 容器 co-dev 中运行，workspace 位于 /workspace/copaw/",
      "structured": {
        "entities": ["Co", "co-dev", "Docker"],
        "tags": ["部署", "环境"],
        "scene": "development"
      },
      "temporal": {
        "first_seen": "2026-03-17",
        "last_seen": "2026-03-17",
        "frequency": 1
      }
    }
  ]
}
```

---

**文档状态:** 🟢 v0.2 已更新 (等待 Derek 确认共享路径)  
**下次更新:** Co 实现完成后更新 v0.3

---

## 附录 B: 快速参考 (给 Co 实现用)

### 同步文件最小可用格式

```json
{
  "schema": "co-claw-sync.v1",
  "source": "copaw",
  "timestamp": "2026-03-17T21:30:00+08:00",
  "entries": [
    {
      "id": "unique-id-or-hash",
      "type": "fact",
      "content": "人类可读的记忆内容",
      "shared": true
    }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `schema` | ✅ | 固定为 `co-claw-sync.v1` |
| `source` | ✅ | `copaw` 或 `openclaw` |
| `timestamp` | ✅ | ISO-8601 格式，带时区 |
| `entries` | ✅ | 同步条目数组 |
| `entries[].id` | ✅ | 唯一标识 (建议 SHA256 哈希) |
| `entries[].type` | ✅ | `fact`/`preference`/`event`/`decision` |
| `entries[].content` | ✅ | 人类可读的描述 |
| `entries[].shared` | ⚠️ | 默认 `true`，`false` 则隔离 |
| `entries[].structured` | ❌ | 可选，结构化元数据 |
| `entries[].temporal` | ❌ | 可选，时间维度信息 |
| `entries[].preference_delta` | ❌ | 可选，偏好变化详情 |

### 输出路径

```
# CoPaw 输出到此目录 (ECS-2)
/app/working/storage/shared-memory/sync-inbox/from-copaw-YYYY-MM-DD.json

# OpenClaw 从此目录读取
/home/admin/.openclaw/workspace/SHARED-MEMORY/sync-inbox/
```
