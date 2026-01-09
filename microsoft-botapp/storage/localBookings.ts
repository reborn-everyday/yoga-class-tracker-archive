// src/storage/localBookings.ts
import fs from "node:fs";
import path from "node:path";

export type SessionState = {
  sessionId: string;
  capacity: number;
  bookedUserIds: string[]; // 저장은 배열로, 로딩 후 Set으로 써도 됨
  updatedAt: string;
};

export type BookingStore = {
  sessions: Record<string, SessionState>;
};

const STORE_PATH = path.join(process.cwd(), ".local-bookings.json");

function readStore(): BookingStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { sessions: {} };
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as BookingStore;
    return parsed?.sessions ? parsed : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

function writeStore(store: BookingStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function getSession(sessionId: string): SessionState | undefined {
  const store = readStore();
  return store.sessions[sessionId];
}

export function ensureSession(sessionId: string, capacity: number): SessionState {
  const store = readStore();
  const existing = store.sessions[sessionId];

  const next: SessionState = existing
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

export function hasBooking(sessionId: string, userId: string): boolean {
  const s = getSession(sessionId);
  return !!s?.bookedUserIds?.includes(userId);
}

export function book(sessionId: string, userId: string): { ok: boolean; reason?: "FULL" | "ALREADY_BOOKED"; session: SessionState } {
  const store = readStore();
  const s = store.sessions[sessionId];
  if (!s) {
    // 세션은 ensureSession으로 만들고 와야 함
    throw new Error(`Session not found: ${sessionId}`);
  }

  const already = s.bookedUserIds.includes(userId);
  if (already) return { ok: false, reason: "ALREADY_BOOKED", session: s };

  if (s.bookedUserIds.length >= s.capacity) {
    return { ok: false, reason: "FULL", session: s };
  }

  s.bookedUserIds.push(userId);
  s.updatedAt = new Date().toISOString();
  store.sessions[sessionId] = s;
  writeStore(store);
  return { ok: true, session: s };
}

export function cancel(sessionId: string, userId: string): { ok: boolean; reason?: "ALREADY_CANCELED"; session: SessionState } {
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