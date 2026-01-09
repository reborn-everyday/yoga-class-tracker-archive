"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSessionCard = buildSessionCard;
exports.asAdaptiveCardAttachment = asAdaptiveCardAttachment;
function buildSessionCard(args) {
    const { session, viewerHasBooking } = args;
    const n = session.bookedUserIds.length;
    const cap = session.capacity;
    const primaryAction = viewerHasBooking
        ? { action: "cancel", sessionId: session.sessionId, capacity: cap }
        : { action: "book", sessionId: session.sessionId, capacity: cap };
    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.5",
        body: [
            {
                type: "TextBlock",
                size: "Large",
                weight: "Bolder",
                text: "🧘‍♀️ 요가 수업 예약",
            },
            {
                type: "TextBlock",
                wrap: true,
                text: `현재 예약: **${n} / ${cap}**`,
            },
            {
                type: "TextBlock",
                wrap: true,
                spacing: "Small",
                isSubtle: true,
                text: `sessionId: ${session.sessionId}`,
            },
            ...(viewerHasBooking
                ? [
                    {
                        type: "TextBlock",
                        wrap: true,
                        spacing: "Small",
                        text: "✅ 이미 예약되어 있어요. 필요하면 취소할 수 있어요.",
                    },
                ]
                : [
                    {
                        type: "TextBlock",
                        wrap: true,
                        spacing: "Small",
                        text: n >= cap ? "⛔ 현재 정원이 가득 찼어요." : "🙌 예약 가능해요!",
                    },
                ]),
        ],
        actions: [
            {
                type: "Action.Execute",
                title: viewerHasBooking ? "취소하기" : "예약하기",
                data: primaryAction, // Teams payload에서 value.action.data로 들어올 가능성이 큼
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
//# sourceMappingURL=sessionCard.js.map