import type { ChatMessage, Room } from "./types.js";
/** called for every delivered chat message ("kind: message") */
export declare function analyzeMessage(room: Room, msg: ChatMessage): void;
export declare function trackReaction(room: Room, emoji: string): void;
export declare function trackMostReacted(room: Room, messageId: string, text: string, count: number): void;
export declare function computePersonality(room: Room): {
    score: number;
    nice: number;
    title: string;
};
export declare function computeWorld(room: Room): Room["world"];
export declare function metaPayload(room: Room): {
    personality: {
        humor: number;
        chaos: number;
        deep: number;
        activity: number;
        positivity: number;
        lateNight: number;
        score: number;
    };
    title: string;
    moments: Room["stats"];
    world: Room["world"];
};
export declare function broadcastMeta(room: Room): void;
export declare function startMetaTicks(): void;
//# sourceMappingURL=meta.d.ts.map