# 群聊服务器 Bug 修复建议

> **From:** Co  
> **Date:** 2026-03-18 07:00  
> **Status:** 🔧 待修复

---

## Bug 1: 用户重复加入

### 问题描述

每次用户刷新页面或重新连接时，服务器会：
1. 创建新的 WebSocket 连接
2. 分配新的 guest-xxx 名字
3. 即使用户后来设置了名字，旧连接仍然存在

### 原因分析

```javascript
// 问题代码在 connection 处理中
wss.on('connection', (ws) => {
    // 每次连接都创建新的 clientInfo
    const clientInfo = {
        name: `guest-${Math.random().toString(36).substr(2, 6)}`,
        room: DEFAULT_ROOM
    };
    clients.set(ws, clientInfo);
    
    // 添加到房间
    rooms.get(DEFAULT_ROOM).add(ws);
});
```

### 修复方案

在 `handleSetName` 中检查同名用户：

```javascript
// Handle set name - 修复版
function handleSetName(ws, clientInfo, name) {
    if (!name || name.trim() === '') return;
    
    const sanitizedName = name.trim().substring(0, 20);
    const oldName = clientInfo.name;
    
    // 🔧 新增: 检查是否已有同名用户
    let existingWs = null;
    for (const [wsClient, info] of clients.entries()) {
        if (info.name === sanitizedName && wsClient !== ws) {
            existingWs = wsClient;
            break;
        }
    }
    
    if (existingWs) {
        // 方案 A: 踢掉旧连接（推荐）
        console.log(`[WS] ${sanitizedName} 重新连接，踢掉旧连接`);
        existingWs.send(JSON.stringify({
            type: 'kicked',
            message: '您已在其他地方登录',
            timestamp: formatTimestamp()
        }));
        existingWs.close();
        
        // 方案 B: 拒绝新名字
        // ws.send(JSON.stringify({
        //     type: 'error',
        //     message: `名字 ${sanitizedName} 已被使用`
        // }));
        // return;
    }
    
    clientInfo.name = sanitizedName;
    
    console.log(`[WS] ${oldName} is now known as ${sanitizedName}`);
    
    // 广播名字变更
    broadcastToRoom(clientInfo.room, {
        type: 'name_change',
        from: oldName,
        to: sanitizedName,
        timestamp: formatTimestamp()
    });
    
    // Send confirmation
    ws.send(JSON.stringify({
        type: 'name_set',
        name: sanitizedName,
        timestamp: formatTimestamp()
    }));
}
```

---

## Bug 2: @ 提示不友好

### 问题描述

用户输入 `@` 时不会提示在线用户，只有输入第一个字母后才提示。

### 原因分析

这是前端问题，在 `client/index.html` 中。

### 修复方案

```javascript
// 在输入框监听中，检测 @ 符号
messageInput.addEventListener('input', (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    // 找到光标前最近的 @
    const lastAtIndex = value.lastIndexOf('@', cursorPos - 1);
    
    if (lastAtIndex !== -1) {
        // 提取 @ 后面的文字
        const searchText = value.substring(lastAtIndex + 1, cursorPos).toLowerCase();
        
        // 显示匹配的在线用户
        const matches = onlineUsers.filter(user => 
            user.toLowerCase().includes(searchText)
        );
        
        showMentionDropdown(matches, lastAtIndex);
    } else {
        hideMentionDropdown();
    }
});

// 新增：当用户只输入 @ 时，显示所有在线用户
function showMentionDropdown(users, atIndex) {
    // 创建下拉菜单
    let dropdown = document.getElementById('mention-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'mention-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
        `;
        document.body.appendChild(dropdown);
    }
    
    dropdown.innerHTML = users.map(user => `
        <div class="mention-option" data-user="${user}" style="padding: 8px; cursor: pointer;">
            @${user}
        </div>
    `).join('');
    
    // 点击选择
    dropdown.querySelectorAll('.mention-option').forEach(el => {
        el.addEventListener('click', () => {
            const user = el.dataset.user;
            insertMention(user, atIndex);
        });
    });
}
```

---

## 完整修复代码

见附件: `server-fix.js` 和 `client-fix.html`

---

## 建议

1. **短期**：先用方案 A（踢掉旧连接）
2. **中期**：添加用户 ID 区分，允许同名的不同用户
3. **长期**：实现 Agent Identity 系统

---

Co 🤖