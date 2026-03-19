/**
 * Chatroom V2 - Admin Dashboard Frontend
 * 
 * Features:
 * - Login authentication
 * - User management (list, add, delete)
 * - Agent management (list registered agents)
 * - Webhook settings configuration
 */

// Configuration
const API_BASE = window.location.origin + '/api/admin';
const WS_URL = `ws://${window.location.host}`;

// State
let session = null;
let ws = null;
let users = [];
let agents = [];

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const currentUser = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

// Stats
const statUsers = document.getElementById('statUsers');
const statOnline = document.getElementById('statOnline');
const statAgents = document.getElementById('statAgents');
const statMessages = document.getElementById('statMessages');

// Tables
const usersTable = document.getElementById('usersTable');
const agentsTable = document.getElementById('agentsTable');

// Modal
const addUserModal = document.getElementById('addUserModal');
const addUserForm = document.getElementById('addUserForm');
const addUserBtn = document.getElementById('addUserBtn');
const closeModal = document.getElementById('closeModal');
const cancelAddUser = document.getElementById('cancelAddUser');

// Settings
const webhookUrl = document.getElementById('webhookUrl');
const webhookAgents = document.getElementById('webhookAgents');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// ==================== Authentication ====================

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            session = data;
            localStorage.setItem('session', JSON.stringify(session));
            showDashboard();
        } else {
            loginError.textContent = data.error || 'Login failed';
        }
    } catch (err) {
        loginError.textContent = 'Connection error';
        console.error('Login error:', err);
    }
});

logoutBtn.addEventListener('click', () => {
    session = null;
    localStorage.removeItem('session');
    showLoginPage();
});

function showDashboard() {
    loginPage.classList.add('hidden');
    dashboard.classList.add('active');
    currentUser.textContent = session?.username || 'Admin';
    loadStats();
    loadUsers();
    loadAgents();
    loadSettings();
    connectWebSocket();
}

function showLoginPage() {
    loginPage.classList.remove('hidden');
    dashboard.classList.remove('active');
    loginError.textContent = '';
    if (ws) {
        ws.close();
        ws = null;
    }
}

// Check existing session on load
function checkSession() {
    const saved = localStorage.getItem('session');
    if (saved) {
        try {
            session = JSON.parse(saved);
            // Verify session is still valid
            fetch(`${API_BASE}/verify`, {
                headers: { 'Authorization': `Bearer ${session.token}` }
            })
            .then(res => {
                if (res.ok) {
                    showDashboard();
                } else {
                    localStorage.removeItem('session');
                    session = null;
                }
            })
            .catch(() => {
                // Session might be valid, show dashboard anyway
                showDashboard();
            });
        } catch (err) {
            console.error('Session parse error:', err);
        }
    }
}

// ==================== Tabs ====================

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tabName}Panel`).classList.add('active');
    });
});

// ==================== Stats ====================

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`, {
            headers: { 'Authorization': `Bearer ${session?.token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            statUsers.textContent = data.totalUsers || 0;
            statOnline.textContent = data.onlineUsers || 0;
            statAgents.textContent = data.totalAgents || 0;
            statMessages.textContent = data.messagesToday || 0;
        }
    } catch (err) {
        console.error('Load stats error:', err);
    }
}

// ==================== Users ====================

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${session?.token}` }
        });
        
        if (response.ok) {
            users = await response.json();
            renderUsers();
        }
    } catch (err) {
        console.error('Load users error:', err);
    }
}

function renderUsers() {
    usersTable.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>
                <span class="status-badge ${user.online ? 'status-online' : 'status-offline'}">
                    ${user.online ? 'Online' : 'Offline'}
                </span>
            </td>
            <td>${formatTime(user.lastActive)}</td>
            <td>
                <button class="btn-icon delete" onclick="deleteUser('${user.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function deleteUser(userId) {
    if (!confirm('Delete this user?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session?.token}` }
        });
        
        if (response.ok) {
            loadUsers();
            loadStats();
        }
    } catch (err) {
        console.error('Delete user error:', err);
    }
}

// Add User Modal
addUserBtn.addEventListener('click', () => {
    addUserModal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
    addUserModal.classList.add('hidden');
});

cancelAddUser.addEventListener('click', () => {
    addUserModal.classList.add('hidden');
});

addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.token}`
            },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            addUserModal.classList.add('hidden');
            addUserForm.reset();
            loadUsers();
            loadStats();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to add user');
        }
    } catch (err) {
        console.error('Add user error:', err);
        alert('Connection error');
    }
});

// ==================== Agents ====================

async function loadAgents() {
    try {
        const response = await fetch(`${API_BASE}/agents`, {
            headers: { 'Authorization': `Bearer ${session?.token}` }
        });
        
        if (response.ok) {
            agents = await response.json();
            renderAgents();
        }
    } catch (err) {
        console.error('Load agents error:', err);
    }
}

function renderAgents() {
    agentsTable.innerHTML = agents.map(agent => `
        <tr>
            <td><code>${escapeHtml(agent.agentId?.substring(0, 20) || 'N/A')}...</code></td>
            <td>${escapeHtml(agent.name)}</td>
            <td>${formatTime(agent.registeredAt)}</td>
            <td>
                <button class="btn-icon delete" onclick="deleteAgent('${agent.agentId}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function deleteAgent(agentId) {
    if (!confirm('Delete this agent?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/agents/${agentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session?.token}` }
        });
        
        if (response.ok) {
            loadAgents();
            loadStats();
        }
    } catch (err) {
        console.error('Delete agent error:', err);
    }
}

document.getElementById('refreshAgentsBtn').addEventListener('click', loadAgents);

// ==================== Settings ====================

async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`, {
            headers: { 'Authorization': `Bearer ${session?.token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            webhookUrl.value = data.webhookUrl || '';
            webhookAgents.value = (data.webhookAgents || []).join(', ');
        }
    } catch (err) {
        console.error('Load settings error:', err);
    }
}

saveSettingsBtn.addEventListener('click', async () => {
    const settings = {
        webhookUrl: webhookUrl.value,
        webhookAgents: webhookAgents.value.split(',').map(s => s.trim()).filter(s => s)
    };
    
    try {
        const response = await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.token}`
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            alert('Settings saved!');
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to save settings');
        }
    } catch (err) {
        console.error('Save settings error:', err);
        alert('Connection error');
    }
});

// ==================== WebSocket ====================

function connectWebSocket() {
    if (ws) return;
    
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('[WS] Connected');
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        } catch (err) {
            console.error('[WS] Parse error:', err);
        }
    };
    
    ws.onclose = () => {
        console.log('[WS] Disconnected');
        ws = null;
        setTimeout(connectWebSocket, 3000);
    };
}

function handleWsMessage(data) {
    switch (data.type) {
        case 'user_join':
        case 'user_leave':
            loadUsers();
            loadStats();
            break;
        case 'agent_registered':
            loadAgents();
            loadStats();
            break;
        case 'message':
            loadStats();
            break;
    }
}

// ==================== Utilities ====================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return timestamp;
    }
}

// ==================== Initialize ====================

checkSession();