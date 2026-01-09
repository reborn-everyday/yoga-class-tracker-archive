import type { SessionState } from "../storage/localBookings";
export type CardActionData = {
    action: "book" | "cancel";
    sessionId: string;
    capacity?: number;
};
export declare function buildSessionCard(args: {
    session: SessionState;
    viewerHasBooking: boolean;
}): {
    $schema: string;
    type: string;
    version: string;
    body: ({
        type: string;
        size: string;
        weight: string;
        text: string;
        wrap?: undefined;
        spacing?: undefined;
        isSubtle?: undefined;
    } | {
        type: string;
        wrap: boolean;
        text: string;
        size?: undefined;
        weight?: undefined;
        spacing?: undefined;
        isSubtle?: undefined;
    } | {
        type: string;
        wrap: boolean;
        spacing: string;
        isSubtle: boolean;
        text: string;
        size?: undefined;
        weight?: undefined;
    } | {
        type: string;
        wrap: boolean;
        spacing: string;
        text: string;
        size?: undefined;
        weight?: undefined;
        isSubtle?: undefined;
    })[];
    actions: {
        type: string;
        title: string;
        data: CardActionData;
    }[];
};
export declare function asAdaptiveCardAttachment(cardJson: any): {
    contentType: string;
    content: any;
};
