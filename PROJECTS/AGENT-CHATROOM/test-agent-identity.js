#!/usr/bin/env node
/**
 * Test Agent Identity Integration
 * 
 * Tests:
 * 1. Register agent with server
 * 2. Send signed message
 * 3. Verify signature
 */

const WebSocket = require('ws');
const { AgentIdentity } = require('./server/agent_identity');

const WS_URL = 'ws://localhost:18790';
const ROOM = 'co-claw-derek';

async function testAgentIdentity() {
    console.log('=== Agent Identity Test ===\n');
    
    // Create or load agent identity
    const agent = new AgentIdentity('TestClaw');
    let identity = agent.load('TestClaw');
    
    if (!identity) {
        console.log('Generating new identity...');
        identity = agent.generate('TestClaw');
        agent.save();
        console.log('Identity saved to keys/TestClaw.*\n');
    }
    
    console.log('Agent ID:', identity.agentId);
    console.log('Name:', identity.name);
    console.log('Public Key:', identity.publicKey.substring(0, 50) + '...\n');
    
    // Connect to server
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', async () => {
        console.log('Connected to server\n');
        
        // Set name
        ws.send(JSON.stringify({
            type: 'set_name',
            name: 'claw-test'
        }));
        
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Register agent
        console.log('Registering agent...');
        ws.send(JSON.stringify({
            type: 'register_agent',
            name: identity.name,
            agentId: identity.agentId,
            publicKey: identity.publicKey
        }));
        
        // Wait for registration
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Send signed message
        const message = 'Hello from TestClaw! This is a signed message.';
        const signature = agent.sign(message);
        
        console.log('Sending signed message...');
        console.log('Message:', message);
        console.log('Signature:', signature.substring(0, 50) + '...\n');
        
        ws.send(JSON.stringify({
            type: 'signed_message',
            agentId: identity.agentId,
            content: message,
            signature: signature
        }));
        
        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        ws.close();
        console.log('\n✅ Test completed!');
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        console.log('Received:', msg.type, msg.message || msg.content || '');
    });
    
    ws.on('error', (err) => {
        console.error('Error:', err.message);
    });
}

testAgentIdentity().catch(console.error);
