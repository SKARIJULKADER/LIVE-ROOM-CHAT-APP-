import type { CapsuleCondition, ChatMessage, Room } from "./types.js";
export interface CreateCapsuleInput {
    text: string;
    condition: CapsuleCondition;
}
export declare function createTimeCapsule(room: Room, userId: string, username: string, input: CreateCapsuleInput): ChatMessage | {
    error: string;
};
export declare function tickCapsules(room: Room): void;
export declare function startCapsuleTicks(): void;
//# sourceMappingURL=timecapsules.d.ts.map