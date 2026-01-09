"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.ensureSession = ensureSession;
exports.hasBooking = hasBooking;
exports.book = book;
exports.cancel = cancel;
// src/storage/localBookings.ts
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const STORE_PATH = node_path_1.default.join(process.cwd(), ".local-bookings.json");
function readStore() {
    try {
        if (!node_fs_1.default.existsSync(STORE_PATH)) {
            return { sessions: {} };
        }
        const raw = node_fs_1.default.readFileSync(STORE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed?.sessions ? parsed : { sessions: {} };
    }
    catch {
        return { sessions: {} };
    }
}
function writeStore(store) {
    node_fs_1.default.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}
function getSession(sessionId) {
    const store = readStore();
    return store.sessions[sessionId];
}
function ensureSession(sessionId, capacity) {
    const store = readStore();
    const existing = store.sessions[sessionId];
    const next = existing
        ? {
            ...existing,
            // capacity는 “처음 생성” 이후엔 유지. (원하면 여기서 최신 값으로 덮어써도 됨)
            capacity: existing.capacity ?? capacity,
            updatedAt: new Date().toISOString(),
        }
        : {
            sessionId,
            capacity,
            bookedUserIds: [],
            updatedAt: new Date().toISOString(),
        };
    store.sessions[sessionId] = next;
    writeStore(store);
    return next;
}
function hasBooking(sessionId, userId) {
    const s = getSession(sessionId);
    return !!s?.bookedUserIds?.includes(userId);
}
function book(sessionId, userId) {
    const store = readStore();
    const s = store.sessions[sessionId];
    if (!s) {
        // 세션은 ensureSession으로 만들고 와야 함
        throw new Error(`Session not found: ${sessionId}`);
    }
    const already = s.bookedUserIds.includes(userId);
    if (already)
        return { ok: false, reason: "ALREADY_BOOKED", session: s };
    if (s.bookedUserIds.length >= s.capacity) {
        return { ok: false, reason: "FULL", session: s };
    }
    s.bookedUserIds.push(userId);
    s.updatedAt = new Date().toISOString();
    store.sessions[sessionId] = s;
    writeStore(store);
    return { ok: true, session: s };
}
function cancel(sessionId, userId) {
    const store = readStore();
    const s = store.sessions[sessionId];
    if (!s) {
        throw new Error(`Session not found: ${sessionId}`);
    }
    const before = s.bookedUserIds.length;
    s.bookedUserIds = s.bookedUserIds.filter((id) => id !== userId);
    if (s.bookedUserIds.length === before) {
        return { ok: false, reason: "ALREADY_CANCELED", session: s };
    }
    s.updatedAt = new Date().toISOString();
    store.sessions[sessionId] = s;
    writeStore(store);
    return { ok: true, session: s };
}
//# sourceMappingURL=localBookings.js.map