"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const teams_apps_1 = require("@microsoft/teams.apps");
const teams_api_1 = require("@microsoft/teams.api");
const config_1 = __importDefault(require("./config"));
/**
 * -----------------------------
 * 1) "LocalStorage" (파일 기반)
 * -----------------------------
 * - process.cwd() 기준으로 .local-bookings.json에 저장
 * - 세션별 예약자 목록 + 채널 메시지 참조(activityId 등) 저장
 */
const STORE_PATH = node_path_1.default.join(process.cwd(), ".local-bookings.json");
function readStore() {
    try {
        if (!node_fs_1.default.existsSync(STORE_PATH))
            return { sessions: {} };
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
function ensureSession(sessionId, capacity) {
    const store = readStore();
    const existing = store.sessions[sessionId];
    const next = existing
        ? {
            ...existing,
            capacity: Number.isFinite(existing.capacity) ? existing.capacity : capacity,
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
function setChannelMessageRef(sessionId, ref) {
    const store = readStore();
    const s = store.sessions[sessionId];
    if (!s)
        throw new Error(`Session not found: ${sessionId}`);
    s.channelMessage = ref;
    s.updatedAt = new Date().toISOString();
    store.sessions[sessionId] = s;
    writeStore(store);
}
function getSession(sessionId) {
    return readStore().sessions[sessionId];
}
function hasBooking(sessionId, userId) {
    const s = getSession(sessionId);
    return !!s?.bookedUserIds?.includes(userId);
}
function book(sessionId, userId) {
    const store = readStore();
    const s = store.sessions[sessionId];
    if (!s)
        throw new Error(`Session not found: ${sessionId}`);
    if (s.bookedUserIds.includes(userId))
        return { ok: false, reason: "ALREADY_BOOKED", session: s };
    if (s.bookedUserIds.length >= s.capacity)
        return { ok: false, reason: "FULL", session: s };
    s.bookedUserIds.push(userId);
    s.updatedAt = new Date().toISOString();
    store.sessions[sessionId] = s;
    writeStore(store);
    return { ok: true, session: s };
}
function cancel(sessionId, userId) {
    const store = readStore();
    const s = store.sessions[sessionId];
    if (!s)
        throw new Error(`Session not found: ${sessionId}`);
    const before = s.bookedUserIds.length;
    s.bookedUserIds = s.bookedUserIds.filter((id) => id !== userId);
    if (s.bookedUserIds.length === before)
        return { ok: false, reason: "ALREADY_CANCELED", session: s };
    s.updatedAt = new Date().toISOString();
    store.sessions[sessionId] = s;
    writeStore(store);
    return { ok: true, session: s };
}
/**
 * -----------------------------
 * 2) 유저 식별
 * -----------------------------
 * - aadObjectId가 가장 안정적
 */
function getUserId(activity) {
    return activity?.from?.aadObjectId || activity?.from?.id || "unknown-user";
}
/**
 * -----------------------------
 * 3) Adaptive Card 빌더
 * -----------------------------
 * - "채널용 카드": 누구에게나 동일 => 버튼은 항상 "예약/취소" 중 하나만 표시할 필요 없음.
 *   (채널에서 유저별 버튼 토글은 불가하므로)
 *   대신 채널카드는 '현재 예약 n/capacity'와 안내만 보여주고,
 *   실제 액션은 버튼 2개(예약/취소)를 모두 제공해도 UX가 가장 자연스러움.
 *
 * - "개인 응답 카드": viewerHasBooking에 따라 버튼 1개만 노출(예약 또는 취소)
 */
function buildChannelCard(session) {
    const n = session.bookedUserIds.length;
    const cap = session.capacity;
    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.5",
        body: [
            { type: "TextBlock", size: "Large", weight: "Bolder", text: "🧘‍♀️ 요가 수업 신청" },
            { type: "TextBlock", wrap: true, text: `현재 예약: **${n} / ${cap}**` },
            { type: "TextBlock", wrap: true, isSubtle: true, spacing: "Small", text: `sessionId: ${session.sessionId}` },
            {
                type: "TextBlock",
                wrap: true,
                spacing: "Small",
                text: n >= cap ? "⛔ 정원이 가득 찼어요. 취소 자리 발생 시 다시 예약 가능합니다." : "🙌 자리가 있어요! 예약 또는 취소를 눌러주세요.",
            },
        ],
        actions: [
            {
                type: "Action.Execute",
                title: "예약하기",
                data: { action: "book", sessionId: session.sessionId, capacity: cap },
            },
            {
                type: "Action.Execute",
                title: "취소하기",
                data: { action: "cancel", sessionId: session.sessionId, capacity: cap },
            },
        ],
    };
}
function buildPersonalCard(session, viewerHasBooking) {
    const n = session.bookedUserIds.length;
    const cap = session.capacity;
    const actionData = viewerHasBooking
        ? { action: "cancel", sessionId: session.sessionId, capacity: cap }
        : { action: "book", sessionId: session.sessionId, capacity: cap };
    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.5",
        body: [
            { type: "TextBlock", size: "Medium", weight: "Bolder", text: "내 예약 상태" },
            { type: "TextBlock", wrap: true, text: `현재 예약: **${n} / ${cap}**` },
            {
                type: "TextBlock",
                wrap: true,
                spacing: "Small",
                text: viewerHasBooking ? "✅ 이미 예약되어 있어요. 필요하면 취소할 수 있어요." : n >= cap ? "⛔ 정원이 가득 찼어요." : "🙌 예약 가능해요!",
            },
        ],
        actions: [
            {
                type: "Action.Execute",
                title: viewerHasBooking ? "취소하기" : "예약하기",
                data: actionData,
            },
        ],
    };
}
function asAdaptiveCardAttachment(cardJson) {
    return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: cardJson,
    };
}
/**
 * -----------------------------
 * 4) Teams App 초기화
 * -----------------------------
 * - 네 프로젝트의 기존 설정(env 등)에 맞춰 조정 필요
 */
const app = new teams_apps_1.App({
    clientId: config_1.default.MicrosoftAppId,
    clientSecret: config_1.default.MicrosoftAppPassword,
    tenantId: config_1.default.MicrosoftAppTenantId,
});
/**
 * -----------------------------
 * 5) 채널에 "세션 카드 게시" 커맨드
 * -----------------------------
 * - 채널에서:  post yoga <sessionId> <capacity>
 *   예) post yoga 2026-01-07-lunch 20
 *
 * - 봇이 채널에 카드 보내고,
 *   send 결과의 activity id를 sessionId에 저장
 *
 * ⚠️ send의 반환값은 환경/버전에 따라 다를 수 있음.
 *    teams-ai에서는 보통 `context.sendActivity()`의 반환이 ResourceResponse({ id }) 형태.
 *    여기서는 `context.sendActivity`를 사용해서 확실히 id를 얻도록 했음.
 */
app.message(/^\s*post\s+yoga\s+(\S+)\s+(\d+)\s*$/i, async (context) => {
    const text = (0, teams_api_1.stripMentionsText)(context.activity) ?? context.activity.text ?? "";
    const match = text.match(/^\s*post\s+yoga\s+(\S+)\s+(\d+)\s*$/i);
    const sessionId = match?.[1];
    const capStr = match?.[2];
    if (!sessionId || !capStr) {
        await context.send("형식: `post yoga <sessionId> <capacity>`");
        return;
    }
    const capacity = Number(capStr);
    const session = ensureSession(sessionId, capacity);
    const channelCard = buildChannelCard(session);
    // 채널에 카드 게시
    const sent = await context.send({
        type: "message",
        attachments: [asAdaptiveCardAttachment(channelCard)],
    });
    // UpdateActivity용 참조 저장
    const conversationId = context.activity.conversation?.id;
    const serviceUrl = context.activity.serviceUrl;
    const activityId = sent?.id;
    if (conversationId && serviceUrl && activityId) {
        setChannelMessageRef(sessionId, { conversationId, serviceUrl, activityId });
        await context.send(`✅ 세션 게시 완료: ${sessionId} (정원 ${capacity})`);
    }
    else {
        await context.send("⚠️ 카드 게시는 됐는데, 메시지 업데이트를 위한 참조를 저장하지 못했어. (conversationId/serviceUrl/activityId 누락)");
    }
});
/**
 * -----------------------------
 * 6) card.action 핸들러
 * -----------------------------
 * - 예약/취소 처리 후:
 *   (1) 채널 원본 카드 UpdateActivity로 n/capacity 갱신
 *   (2) 누른 유저에게 개인 카드(예약/취소 버튼 토글) 응답
 */
app.on("card.action", async (context) => {
    const activity = context.activity;
    // Teams payload: value.action.data 또는 value.data 등 변형 대응
    const value = activity.value;
    const rawData = (value?.action?.data ?? value?.data ?? value);
    const action = rawData?.action;
    const sessionId = rawData?.sessionId;
    const capacity = Number(rawData?.capacity ?? 12);
    if (!action || !sessionId) {
        return {
            statusCode: 400,
            type: "application/vnd.microsoft.error",
            value: {
                code: "BadRequest",
                message: "Missing action/sessionId",
                innerHttpError: { statusCode: 400, body: { error: "Missing action/sessionId" } },
            },
        };
    }
    // 세션 보장
    ensureSession(sessionId, capacity);
    const userId = getUserId(activity);
    // 1) 예약/취소 반영
    let toast;
    if (action === "book") {
        const viewerHas = hasBooking(sessionId, userId);
        if (viewerHas) {
            toast = "✅ 이미 예약되어 있어요.";
        }
        else {
            const r = book(sessionId, userId);
            if (!r.ok && r.reason === "FULL")
                toast = `⛔ 정원이 가득 찼어요. (현재 ${r.session.bookedUserIds.length}/${r.session.capacity})`;
            else
                toast = "✅ 예약 완료!";
        }
    }
    else if (action === "cancel") {
        const viewerHas = hasBooking(sessionId, userId);
        if (!viewerHas) {
            toast = "ℹ️ 이미 취소된 상태예요. 다시 예약할 수 있어요.";
        }
        else {
            cancel(sessionId, userId);
            toast = "🗑️ 예약 취소 완료!";
        }
    }
    else {
        return {
            statusCode: 400,
            type: "application/vnd.microsoft.error",
            value: {
                code: "BadRequest",
                message: "Unknown action",
                innerHttpError: { statusCode: 400, body: { error: "Unknown action" } },
            },
        };
    }
    // 최신 세션 로드
    const latest = getSession(sessionId) ?? ensureSession(sessionId, capacity);
    // 2) 채널 카드 UpdateActivity (n/capacity 갱신)
    // - session.channelMessage가 있어야 가능 (post yoga로 게시했을 때 저장됨)
    if (latest.channelMessage?.activityId && latest.channelMessage?.conversationId) {
        const updatedChannelCard = buildChannelCard(latest);
        // 업데이트는 conversations.activities(...).update()로 수행
        await context.api.conversations
            .activities(latest.channelMessage.conversationId)
            .update(latest.channelMessage.activityId, {
            type: "message",
            attachments: [asAdaptiveCardAttachment(updatedChannelCard)],
        });
    }
    // 3) 개인 카드 응답 (버튼 토글)
    const viewerHasBookingNow = hasBooking(sessionId, userId);
    const personalCard = buildPersonalCard(latest, viewerHasBookingNow);
    await context.send({
        type: "message",
        attachments: [asAdaptiveCardAttachment(personalCard)],
    });
    if (toast) {
        await context.send(`${toast} (session: ${sessionId})`);
    }
    return {
        statusCode: 200,
        type: "application/vnd.microsoft.activity.message",
        value: "Action processed successfully",
    };
});
/**
 * -----------------------------
 * 7) (선택) 기본 메시지 안내
 * -----------------------------
 */
app.message(/^\s*help\s*$/i, async (context) => {
    await context.send([
        "사용법:",
        "- 채널에 세션 카드 게시: `post yoga <sessionId> <capacity>`",
        "  예) `post yoga 2026-01-07-lunch 20`",
        "- 카드에서 예약/취소 누르면 채널 카드의 n/capacity가 자동 갱신됩니다.",
    ].join("\n"));
});
/**
 * -----------------------------
 * 8) 앱 시작
 * -----------------------------
 * - Teams App 내장 서버로 /api/messages 엔드포인트를 노출
 */
function start() {
    const port = process.env.PORT ? Number(process.env.PORT) : 3978;
    return app.start(port);
}
//# sourceMappingURL=app.js.map