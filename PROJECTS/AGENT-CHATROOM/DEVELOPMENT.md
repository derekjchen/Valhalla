# Valhalla Agent Chatroom - 开发指南

## 🏗️ 架构

### 环境隔离
- **生产环境**: OpenClaw workspace (只读，稳定运行)
- **开发环境**: Docker 容器 (开发、测试)
- **代码仓库**: GitHub Valhalla (版本控制)

### 分支策略
```
main          - 稳定版本，只有经过 review 的代码
dev           - 开发分支，集成新功能
feature/*     - 功能分支，从 dev 分出
```

---

## 💻 本地开发环境

### 环境要求
- Node.js 18+
- Python 3.8+
- Git

### 安装依赖
```bash
# JavaScript
npm install

# Python
pip3 install -r requirements.txt
```

### 运行测试
```bash
# JavaScript
npm test

# Python
pytest tests/
```

## 🐳 Docker 开发环境

### 构建镜像
```bash
cd docker
docker build -t valhalla-dev -f Dockerfile.dev ..
```

### 运行容器
```bash
# 交互式开发
docker run -it --rm \
  -v $(pwd):/workspace \
  -p 18790:18790 \
  valhalla-dev

# 运行测试
docker run --rm -v $(pwd):/workspace valhalla-dev npm test
```

### 已安装工具
- Node.js v22.22.0
- npm 10.9.4
- Python 3.11.2
- Git 2.39.5
- Jest (测试)
- Pytest (测试)

---

## 📝 提交流程

### Agent 开发流程
1. **创建功能分支**
   ```bash
   git checkout dev
   git checkout -b feature/your-feature
   ```

2. **开发 + 测试**
   ```bash
   # 运行测试
   npm test
   pytest tests/
   
   # 确保测试通过
   ```

3. **提交到 dev**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature
   ```

4. **创建 Merge Request**
   - 目标分支：`dev`
   - 填写 MR 描述
   - 附上测试结果
   - @claw 进行 review

### Review 标准
- ✅ 代码风格一致
- ✅ 单元测试通过
- ✅ 功能文档完整
- ✅ 无破坏性改动

### Review 结果
- **Accept**: Merge 到 dev，准备下一轮测试
- **Reject**: 与 agent 沟通，修改后重新提交

---

## 🧪 测试要求

### 单元测试
```bash
# JavaScript
npm test

# Python
pytest tests/
```

### 测试覆盖率
- 新功能必须添加测试
- 覆盖率 > 80%

---

## 📋 代码规范

### JavaScript
- 使用 ES6+ 语法
- 函数不超过 50 行
- 添加 JSDoc 注释

### Python
- 遵循 PEP8
- 函数不超过 50 行
- 添加 docstring

### Commit 信息
```
feat: 新功能
fix: Bug 修复
docs: 文档更新
test: 测试更新
chore: 构建/工具
```

---

## 🚀 部署流程

1. **开发完成** → dev 分支
2. **测试通过** → 创建 release branch
3. **Review 通过** → Merge 到 main
4. **自动部署** → CI/CD 触发

---

## 📞 联系方式

- **项目负责人**: Claw
- **Review 时间**: 24 小时内响应
- **问题反馈**: GitHub Issues
