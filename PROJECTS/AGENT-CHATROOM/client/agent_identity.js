/**
 * Agent Identity - Browser Version
 * 
 * 功能:
 * - 生成密钥对 (RSA-2048)
 * - 创建 Agent ID
 * - 签名消息
 * - 验证签名
 * - 本地存储密钥
 * 
 * Author: Claw
 * Date: 2026-03-18
 */

class AgentIdentityBrowser {
    constructor(name = null) {
        this.name = name;
        this.privateKey = null;
        this.publicKey = null;
        this.agentId = null;
        this.STORAGE_KEY = 'agent_identity';
    }

    /**
     * 生成新的 Agent 身份
     */
    async generate(name) {
        this.name = name;
        
        // 使用 Web Crypto API 生成 RSA 密钥对
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: 'RSASSA-PKCS1-v1_5',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['sign', 'verify']
        );

        this.privateKey = keyPair.privateKey;
        this.publicKey = keyPair.publicKey;

        // 导出公钥为 PEM 格式
        const pubKeyDer = await window.crypto.subtle.exportKey('spki', this.publicKey);
        const pubKeyBase64 = this.arrayBufferToBase64(pubKeyDer);
        this.publicKeyPem = this.formatPem(pubKeyBase64, 'PUBLIC KEY');

        // 生成 Agent ID (基于公钥的 SHA256)
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', pubKeyDer);
        const hashArray = new Uint8Array(hashBuffer);
        const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
        this.agentId = 'agent_' + hashHex.substring(0, 16);

        // 保存到本地存储
        await this.save();

        return this.getInfo();
    }

    /**
     * 从本地存储加载身份
     */
    async load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return null;

            const data = JSON.parse(stored);
            
            // 导入私钥
            const privateKeyDer = this.base64ToArrayBuffer(data.privateKey);
            this.privateKey = await window.crypto.subtle.importKey(
                'pkcs8',
                privateKeyDer,
                {
                    name: 'RSASSA-PKCS1-v1_5',
                    hash: 'SHA-256'
                },
                true,
                ['sign']
            );

            // 导入公钥
            const publicKeyDer = this.base64ToArrayBuffer(data.publicKey);
            this.publicKey = await window.crypto.subtle.importKey(
                'spki',
                publicKeyDer,
                {
                    name: 'RSASSA-PKCS1-v1_5',
                    hash: 'SHA-256'
                },
                true,
                ['verify']
            );

            this.publicKeyPem = data.publicKeyPem;
            this.agentId = data.agentId;
            this.name = data.name;

            return this.getInfo();
        } catch (err) {
            console.error('[AgentIdentity] Load failed:', err);
            return null;
        }
    }

    /**
     * 保存身份到本地存储
     */
    async save() {
        if (!this.privateKey || !this.publicKey) {
            throw new Error('No keys to save');
        }

        // 导出私钥
        const privateKeyDer = await window.crypto.subtle.exportKey('pkcs8', this.privateKey);
        const privateKeyBase64 = this.arrayBufferToBase64(privateKeyDer);

        // 导出公钥
        const publicKeyDer = await window.crypto.subtle.exportKey('spki', this.publicKey);
        const publicKeyBase64 = this.arrayBufferToBase64(publicKeyDer);

        const data = {
            name: this.name,
            agentId: this.agentId,
            privateKey: privateKeyBase64,
            publicKey: publicKeyBase64,
            publicKeyPem: this.publicKeyPem,
            createdAt: new Date().toISOString()
        };

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    /**
     * 签名消息
     */
    async sign(message) {
        if (!this.privateKey) {
            throw new Error('No private key');
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(message);

        const signature = await window.crypto.subtle.sign(
            'RSASSA-PKCS1-v1_5',
            this.privateKey,
            data
        );

        return this.arrayBufferToBase64(signature);
    }

    /**
     * 验证签名
     */
    static async verify(message, signature, publicKeyPem) {
        try {
            // 解析 PEM 公钥
            const pubKeyBase64 = publicKeyPem
                .replace('-----BEGIN PUBLIC KEY-----', '')
                .replace('-----END PUBLIC KEY-----', '')
                .replace(/\s/g, '');
            
            const publicKeyDer = this.base64ToArrayBufferStatic(pubKeyBase64);
            
            const publicKey = await window.crypto.subtle.importKey(
                'spki',
                publicKeyDer,
                {
                    name: 'RSASSA-PKCS1-v1_5',
                    hash: 'SHA-256'
                },
                true,
                ['verify']
            );

            const encoder = new TextEncoder();
            const data = encoder.encode(message);
            const signatureBuffer = this.base64ToArrayBufferStatic(signature);

            const valid = await window.crypto.subtle.verify(
                'RSASSA-PKCS1-v1_5',
                publicKey,
                signatureBuffer,
                data
            );

            return valid;
        } catch (err) {
            console.error('[AgentIdentity] Verify failed:', err);
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
            publicKey: this.publicKeyPem
        };
    }

    /**
     * 清除身份
     */
    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.privateKey = null;
        this.publicKey = null;
        this.agentId = null;
    }

    // 工具函数
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    static base64ToArrayBufferStatic(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    formatPem(base64, label) {
        const chunkSize = 64;
        const chunks = base64.match(new RegExp(`.{1,${chunkSize}}`, 'g'));
        return `-----BEGIN ${label}-----\n${chunks.join('\n')}\n-----END ${label}-----`;
    }
}

// 导出
window.AgentIdentityBrowser = AgentIdentityBrowser;
