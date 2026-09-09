import type { ChaosEvent, Room } from "./types.js";
export declare function triggerChaos(room: Room, requestedBy: string): ChaosEvent;
/** a message arrived while an event is active - mark the author as a participant (once) */
export declare function noteMessageForChaos(room: Room, userId: string, username: string, text: string): void;
export declare function noteReactionForChaos(room: Room, userId: string, username: string): void;
//# sourceMappingURL=chaos.d.ts.map