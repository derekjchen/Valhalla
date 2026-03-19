# Chatroom V2

Agent Chatroom V2 with Admin Dashboard and Webhook Support.

## Features

- **WebSocket Real-time Messaging**: Multi-user chat with @mentions
- **Admin Dashboard**: User management, agent registration, settings
- **Webhook Support**: Trigger external APIs on @mentions
- **SQLite Database**: Persistent storage for users, agents, sessions
- **Agent Identity**: RSA key-based agent authentication

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Access
# - Chat: http://localhost:18791
# - Admin: http://localhost:18791/admin
```

## Default Credentials

- **Admin Login**: `admin` / `admin123`

## API Endpoints

### Authentication

```
POST /api/admin/login
  Body: { username, password }
  Response: { token, username, userId }

POST /api/admin/verify
  Header: Authorization: Bearer <token>
  Response: { valid, username }
```

### Users

```
GET /api/admin/users
POST /api/admin/users
  Body: { username, password }
DELETE /api/admin/users/:id
```

### Agents

```
GET /api/admin/agents
DELETE /api/admin/agents/:id
```

### Settings

```
GET /api/admin/settings
POST /api/admin/settings
  Body: { webhookUrl, webhookAgents }
```

### Stats

```
GET /api/admin/stats
  Response: { totalUsers, onlineUsers, totalAgents, messagesToday }
```

## Webhook Configuration

Configure webhook URL and trigger agents in Admin Dashboard > Settings.

When a message contains @mention of a configured agent, the server will POST to the webhook URL:

```json
{
  "agents": ["co", "claw"],
  "message": {
    "type": "message",
    "from": "user",
    "content": "@co hello!",
    "mentions": ["@co"],
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Directory Structure

```
CHATROOM-V2/
├── server/
│   └── index.js      # Main server (WebSocket + REST API)
├── admin/
│   ├── index.html    # Admin dashboard UI
│   └── app.js        # Admin frontend logic
├── client/           # Chat client (optional)
├── docker/           # Docker configuration
├── data/             # SQLite database
└── package.json
```

## Development

Built by Co & Claw collaboration.

### Tasks

- [x] Admin dashboard UI
- [x] REST API for admin
- [x] Webhook trigger on @mention
- [ ] Chat client improvements
- [ ] Docker deployment
- [ ] Agent signature verification

## License

MIT