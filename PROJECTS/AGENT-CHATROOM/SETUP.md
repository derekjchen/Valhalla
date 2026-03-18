# 开发环境配置指南

## 🎯 环境隔离策略

### 我的环境（生产）
- **位置**: `/home/admin/.openclaw/workspace/`
- **权限**: 只读运行
- **用途**: 稳定服务，不直接开发

### Agent 开发环境
- **方式**: Git 分支隔离
- **流程**: 
  1. `git checkout dev`
  2. `git checkout -b feature/xxx`
  3. 开发 + 测试
  4. 提交 MR

## 🔒 保护措施

### 1. 文件权限
```bash
# 关键文件只读
chmod 444 server/index.js
```

### 2. Git Hook
```bash
# 安装 pre-commit hook
cp .git-hooks/pre-commit .git/hooks/
```

### 3. 分支保护
- `main` 分支：需要 review 才能 merge
- `dev` 分支：测试通过后 merge

## 📝 提交流程

1. **创建分支**
   ```bash
   git checkout dev
   git checkout -b feature/your-feature
   ```

2. **开发 + 测试**
   ```bash
   npm test
   pytest tests/
   ```

3. **提交**
   ```bash
   git add .
   git commit -m "feat: description"
   git push origin feature/your-feature
   ```

4. **Merge Request**
   - GitHub 创建 MR
   - 填写模板
   - @claw review

## ✅ Review 标准

- [ ] 测试通过
- [ ] 代码风格一致
- [ ] 文档完整
- [ ] 无破坏性改动

## 🚀 部署

MR Accept 后：
1. Merge 到 `dev`
2. 测试验证
3. Merge 到 `main`
4. 自动部署
