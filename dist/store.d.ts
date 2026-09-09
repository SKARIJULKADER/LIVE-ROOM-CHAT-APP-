import type { WebSocket } from "ws";
import type { Room, RoomUser } from "./types.js";
/** userId -> current open socket (one socket per user, newest wins) */
export declare const socketByUser: Map<string, WebSocket>;
/** userId -> roomId they are currently in */
export declare const roomOfUser: Map<string, string>;
/** all rooms in memory */
export declare const rooms: Map<string, Room>;
export declare const MAX_HISTORY = 250;
export declare function createRoom(roomId: string, createdBy: string): Room;
export declare function getRoom(roomId: string): Room | undefined;
export declare function ensureRoom(roomId: string, createdBy: string): Room;
export declare function makeUser(id: string, username: string): RoomUser;
export declare function addSystemMessage(room: Room, text: string, kind?: "system" | "chaos" | "challenge" | "mystery" | "poll"): void;
export declare function roomUserCount(room: Room): number;
/** pick the most active opportunity - used to pick a random-ish target user */
export declare function randomOtherUser(room: Room, exceptId?: string): RoomUser | undefined;
//# sourceMappingURL=store.d.ts.map