import type { LevelInfo, Room, RoomUser } from "./types.js";
interface LevelDef {
    level: number;
    xp: number;
    title: string;
}
export declare const LEVELS: readonly LevelDef[];
export declare function getLevelInfo(xp: number): LevelInfo;
/**
 * Award XP to a room user and notify the whole room.
 * Returns true when XP actually changed.
 */
export declare function awardXp(room: Room, userId: string, amount: number, reason: string, actor?: string): boolean;
export declare function publicUserFromRoomUser(user: RoomUser): {
    id: string;
    username: string;
    status: string;
    isTyping: boolean;
    xp: number;
    messageCount: number;
};
export {};
//# sourceMappingURL=xp.d.ts.map