# Memory V3 测试系统设计

> **项目状态:** 🟡 规划阶段  
> **创建时间:** 2026-03-17 22:35  
> **负责人:** Co (主设计), Claw (协助)  
> **参与者:** Derek (设计者), Co (CoPaw), Claw (OpenClaw)

---

## 项目背景

Derek 提出了关键要求：

> "如何正确的测试出来带记忆系统的 agent 是符合当初的设计初衷的，这个至关重要"

**核心问题:**
1. 如何设计测试方法来验证 Memory V3 符合设计初衷？
2. 如何设计测试数据？
3. 如何进行白盒测试？
4. AB 测试的正确方法是什么？

---

## 目标

1. **验证记忆能力** — 证明 Memory V3 超越了人类记忆的局限
2. **量化指标** — 用数据证明记忆系统的有效性
3. **AB 测试框架** — 科学对比不同版本
4. **白盒测试** — 深入内部逻辑验证

---

## 人类记忆五大局限 (验证目标)

| 局限 | Memory V3 目标 | 测试方法 |
|------|---------------|----------|
| **会遗忘** | 全细节留存 | 回忆测试：询问久远细节 |
| **难关联** | 跨时空关联 | 关联测试：跨时间/场景连接 |
| **易固化** | 动态演化 | 演化测试：偏好变化追踪 |
| **弱多模态** | 多模态留存 | 多模态测试：图片/语音细节 |
| **检索慢** | 毫秒级检索 | 性能测试：检索延迟 |

---

## 测试框架设计

### 层级一：单元测试 (白盒)

**目标:** 验证每个组件的正确性

**测试对象:**
- 实体提取器 (entity_extractor.py)
- 关系提取器 (relation_extractor.py)
- 场景分类器 (scene_classifier.py)
- 语义存储 (semantic_store.py)
- 记忆合成器 (memory_synthesizer.py)

**测试方法:**
```python
# 示例：实体提取测试
def test_extract_person_entity():
    input_text = "Derek 在上海工作，喜欢 Python"
    entities = extractor.extract(input_text)
    assert entities[0].name == "Derek"
    assert entities[0].type == "person"
    assert entities[0].location == "上海"
    assert entities[0].preference == "Python"
```

---

### 层级二：集成测试 (灰盒)

**目标:** 验证组件间协作

**测试场景:**
1. 完整对话 → 实体提取 → 关系图谱 → 存储
2. 偏好变化 → changes 数组 → 记忆更新
3. 跨场景对话 → 场景分类 → 上下文注入

**测试方法:**
```python
# 示例：偏好演化测试
def test_preference_evolution():
    # 第一天：用户说喜欢 Python
    process_dialog("我喜欢用 Python 开发")
    assert get_preference("tech_stack") == "Python"
    
    # 第七天：用户说改用 Node.js
    process_dialog("现在改用 Node.js 了")
    pref = get_preference("preference_evolution")
    assert pref.type == "override"
    assert pref.old_value == "Python"
    assert pref.new_value == "Node.js"
```

---

### 层级三：端到端测试 (黑盒)

**目标:** 验证整体记忆能力

**测试方法:**
1. **回忆测试** — 问久远的问题，看能否准确回忆
2. **关联测试** — 问跨时间/场景的问题，看能否关联
3. **演化测试** — 问偏好变化，看是否理解演化

**示例测试题:**

```
T+0 天：用户说 "我叫 Derek，在上海工作"
T+7 天：用户说 "我上周说了什么？"
期望：回答 "你说你在上海工作"

T+0 天：用户说 "我喜欢 Python"
T+30 天：用户说 "我现在不喜欢 Python 了，改用 Node.js"
T+31 天：用户问 "我喜欢什么编程语言？"
期望：回答 "你现在喜欢 Node.js，但之前喜欢 Python"

T+0 天：场景 A (工作) 讨论 "项目用 SQLite"
T+5 天：场景 B (个人) 讨论 "家里也用 SQLite 吗？"
期望：能关联场景 A 的信息，回答 "工作时用 SQLite，家里不确定"
```

---

### 层级四：AB 测试框架

**目标:** 科学对比不同版本

**AB 测试设计:**

```
┌─────────────────────────────────────────────────┐
│  对照组 (A)          │  实验组 (B)              │
│  Memory V2           │  Memory V3               │
│  - 基础实体提取       │  - 四维分层架构          │
│  - 无演化追踪        │  - 偏好演化              │
│  - 单场景            │  - 场景分类              │
└─────────────────────────────────────────────────┘
              ↓
        同一批测试问题
              ↓
        对比得分
```

**评估维度:**

| 维度 | 权重 | 评分标准 |
|------|------|----------|
| 准确率 | 30% | 回答正确的比例 |
| 完整率 | 25% | 细节留存的比例 |
| 关联能力 | 20% | 跨场景/时间关联正确率 |
| 演化理解 | 15% | 偏好变化理解正确率 |
| 响应速度 | 10% | 检索延迟 |

**测试数据集:**

```python
test_dataset = [
    {
        "id": "recall_001",
        "type": "recall",
        "setup": "用户说'我叫 Derek，在上海'",
        "delay": "7 days",
        "question": "我叫什么？在哪里工作？",
        "expected": {"name": "Derek", "location": "上海"}
    },
    {
        "id": "evolution_001",
        "type": "evolution",
        "setup": [
            ("Day 1", "我喜欢 Python"),
            ("Day 30", "我改用 Node.js 了")
        ],
        "question": "我喜欢什么编程语言？",
        "expected": {
            "current": "Node.js",
            "history": ["Python"],
            "evolution_type": "override"
        }
    },
    # ... 更多测试用例
]
```

---

## 关键测试场景设计

### 场景 1: 遗忘测试 (验证"无遗忘")

**设计:**
```
T+0: 用户提到一个细节 (如"我家猫叫咪咪，3 岁，喜欢抓沙发")
T+7: 问"我家猫叫什么？"
T+30: 问"我家猫喜欢什么？"
T+90: 问"我家猫几岁？"

评分:
- 完全正确：10 分
- 部分正确：5 分
- 错误/遗忘：0 分
```

### 场景 2: 关联测试 (验证"跨时空关联")

**设计:**
```
T+0 场景 A: "我在公司用 MacBook Pro"
T+5 场景 B: "家里用什么电脑？"
T+6: 问"我有哪些电脑？"

期望回答:
- 公司：MacBook Pro
- 家里：未知

评分:
- 区分场景：10 分
- 混淆场景：0 分
```

### 场景 3: 演化测试 (验证"动态演化")

**设计:**
```
T+0: "我喜欢喝美式咖啡"
T+14: "最近改喝拿铁了，美式太苦"
T+15: "我喜欢喝什么咖啡？"

期望回答:
- 现在：拿铁
- 之前：美式
- 变化原因：美式太苦

评分:
- 理解演化：10 分
- 只记最新：5 分
- 只记最早：3 分
- 完全错误：0 分
```

---

## 测试数据集要求

### 规模

| 测试类型 | 最少用例数 | 目标用例数 |
|----------|-----------|-----------|
| 回忆测试 | 50 | 200 |
| 关联测试 | 30 | 100 |
| 演化测试 | 20 | 50 |
| 多模态测试 | 10 | 30 |
| 性能测试 | 1000 次查询 | 10000 次查询 |

### 多样性

- **时间跨度:** 1 天、7 天、30 天、90 天
- **场景类型:** 工作、个人、学习、娱乐
- **实体类型:** 人、地点、组织、技术、偏好
- **演化类型:** reinforce、override、decay

---

## 白盒测试策略

### 代码覆盖率目标

- **行覆盖率:** ≥ 90%
- **分支覆盖率:** ≥ 85%
- **关键路径:** 100%

### 测试工具

```
Python: pytest, coverage.py
Mock: unittest.mock
集成测试：pytest-integration
```

### 示例测试代码

```python
# tests/test_entity_extractor.py
import pytest
from copaw.memory_v2.entity_extractor import EntityExtractor

class TestEntityExtractor:
    def test_extract_person(self):
        extractor = EntityExtractor()
        entities = extractor.extract("Derek 在上海工作")
        assert len(entities) == 2
        assert entities[0].type == "person"
        assert entities[1].type == "location"
    
    def test_extract_with_relationship(self):
        extractor = EntityExtractor()
        entities = extractor.extract("Derek 是 CoPaw 的开发者")
        assert entities[0].relation_to(entities[1]) == "developer_of"
```

---

## 持续集成

### CI/CD 流程

```
代码提交 → 单元测试 → 集成测试 → AB 测试 → 报告
   ↓
GitHub Actions
   ↓
自动生成测试报告
```

### 测试报告模板

```markdown
# Memory V3 测试报告

**日期:** 2026-03-17
**版本:** v3.0.0

## 测试结果

| 测试类型 | 通过率 | 平均分 |
|----------|--------|--------|
| 回忆测试 | 95% | 9.2/10 |
| 关联测试 | 88% | 8.5/10 |
| 演化测试 | 92% | 9.0/10 |

## AB 测试对比

| 维度 | V2 得分 | V3 得分 | 提升 |
|------|--------|--------|------|
| 准确率 | 75% | 92% | +17% |
| 完整率 | 60% | 88% | +28% |
| 关联能力 | 45% | 85% | +40% |

## 问题发现

1. 场景分类在边界情况下准确率下降
2. 长文本实体提取有遗漏

## 改进建议

1. 优化场景分类器阈值
2. 增加实体提取的递归深度
```

---

## 下一步

### 给 Co 的任务

1. **整理现有测试代码** — `tests/` 目录下的测试用例
2. **设计 AB 测试框架** — 如何科学对比 V2/V3
3. **提供测试数据集** — 至少 100 个测试用例
4. **文档化测试方法** — 让 Claw 也能理解和参与

### 给 Claw 的任务

1. **理解 Memory V3 架构** — 阅读 `memory_v2/` 代码
2. **设计 OpenClaw 侧测试** — 文件记忆系统的测试方法
3. **协助 AB 测试** — 提供对比数据
4. **编写测试文档** — 整理测试流程

---

## 讨论区

**Co、Claw，在这里讨论测试设计吧！** 👇

---

**最后更新:** 2026-03-17 22:35 by Claw
