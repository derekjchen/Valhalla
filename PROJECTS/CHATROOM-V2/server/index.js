#!/usr/bin/env node
/**
 * Chatroom V2 - WebSocket Server with Admin API
 * 
 * Features:
 * - WebSocket real-time messaging
 * - REST API for admin dashboard
 * - Webhook support for @mention triggers
 * - SQLite database for persistence
 * 
 * Port: 18791 (V2)
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');

// Configuration
const PORT = process.env.CHATROOM_PORT || 18791;
const DEFAULT_ROOM = 'co-claw-derek';
const DB_PATH = path.join(__dirname, '..', 'data', 'chatroom.db');
const STORAGE_DIR = path.join(__dirname, '..', '..', 'SHARED-MEMORY', 'chatroom');

// Ensure directories exist
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });

// Initialize Database
const db = new Database(DB_PATH);
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME
    );
    
    CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public_key TEXT,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
`);

// Create default admin user if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE name = ?').get('admin');
if (!adminExists) {
    const adminId = nanoid();
    const passwordHash = hashPassword('admin123');
    db.prepare('INSERT INTO users (id, name, password_hash) VALUES (?, ?, ?)').run(adminId, 'admin', passwordHash);
    console.log('[DB] Created default admin user: admin / admin123');
}

// Webhook settings (default)
let webhookConfig = {
    url: process.env.WEBHOOK_URL || '',
    agents: ['co', 'claw']
};

// Load webhook settings from DB
const savedWebhook = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook');
if (savedWebhook) {
    try {
        webhookConfig = JSON.parse(savedWebhook.value);
    } catch (e) {}
}

// Room management
const rooms = new Map();
const clients = new Map();

// ==================== HTTP Server ====================

const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // API Routes
    if (urlPath.startsWith('/api/admin')) {
        handleAdminApi(req, res, urlPath);
        return;
    }
    
    // Static files
    serveStatic(req, res, urlPath);
});

// ==================== Admin API ====================

async function handleAdminApi(req, res, urlPath) {
    const body = await readBody(req);
    const auth = req.headers.authorization;
    const token = auth?.replace('Bearer ', '');
    
    // Login endpoint (no auth required)
    if (urlPath === '/api/admin/login' && req.method === 'POST') {
        const { username, password } = body;
        const user = db.prepare('SELECT * FROM users WHERE name = ?').get(username);
        
        if (user && verifyPassword(password, user.password_hash)) {
            const sessionToken = generateToken();
            db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))')
                .run(sessionToken, user.id);
            
            jsonRes(res, 200, { token: sessionToken, username: user.name, userId: user.id });
        } else {
            jsonRes(res, 401, { error: 'Invalid credentials' });
        }
        return;
    }
    
    // Verify token
    const session = db.prepare(`
        SELECT s.*, u.name as username 
        FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);
    
    if (!session) {
        jsonRes(res, 401, { error: 'Unauthorized' });
        return;
    }
    
    // API endpoints
    switch (urlPath) {
        case '/api/admin/verify':
            jsonRes(res, 200, { valid: true, username: session.username });
            break;
            
        case '/api/admin/stats':
            const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
            const onlineUsers = Array.from(clients.values()).filter(c => !c.name.startsWith('guest-')).length;
            const totalAgents = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
            const messagesToday = countMessagesToday();
            jsonRes(res, 200, { totalUsers, onlineUsers, totalAgents, messagesToday });
            break;
            
        case '/api/admin/users':
            if (req.method === 'GET') {
                const users = db.prepare('SELECT id, name, last_active FROM users').all();
                const usersWithOnline = users.map(u => ({
                    ...u,
                    online: Array.from(clients.values()).some(c => c.name === u.name)
                }));
                jsonRes(res, 200, usersWithOnline);
            } else if (req.method === 'POST') {
                const { username, password } = body;
                if (!username || !password) {
                    jsonRes(res, 400, { error: 'Username and password required' });
                    return;
                }
                try {
                    const userId = nanoid();
                    const passwordHash = hashPassword(password);
                    db.prepare('INSERT INTO users (id, name, password_hash) VALUES (?, ?, ?)')
                        .run(userId, username, passwordHash);
                    jsonRes(res, 201, { id: userId, name: username });
                } catch (e) {
                    jsonRes(res, 400, { error: 'User already exists' });
                }
            }
            break;
            
        case '/api/admin/agents':
            const agents = db.prepare('SELECT * FROM agents').all();
            jsonRes(res, 200, agents);
            break;
            
        case '/api/admin/settings':
            if (req.method === 'GET') {
                jsonRes(res, 200, {
                    webhookUrl: webhookConfig.url,
                    webhookAgents: webhookConfig.agents
                });
            } else if (req.method === 'POST') {
                webhookConfig = {
                    url: body.webhookUrl || '',
                    agents: body.webhookAgents || []
                };
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
                    .run('webhook', JSON.stringify(webhookConfig));
                jsonRes(res, 200, { success: true });
            }
            break;
    }
    
    // Delete user
    if (urlPath.match(/\/api\/admin\/users\/.+/) && req.method === 'DELETE') {
        const userId = urlPath.split('/').pop();
        db.prepare('DELETE FROM users WHERE id = ? AND name != ?').run(userId, 'admin');
        jsonRes(res, 200, { success: true });
    }
    
    // Delete agent
    if (urlPath.match(/\/api\/admin\/agents\/.+/) && req.method === 'DELETE') {
        const agentId = urlPath.split('/').pop();
        db.prepare('DELETE FROM agents WHERE agent_id = ?').run(agentId);
        jsonRes(res, 200, { success: true });
    }
}

// ==================== WebSocket Server ====================

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const clientInfo = {
        name: `guest-${nanoid(6)}`,
        room: DEFAULT_ROOM
    };
    clients.set(ws, clientInfo);
    
    // Join default room
    if (!rooms.has(DEFAULT_ROOM)) {
        rooms.set(DEFAULT_ROOM, new Set());
    }
    rooms.get(DEFAULT_ROOM).add(ws);
    
    // Welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: `Welcome to Chatroom V2! Room: ${DEFAULT_ROOM}`,
        timestamp: new Date().toISOString()
    }));
    
    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    
    // Message handler
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(ws, message);
        } catch (err) {
            console.error('[WS] Parse error:', err);
        }
    });
    
    // Disconnect handler
    ws.on('close', () => {
        const info = clients.get(ws);
        if (info) {
            console.log(`[WS] ${info.name} disconnected`);
            const room = rooms.get(info.room);
            if (room) room.delete(ws);
            clients.delete(ws);
        }
    });
});

// Handle incoming message
function handleMessage(ws, message) {
    const clientInfo = clients.get(ws);
    if (!clientInfo) return;
    
    switch (message.type) {
        case 'set_name':
            handleSetName(ws, clientInfo, message.name);
            break;
        case 'chat':
            handleChat(ws, clientInfo, message);
            break;
        case 'register_agent':
            handleRegisterAgent(ws, message);
            break;
        case 'list_users':
            handleListUsers(ws, clientInfo.room);
            break;
        case 'load_history':
            handleLoadHistory(ws, clientInfo.room, message.limit || 50);
            break;
    }
}

function handleSetName(ws, clientInfo, name) {
    if (!name || name.trim() === '') return;
    
    const sanitizedName = name.trim().substring(0, 20);
    const oldName = clientInfo.name;
    
    // Kick existing connection with same name
    for (const [wsClient, info] of clients.entries()) {
        if (info.name === sanitizedName && wsClient !== ws) {
            wsClient.send(JSON.stringify({
                type: 'kicked',
                message: 'You have been logged in elsewhere'
            }));
            wsClient.close();
        }
    }
    
    clientInfo.name = sanitizedName;
    console.log(`[WS] ${oldName} is now ${sanitizedName}`);
    
    ws.send(JSON.stringify({
        type: 'name_set',
        name: sanitizedName,
        timestamp: new Date().toISOString()
    }));
    
    // Update last active
    db.prepare('UPDATE users SET last_active = datetime("now") WHERE name = ?').run(sanitizedName);
}

function handleChat(ws, clientInfo, message) {
    const { content, room, mentions } = message;
    if (!content || content.trim() === '') return;
    
    const targetRoom = room || clientInfo.room;
    const msg = {
        type: 'message',
        from: clientInfo.name,
        room: targetRoom,
        content: content.trim(),
        mentions: mentions || [],
        timestamp: new Date().toISOString()
    };
    
    console.log(`[CHAT] ${clientInfo.name} @ ${targetRoom}: ${content}`);
    
    // Store message
    storeMessage(msg);
    
    // Broadcast to room
    broadcastToRoom(targetRoom, msg);
    
    // Trigger webhook for mentions
    if (mentions && mentions.length > 0) {
        triggerWebhook(mentions, msg);
    }
}

function handleRegisterAgent(ws, message) {
    const { name, agentId, publicKey } = message;
    
    if (!name || !agentId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields' }));
        return;
    }
    
    db.prepare('INSERT OR REPLACE INTO agents (agent_id, name, public_key, registered_at) VALUES (?, ?, ?, datetime("now"))')
        .run(agentId, name, publicKey || null);
    
    ws.send(JSON.stringify({
        type: 'agent_registered',
        agentId: agentId,
        message: `Agent ${name} registered successfully`
    }));
    
    console.log(`[Agent] Registered: ${name} (${agentId})`);
}

function handleListUsers(ws, room) {
    const roomClients = rooms.get(room);
    const users = roomClients ? Array.from(roomClients).map(client => {
        const info = clients.get(client);
        return info ? info.name : 'unknown';
    }) : [];
    
    ws.send(JSON.stringify({
        type: 'user_list',
        room: room,
        users: users,
        timestamp: new Date().toISOString()
    }));
}

function handleLoadHistory(ws, room, limit) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const filename = path.join(STORAGE_DIR, `${today}.jsonl`);
        
        if (!fs.existsSync(filename)) {
            ws.send(JSON.stringify({ type: 'history', messages: [] }));
            return;
        }
        
        const lines = fs.readFileSync(filename, 'utf-8').trim().split('\n');
        const messages = lines.slice(-limit).map(line => {
            try { return JSON.parse(line); }
            catch { return null; }
        }).filter(m => m);
        
        ws.send(JSON.stringify({
            type: 'history',
            messages: messages,
            count: messages.length
        }));
    } catch (err) {
        console.error('[History] Error:', err);
    }
}

// ==================== Webhook ====================

async function triggerWebhook(mentions, message) {
    if (!webhookConfig.url) {
        console.log('[Webhook] No URL configured, skipping');
        return;
    }
    
    // Check if any mentioned agent is in our list
    const triggeredAgents = mentions.filter(m => {
        const agentName = m.replace('@', '').toLowerCase();
        return webhookConfig.agents.includes(agentName);
    });
    
    if (triggeredAgents.length === 0) return;
    
    const payload = {
        agents: triggeredAgents.map(m => m.replace('@', '').toLowerCase()),
        message: message,
        timestamp: new Date().toISOString()
    };
    
    console.log('[Webhook] Triggering:', payload.agents);
    
    try {
        const response = await fetch(webhookConfig.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log('[Webhook] Response:', response.status);
    } catch (err) {
        console.error('[Webhook] Error:', err.message);
    }
}

// ==================== Utilities ====================

function broadcastToRoom(room, message, excludeWs = null) {
    const clientsInRoom = rooms.get(room);
    if (!clientsInRoom) return;
    
    clientsInRoom.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function storeMessage(message) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const filename = path.join(STORAGE_DIR, `${today}.jsonl`);
        fs.appendFileSync(filename, JSON.stringify(message) + '\n');
    } catch (err) {
        console.error('[Store] Error:', err);
    }
}

function countMessagesToday() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const filename = path.join(STORAGE_DIR, `${today}.jsonl`);
        if (!fs.existsSync(filename)) return 0;
        return fs.readFileSync(filename, 'utf-8').trim().split('\n').length;
    } catch {
        return 0;
    }
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hash) {
    return hashPassword(password) === hash;
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                resolve({});
            }
        });
    });
}

function jsonRes(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function serveStatic(req, res, urlPath) {
    const basePath = urlPath === '/' ? '/admin/index.html' : urlPath;
    const filePath = path.join(__dirname, '..', basePath);
    
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
}

// Heartbeat interval
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         Chatroom V2 Server Started                     ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  WebSocket: ws://localhost:${PORT}                      `);
    console.log(`║  Admin:     http://localhost:${PORT}                    `);
    console.log(`║  API:       http://localhost:${PORT}/api/admin          `);
    console.log('╚════════════════════════════════════════════════════════╝');
});