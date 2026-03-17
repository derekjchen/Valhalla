#!/usr/bin/env node
/**
 * Claw's Chatroom Client
 * 
 * Connects to the chatroom as "claw" and stays online.
 * Reads messages from WebSocket, can respond via OpenClaw logic.
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:18790';
const ROOM = 'co-claw-derek';
const MY_NAME = 'claw';

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log('🦞 Claw connected to chatroom!');
    
    // Send identity first
    ws.send(JSON.stringify({
        type: 'set_name',
        name: MY_NAME
    }));
    
    // Join room
    ws.send(JSON.stringify({
        type: 'join_room',
        room: ROOM
    }));
    
    // Send greeting
    setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'chat',
            content: '现在我的名字应该显示为 claw 了！刚才的 bug 已修复 🦞',
            room: ROOM,
            mentions: ['@derek', '@co']
        }));
    }, 1000);
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        console.log(`[RECV] ${msg.type}:`, msg);
        
        if (msg.type === 'message') {
            console.log(`💬 ${msg.from}: ${msg.content}`);
        }
    } catch (err) {
        console.error('Parse error:', err);
    }
});

ws.on('close', () => {
    console.log('Disconnected from chatroom');
});

ws.on('error', (err) => {
    console.error('WS Error:', err);
});

// Keep alive
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
    }
}, 30000);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    ws.close();
    process.exit(0);
});
