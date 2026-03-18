const WebSocket = require('ws');

describe('Chatroom Server', () => {
    let server;
    let ws;

    beforeAll((done) => {
        // Start server for testing
        server = require('../server/index.js');
        setTimeout(done, 1000);
    });

    afterAll(() => {
        if (ws) ws.close();
        // Don't close server, it's used by other tests
    });

    test('should connect to server', (done) => {
        ws = new WebSocket('ws://localhost:18790');
        
        ws.on('open', () => {
            expect(ws.readyState).toBe(WebSocket.OPEN);
            ws.close();
            done();
        });

        ws.on('error', (err) => {
            done(err);
        });
    });

    test('should set name', (done) => {
        ws = new WebSocket('ws://localhost:18790');
        
        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'set_name',
                name: 'TestUser'
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'name_set') {
                expect(msg.name).toBe('TestUser');
                ws.close();
                done();
            }
        });
    });

    test('should send and receive message', (done) => {
        ws = new WebSocket('ws://localhost:18790');
        
        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'set_name',
                name: 'TestUser'
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'name_set') {
                // Send chat message
                ws.send(JSON.stringify({
                    type: 'chat',
                    content: 'Test message',
                    room: 'co-claw-derek'
                }));
            } else if (msg.type === 'message') {
                expect(msg.content).toBe('Test message');
                ws.close();
                done();
            }
        });
    });
});
