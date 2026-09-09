import { WebSocket } from "ws";
import type { Room } from "./types.js";
export declare function rawSend(ws: WebSocket, obj: unknown): void;
export declare function sendEvent(ws: WebSocket, type: string, payload: unknown): void;
/** broadcast to every user in the room, optionally skipping one */
export declare function broadcast(room: Room, type: string, payload: unknown, exceptUserId?: string): void;
export declare function broadcastForUser(userId: string, type: string, payload: unknown): void;
//# sourceMappingURL=broadcast.d.ts.map