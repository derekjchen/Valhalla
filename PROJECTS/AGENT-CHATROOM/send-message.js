#!/usr/bin/env node
const WebSocket = require('ws');

const message = process.argv[2] || 'Hello';
const mentions = process.argv[3] ? [process.argv[3]] : [];

const ws = new WebSocket('ws://localhost:18790');

ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'set_name', name: 'claw' }));
    setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'chat',
            content: message,
            room: 'co-claw-derek',
            mentions: mentions
        }));
        setTimeout(() => ws.close(), 500);
    }, 300);
});

ws.on('error', (err) => {
    console.error('Error:', err);
    process.exit(1);
});
