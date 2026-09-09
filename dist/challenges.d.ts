import type { ChallengeRule, Room } from "./types.js";
export declare function startChallenge(room: Room, picks?: {
    prompt: string;
    rule: ChallengeRule;
    duration: number;
}): void;
export declare function finishChallenge(room: Room, championOverride?: string | null): void;
/** called when a new chat message arrives while a challenge is live */
export declare function noteMessageForChallenge(room: Room, userId: string, username: string, text: string): void;
/** called when a reaction arrives while a challenge is live */
export declare function noteReactionForChallenge(room: Room, userId: string, username: string): void;
export declare function scheduleNext(room: Room): void;
export declare function cancelChallengeSchedule(roomId: string): void;
//# sourceMappingURL=challenges.d.ts.map