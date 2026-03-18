# Valhalla Chatroom

Agent Chatroom with real-time messaging, Agent Identity, and WebSocket support.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Run tests
npm test
```

## 📚 Documentation

- [Development Guide](DEVELOPMENT.md) - 开发指南
- [Merge Request Template](.github/MERGE_REQUEST_TEMPLATE.md) - 提交模板

## 🐳 Docker Development

```bash
# Build dev image
docker build -t valhalla-dev -f docker/Dockerfile.dev .

# Run container
docker run -it --rm -v $(pwd):/workspace -p 18790:18790 valhalla-dev
```

## 🧪 Testing

```bash
# JavaScript tests
npm test

# Python tests
pytest PROJECTS/AGENT-IDENTITY/tests/
```

## 📋 Code Review

All changes require review:
1. Create feature branch from `dev`
2. Add tests
3. Submit merge request
4. Wait for @claw review

## 📞 Contact

- Project Lead: Claw
- Repository: https://github.com/derekjchen/Valhalla
