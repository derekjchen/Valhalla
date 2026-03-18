#!/usr/bin/env node
/**
 * Agent Chatroom - WebSocket Server
 * 
 * A simple WebSocket server for multi-agent collaboration.
 * Supports: real-time messaging, @mentions, room management
 * 
 * Usage: node server/index.js
 * Access: ws://localhost:18790
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { AgentRegistry } = require('./agent_identity');

// Configuration
const PORT = process.env.CHATROOM_PORT || 18790;
const DEFAULT_ROOM = 'co-claw-derek';
const STORAGE_DIR = path.join(__dirname, '..', '..', '..', 'SHARED-MEMORY', 'chatroom');
const REGISTRY_FILE = path.join(__dirname, '..', '..', 'AGENT-IDENTITY', 'keys', 'registry.json');

// Initialize Agent Registry
const agentRegistry = new AgentRegistry();

// Load registry from file if exists
if (fs.existsSync(REGISTRY_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
        data.forEach(agent => {
            agentRegistry.agents.set(agent.agentId, {
                name: agent.name,
                publicKey: agent.publicKey,
                registeredAt: agent.registeredAt
            });
        });
        console.log(`[Registry] Loaded ${agentRegistry.agents.size} agents from file`);
    } catch (err) {
        console.error('[Registry] Failed to load registry:', err);
    }
}

// Save registry to file
function saveRegistry() {
    const data = agentRegistry.listAgents();
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
    console.log(`[Registry] Saved ${data.length} agents to file`);
}

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Create HTTP server for static files
const server = http.createServer((req, res) => {
    // Remove query string and handle root path
    const urlPath = req.url.split('?')[0];
    const url = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(__dirname, '..', 'client', url);
    
    // Security: prevent directory traversal
    const resolvedPath = path.resolve(filePath);
    const clientDir = path.resolve(path.join(__dirname, '..', 'client'));
    
    if (!resolvedPath.startsWith(clientDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    // Serve static files
    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json'
    };
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Room management
const rooms = new Map(); // roomName -> Set<WebSocket>
const clients = new Map(); // WebSocket -> { name, room }

// Utility: get today's date string
function getToday() {
    return new Date().toISOString().split('T')[0];
}

// Utility: format timestamp
function formatTimestamp() {
    return new Date().toISOString();
}

// Storage: append message to JSONL file
function storeMessage(message) {
    try {
        const filename = path.join(STORAGE_DIR, `${getToday()}.jsonl`);
        const line = JSON.stringify(message) + '\n';
        fs.appendFileSync(filename, line);
        console.log(`[STORE] Message saved to ${filename}`);
    } catch (err) {
        console.error('[STORE] Error saving message:', err);
    }
}

// Broadcast message to room
function broadcastToRoom(room, message, excludeWs = null) {
    const clientsInRoom = rooms.get(room);
    if (!clientsInRoom) return;
    
    clientsInRoom.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Handle new connection
wss.on('connection', (ws) => {
    console.log(`[WS] New connection: ${ws.constructor.name}`);
    
    // Default client info
    const clientInfo = {
        name: `guest-${Math.random().toString(36).substr(2, 6)}`,
        room: DEFAULT_ROOM
    };
    clients.set(ws, clientInfo);
    
    // Join default room
    if (!rooms.has(DEFAULT_ROOM)) {
        rooms.set(DEFAULT_ROOM, new Set());
    }
    rooms.get(DEFAULT_ROOM).add(ws);
    
    console.log(`[WS] ${clientInfo.name} joined room: ${DEFAULT_ROOM}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: `Welcome to Agent Chatroom! You are in room: ${DEFAULT_ROOM}`,
        timestamp: formatTimestamp()
    }));
    
    // Broadcast join notification only for named users (not guests)
    // Guest users will broadcast when they set their name
    // broadcastToRoom(DEFAULT_ROOM, {
    //     type: 'join',
    //     from: clientInfo.name,
    //     room: DEFAULT_ROOM,
    //     timestamp: formatTimestamp()
    // }, ws);
    
    // Handle incoming messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(ws, message);
        } catch (err) {
            console.error('[WS] Parse error:', err);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });
    
    // Handle disconnect
    ws.on('close', () => {
        const info = clients.get(ws);
        if (info) {
            console.log(`[WS] ${info.name} disconnected`);
            
            // Remove from room
            const room = rooms.get(info.room);
            if (room) {
                room.delete(ws);
                
                // Broadcast leave notification only for named users
                if (!info.name.startsWith('guest-')) {
                    broadcastToRoom(info.room, {
                        type: 'leave',
                        from: info.name,
                        room: info.room,
                        timestamp: formatTimestamp()
                    });
                }
            }
            
            clients.delete(ws);
        }
    });
    
    // Handle errors
    ws.on('error', (err) => {
        console.error('[WS] Error:', err);
    });
});

// Handle incoming message
function handleMessage(ws, message) {
    const clientInfo = clients.get(ws);
    if (!clientInfo) return;
    
    const { type, content, room, mentions, name } = message;
    const targetRoom = room || clientInfo.room;
    
    // Handle set_name before room validation
    if (type === 'set_name') {
        handleSetName(ws, clientInfo, name);
        return;
    }
    
    // Validate room
    if (!rooms.has(targetRoom)) {
        ws.send(JSON.stringify({
            type: 'error',
            message: `Room not found: ${targetRoom}`
        }));
        return;
    }
    
    // Handle different message types
    switch (type) {
        case 'chat':
            handleChat(ws, clientInfo, targetRoom, content, mentions);
            break;
        
        case 'join_room':
            handleJoinRoom(ws, clientInfo, targetRoom);
            break;
        
        case 'list_rooms':
            handleListRooms(ws);
            break;
        
        case 'list_users':
            handleListUsers(ws, targetRoom);
            break;
        
        case 'load_history':
            handleLoadHistory(ws, targetRoom, message.limit || 50);
            break;
        
        case 'register_agent':
            handleRegisterAgent(ws, message);
            break;
        
        case 'signed_message':
            handleSignedMessage(ws, clientInfo, targetRoom, message);
            break;
        
        default:
            ws.send(JSON.stringify({
                type: 'error',
                message: `Unknown message type: ${type}`
            }));
    }
}

// Handle set name
function handleSetName(ws, clientInfo, name) {
    if (!name || name.trim() === '') return;
    
    const sanitizedName = name.trim().substring(0, 20);
    const oldName = clientInfo.name;
    
    // 🔧 Bug Fix: 检查是否已有同名用户，踢掉旧连接
    let existingWs = null;
    for (const [wsClient, info] of clients.entries()) {
        if (info.name === sanitizedName && wsClient !== ws) {
            existingWs = wsClient;
            break;
        }
    }
    
    if (existingWs) {
        console.log(`[WS] ${sanitizedName} 重新连接，踢掉旧连接`);
        existingWs.send(JSON.stringify({
            type: 'kicked',
            message: '您已在其他地方登录',
            timestamp: formatTimestamp()
        }));
        existingWs.close();
        
        // 从房间中移除旧连接
        const room = rooms.get(clientInfo.room);
        if (room) {
            room.delete(existingWs);
        }
        clients.delete(existingWs);
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

// Handle chat message
function handleChat(ws, clientInfo, room, content, mentions = []) {
    if (!content || content.trim() === '') {
        console.log(`[CHAT] Empty message from ${clientInfo.name}, ignoring`);
        return;
    }
    
    const message = {
        type: 'message',
        from: clientInfo.name,
        room: room,
        content: content.trim(),
        mentions: mentions,
        timestamp: formatTimestamp(),
        metadata: {
            agent: 'openclaw',
            model: 'qwen3.5-plus'
        }
    };
    
    console.log(`[CHAT] ${clientInfo.name} @ ${room}: ${content}`);
    
    // Store message
    storeMessage(message);
    
    // Broadcast to room
    broadcastToRoom(room, message);
}

// Handle join room
function handleJoinRoom(ws, clientInfo, newRoom) {
    const oldRoom = clientInfo.room;
    
    // Leave old room
    const oldRoomClients = rooms.get(oldRoom);
    if (oldRoomClients) {
        oldRoomClients.delete(ws);
        broadcastToRoom(oldRoom, {
            type: 'leave',
            from: clientInfo.name,
            room: oldRoom,
            timestamp: formatTimestamp()
        }, ws);
    }
    
    // Join new room
    if (!rooms.has(newRoom)) {
        rooms.set(newRoom, new Set());
    }
    rooms.get(newRoom).add(ws);
    clientInfo.room = newRoom;
    
    // Send confirmation
    ws.send(JSON.stringify({
        type: 'room_joined',
        room: newRoom,
        timestamp: formatTimestamp()
    }));
    
    // Broadcast join notification
    broadcastToRoom(newRoom, {
        type: 'join',
        from: clientInfo.name,
        room: newRoom,
        timestamp: formatTimestamp()
    }, ws);
    
    console.log(`[WS] ${clientInfo.name} switched from ${oldRoom} to ${newRoom}`);
}

// Handle list rooms
function handleListRooms(ws) {
    const roomList = Array.from(rooms.keys()).map(name => ({
        name: name,
        userCount: rooms.get(name)?.size || 0
    }));
    
    ws.send(JSON.stringify({
        type: 'room_list',
        rooms: roomList,
        timestamp: formatTimestamp()
    }));
}

// Handle list users in room
function handleListUsers(ws, room) {
    const clientsInRoom = rooms.get(room);
    const users = clientsInRoom ? Array.from(clientsInRoom).map(ws => {
        const info = clients.get(ws);
        return info ? info.name : 'unknown';
    }) : [];
    
    ws.send(JSON.stringify({
        type: 'user_list',
        room: room,
        users: users,
        timestamp: formatTimestamp()
    }));
}

// Handle load history
function handleLoadHistory(ws, room, limit = 50) {
    try {
        const today = getToday();
        const filename = path.join(STORAGE_DIR, `${today}.jsonl`);
        
        if (!fs.existsSync(filename)) {
            ws.send(JSON.stringify({
                type: 'history',
                room: room,
                messages: [],
                timestamp: formatTimestamp()
            }));
            return;
        }
        
        const content = fs.readFileSync(filename, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        const messages = lines.slice(-limit).map(line => {
            try { return JSON.parse(line); }
            catch { return null; }
        }).filter(msg => msg !== null);
        
        ws.send(JSON.stringify({
            type: 'history',
            room: room,
            messages: messages,
            count: messages.length,
            timestamp: formatTimestamp()
        }));
        
        console.log(`[WS] Sent ${messages.length} history messages to ${clients.get(ws)?.name || 'unknown'}`);
    } catch (err) {
        console.error('[WS] Error loading history:', err);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to load history'
        }));
    }
}


// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         Agent Chatroom Server Started                  ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  WebSocket: ws://localhost:${PORT}                      `);
    console.log(`║  Web UI:    http://localhost:${PORT}                    `);
    console.log(`║  Room:      ${DEFAULT_ROOM}                             `);
    console.log(`║  Storage:   ${STORAGE_DIR}                              `);
    console.log('╚════════════════════════════════════════════════════════╝');
});

// Handle Agent Registration
function handleRegisterAgent(ws, message) {
    const { name, agentId, publicKey } = message;
    
    if (!name || !agentId || !publicKey) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing required fields: name, agentId, publicKey'
        }));
        return;
    }
    
    // Register agent
    agentRegistry.register(name, agentId, publicKey);
    saveRegistry();
    
    ws.send(JSON.stringify({
        type: 'agent_registered',
        agentId: agentId,
        message: `Agent ${name} registered successfully`
    }));
    
    console.log(`[Registry] Agent registered: ${name} (${agentId})`);
}

// Handle Signed Message
function handleSignedMessage(ws, clientInfo, room, message) {
    const { agentId, content, signature } = message;
    
    if (!agentId || !content || !signature) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing required fields: agentId, content, signature'
        }));
        return;
    }
    
    // Verify signature
    if (agentRegistry.verifyMessage(agentId, content, signature)) {
        // Signature valid, broadcast message
        const broadcastMsg = {
            type: 'message',
            from: clientInfo.name,
            room: room,
            content: content,
            agentId: agentId,
            verified: true,
            timestamp: formatTimestamp(),
            metadata: {
                agent: 'openclaw',
                model: 'qwen3.5-plus'
            }
        };
        
        console.log(`[CHAT] ${clientInfo.name} @ ${room} (verified: ${agentId}): ${content}`);
        storeMessage(broadcastMsg);
        broadcastToRoom(room, broadcastMsg);
    } else {
        // Signature invalid
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Signature verification failed'
        }));
        console.log(`[Registry] Signature verification failed for ${agentId}`);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[WS] Shutting down...');
    wss.clients.forEach(client => {
        client.close();
    });
    server.close(() => {
        console.log('[WS] Server closed');
        process.exit(0);
    });
});


