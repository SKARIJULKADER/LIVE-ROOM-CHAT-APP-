import type { MysteryRound, Room } from "./types.js";
export declare function startMystery(room: Room): {
    round: MysteryRound;
} | {
    error: string;
};
export declare function castMysteryVote(room: Room, userId: string, targetId: string): {
    error?: string;
};
/** handle a user disconnecting during a round */
export declare function onUserLeftMystery(room: Room, userId: string): void;
//# sourceMappingURL=mystery.d.ts.map