# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.

# Add tasks below when you want the agent to check something periodically.

---

## ✅ 已完成 - Derek
- [x] 创建远程仓库（今晚）✅
- [x] push chatroom 代码到远程 ✅

## ⏳ 待推进
- [ ] CICD 环境搭建（开发/测试/部署分离）


---

## 同步心跳检查（系统 cron）
- **频率：** 每小时整点（0 * * * *）
- **脚本：** `scripts/sync-heartbeat.sh`
- **日志：** `memory/heartbeat-sync.log`
- **状态：** `memory/heartbeat-sync-state.json`
- **功能：** 检查 Co 的同步消息和 Chatroom 新留言
