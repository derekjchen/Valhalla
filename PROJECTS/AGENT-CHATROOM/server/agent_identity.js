/**
 * Agent Identity - Node.js 版本
 * 
 * 用于群聊服务器的身份验证
 * 
 * 功能:
 * - 生成密钥对 (RSA-2048)
 * - 创建 Agent ID
 * - 签名消息
 * - 验证签名
 * 
 * Author: Co (ported from Python)
 * Date: 2026-03-18
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 配置
const KEY_SIZE = 2048;
const KEY_DIR = process.env.AGENT_KEY_DIR || path.join(__dirname, 'keys');

/**
 * AgentIdentity 类 - 管理单个 Agent 的身份
 */
class AgentIdentity {
    constructor(name = null, keyDir = KEY_DIR) {
        this.name = name;
        this.keyDir = keyDir;
        this.privateKey = null;
        this.publicKey = null;
        this.agentId = null;
        
        // 确保密钥目录存在
        if (!fs.existsSync(keyDir)) {
            fs.mkdirSync(keyDir, { recursive: true });
        }
    }
    
    /**
     * 生成新的 Agent 身份
     */
    generate(name) {
        this.name = name;
        
        // 生成 RSA 密钥对
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: KEY_SIZE,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        
        // 生成 Agent ID (基于公钥的 SHA256)
        const pubKeyDer = crypto.createPublicKey(publicKey).export({
            type: 'spki',
            format: 'der'
        });
        this.agentId = 'agent_' + crypto.createHash('sha256').update(pubKeyDer).digest('hex').substring(0, 16);
        
        return {
            name: this.name,
            agentId: this.agentId,
            publicKey: this.publicKey
        };
    }
    
    /**
     * 保存密钥到文件
     */
    save() {
        if (!this.privateKey || !this.publicKey) {
            throw new Error('No keys to save');
        }
        
        const prefix = path.join(this.keyDir, this.name);
        fs.writeFileSync(`${prefix}.private.pem`, this.privateKey, { mode: 0o600 });
        fs.writeFileSync(`${prefix}.public.pem`, this.publicKey);
        fs.writeFileSync(`${prefix}.id`, this.agentId);
        
        return {
            privateKeyPath: `${prefix}.private.pem`,
            publicKeyPath: `${prefix}.public.pem`,
            idPath: `${prefix}.id`
        };
    }
    
    /**
     * 从文件加载密钥
     */
    load(name) {
        this.name = name;
        const prefix = path.join(this.keyDir, name);
        
        if (!fs.existsSync(`${prefix}.private.pem`)) {
            return null;
        }
        
        this.privateKey = fs.readFileSync(`${prefix}.private.pem`, 'utf8');
        this.publicKey = fs.readFileSync(`${prefix}.public.pem`, 'utf8');
        this.agentId = fs.readFileSync(`${prefix}.id`, 'utf8').trim();
        
        return {
            name: this.name,
            agentId: this.agentId,
            publicKey: this.publicKey
        };
    }
    
    /**
     * 签名消息
     */
    sign(message) {
        if (!this.privateKey) {
            throw new Error('No private key');
        }
        
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        sign.end();
        
        return sign.sign(this.privateKey, 'base64');
    }
    
    /**
     * 验证签名
     */
    static verify(message, signature, publicKey) {
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(message);
            verify.end();
            
            return verify.verify(publicKey, signature, 'base64');
        } catch (err) {
            return false;
        }
    }
    
    /**
     * 获取身份信息
     */
    getInfo() {
        return {
            name: this.name,
            agentId: this.agentId,
            publicKey: this.publicKey
        };
    }
}

/**
 * AgentRegistry - 管理所有 Agent 的注册表
 */
class AgentRegistry {
    constructor() {
        this.agents = new Map(); // agentId -> { name, publicKey }
    }
    
    /**
     * 注册 Agent
     */
    register(name, agentId, publicKey) {
        this.agents.set(agentId, { name, publicKey, registeredAt: new Date().toISOString() });
        console.log(`[Registry] Agent registered: ${name} (${agentId})`);
        return true;
    }
    
    /**
     * 获取 Agent
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    
    /**
     * 验证消息签名
     */
    verifyMessage(agentId, message, signature) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            console.log(`[Registry] Agent not found: ${agentId}`);
            return false;
        }
        
        return AgentIdentity.verify(message, signature, agent.publicKey);
    }
    
    /**
     * 列出所有 Agent
     */
    listAgents() {
        return Array.from(this.agents.entries()).map(([id, data]) => ({
            agentId: id,
            name: data.name,
            registeredAt: data.registeredAt
        }));
    }
}

// 导出
module.exports = {
    AgentIdentity,
    AgentRegistry
};

// 测试
if (require.main === module) {
    console.log('=== Agent Identity Test ===\n');
    
    // 创建身份
    const agent = new AgentIdentity('TestAgent');
    const info = agent.generate();
    console.log('Generated Agent:', info);
    
    // 签名测试
    const message = 'Hello from TestAgent!';
    const signature = agent.sign(message);
    console.log('\nMessage:', message);
    console.log('Signature:', signature.substring(0, 50) + '...');
    
    // 验证测试
    const valid = AgentIdentity.verify(message, signature, info.publicKey);
    console.log('Signature valid:', valid);
    
    // 注册表测试
    const registry = new AgentRegistry();
    registry.register(info.name, info.agentId, info.publicKey);
    console.log('\nRegistered agents:', registry.listAgents());
    
    // 通过注册表验证
    const registryValid = registry.verifyMessage(info.agentId, message, signature);
    console.log('Registry verification:', registryValid);
}