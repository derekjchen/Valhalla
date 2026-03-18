#!/usr/bin/env node
/**
 * Claw 的持续在线群聊客户端
 * 保持 WebSocket 连接，实时接收@ 提醒
 * 
 * Author: Claw
 * Date: 2026-03-18
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
    name: 'claw',
    room: 'co-claw-derek',
    url: 'ws://localhost:18790',
    logFile: path.join(__dirname, '..', '..', 'memory', 'claw-chatroom.log')
};

// 确保日志目录存在
const logDir = path.dirname(CONFIG.logFile);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 日志函数
function log(message) {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const logLine = `[${timestamp}] ${message}\n`;
    process.stdout.write(logLine);
    fs.appendFileSync(CONFIG.logFile, logLine);
}

// 客户端类
class ClawClient {
    constructor(config) {
        this.name = config.name;
        this.room = config.room;
        this.url = config.url;
        this.ws = null;
        this.running = false;
        this.reconnectDelay = 5000; // 5 秒重连
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.on('open', () => {
                    log('✅ 已连接到群聊服务器');
                    this.running = true;

                    // 设置名字
                    this.send({ type: 'set_name', name: this.name });
                    log(`✓ 名字设置为 '${this.name}'`);

                    // 加载历史消息
                    this.send({ type: 'load_history', room: this.room, limit: 20 });

                    resolve(true);
                });

                this.ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                    } catch (err) {
                        log(`⚠️ 无效消息：${data}`);
                    }
                });

                this.ws.on('close', () => {
                    log('🔌 连接已关闭');
                    this.running = false;
                    this.scheduleReconnect();
                });

                this.ws.on('error', (err) => {
                    log(`❌ 错误：${err.message}`);
                    reject(err);
                });

            } catch (err) {
                log(`❌ 连接失败：${err.message}`);
                reject(err);
            }
        });
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    handleMessage(data) {
        const msgType = data.type;

        if (msgType === 'welcome') {
            log(`👋 欢迎：${data.message}`);
        }
        else if (msgType === 'name_set') {
            log(`✓ 名字已确认：${data.name}`);
        }
        else if (msgType === 'history') {
            const messages = data.messages || [];
            log(`📜 加载了 ${messages.length} 条历史消息`);
        }
        else if (msgType === 'message') {
            const fromName = data.from || 'unknown';
            const content = data.content || '';
            const mentions = data.mentions || [];

            // 检查是否被 @
            const isMentioned = [content, ...mentions].some(
                m => m.toLowerCase().includes(`@${this.name.toLowerCase()}`)
            );

            if (isMentioned) {
                log(`📣 被 @${fromName} 提及：${content}`);
                // 这里可以添加自动回复逻辑
            } else {
                log(`💬 ${fromName}: ${content}`);
            }
        }
        else if (msgType === 'join') {
            log(`🚪 ${data.from} 加入房间`);
        }
        else if (msgType === 'leave') {
            log(`🚪 ${data.from} 离开房间`);
        }
        else if (msgType === 'error') {
            log(`❌ 错误：${data.message}`);
        }
    }

    chat(content, mentions = []) {
        const msg = {
            type: 'chat',
            content: content,
            room: this.room,
            mentions: mentions
        };
        this.send(msg);
        log(`📤 发送：${content}`);
    }

    scheduleReconnect() {
        if (this.running) return;

        log(`⏳ ${this.reconnectDelay / 1000}秒后重连...`);
        setTimeout(async () => {
            log('🔄 尝试重连...');
            try {
                await this.connect();
            } catch (err) {
                this.scheduleReconnect();
            }
        }, this.reconnectDelay);
    }

    close() {
        this.running = false;
        if (this.ws) {
            this.ws.close();
            log('🔌 连接已关闭');
        }
    }
}

// 主函数
async function main() {
    console.log('=' .repeat(60));
    console.log('🦞 Claw Chatroom Client - 持续在线模式');
    console.log('=' .repeat(60));

    const client = new ClawClient(CONFIG);

    try {
        await client.connect();
        log('👂 开始监听消息...');
    } catch (err) {
        log(`启动失败：${err.message}`);
        process.exit(1);
    }

    // 处理退出信号
    process.on('SIGINT', () => {
        log('👋 用户中断，退出');
        client.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        log('👋 收到终止信号，退出');
        client.close();
        process.exit(0);
    });
}

// 启动
main();
