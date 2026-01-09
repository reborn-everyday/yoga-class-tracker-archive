export type SessionState = {
    sessionId: string;
    capacity: number;
    bookedUserIds: string[];
    updatedAt: string;
};
export type BookingStore = {
    sessions: Record<string, SessionState>;
};
export declare function getSession(sessionId: string): SessionState | undefined;
export declare function ensureSession(sessionId: string, capacity: number): SessionState;
export declare function hasBooking(sessionId: string, userId: string): boolean;
export declare function book(sessionId: string, userId: string): {
    ok: boolean;
    reason?: "FULL" | "ALREADY_BOOKED";
    session: SessionState;
};
export declare function cancel(sessionId: string, userId: string): {
    ok: boolean;
    reason?: "ALREADY_CANCELED";
    session: SessionState;
};
