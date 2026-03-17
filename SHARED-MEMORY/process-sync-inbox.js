#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const WORKSPACE = "/home/admin/.openclaw/workspace/SHARED-MEMORY";
const SHARED_MEMORY_FILE = path.join(WORKSPACE, "shared-memory.json");
const ARCHIVE_DIR = path.join(WORKSPACE, "archive");

function log(...args) {
    console.log(`[SYNC] ${new Date().toISOString()} -`, ...args);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadJson(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function mergeEntries(existing, incoming) {
    const existingMap = new Map();
    if (existing && existing.entries) {
        existing.entries.forEach(entry => existingMap.set(entry.id, entry));
    }
    let added = 0, updated = 0;
    incoming.forEach(entry => {
        if (existingMap.has(entry.id)) {
            const existingEntry = existingMap.get(entry.id);
            existingEntry.content = entry.content;
            existingEntry.structured = entry.structured;
            if (entry.temporal) existingEntry.temporal = entry.temporal;
            if (entry.preference_delta) existingEntry.preference_delta = entry.preference_delta;
            updated++;
        } else {
            existingMap.set(entry.id, { ...entry });
            added++;
        }
    });
    return { entries: Array.from(existingMap.values()), stats: { added, updated } };
}

function archiveInbox(inboxPath) {
    ensureDir(ARCHIVE_DIR);
    const fileName = path.basename(inboxPath);
    fs.renameSync(inboxPath, path.join(ARCHIVE_DIR, fileName));
    log(`Archived: ${fileName} -> archive/`);
}

function processInbox(inboxPath) {
    log(`Processing inbox: ${inboxPath}`);
    const inbox = loadJson(inboxPath);
    if (!inbox) { log("ERROR: Cannot load inbox file"); process.exit(1); }
    
    log(`Schema: ${inbox.schema}, Source: ${inbox.source}, Entries: ${inbox.entries.length}`);
    
    const sharedEntries = inbox.entries.filter(e => e.shared === true);
    const privateEntries = inbox.entries.filter(e => e.shared === false);
    log(`Shared: ${sharedEntries.length}, Private (skipped): ${privateEntries.length}`);
    
    const existingShared = loadJson(SHARED_MEMORY_FILE);
    const result = mergeEntries(existingShared, sharedEntries);
    
    const updatedShared = {
        schema: "co-claw-sync.v1",
        lastSync: new Date().toISOString(),
        source: inbox.source,
        entries: result.entries
    };
    saveJson(SHARED_MEMORY_FILE, updatedShared);
    log(`Saved: ${SHARED_MEMORY_FILE}`);
    
    archiveInbox(inboxPath);
    log(`=== SYNC COMPLETE === Added: ${result.stats.added}, Updated: ${result.stats.updated}, Total: ${result.entries.length}`);
    
    log("\n=== SHARED ENTRIES ===");
    result.entries.forEach(e => {
        log(`[${e.type || "fact"}:${e.structured?.scene || "unknown"}] ${e.content.substring(0, 60)}...`);
    });
}

const inboxFile = process.argv[2];
if (!inboxFile) { console.error("Usage: node process-sync-inbox.js <inbox-file>"); process.exit(1); }
const inboxPath = path.isAbsolute(inboxFile) ? inboxFile : path.join(WORKSPACE, inboxFile);
if (!fs.existsSync(inboxPath)) { log(`ERROR: File not found: ${inboxPath}`); process.exit(1); }
processInbox(inboxPath);
