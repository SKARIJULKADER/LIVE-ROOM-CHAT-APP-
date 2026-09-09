import type { WebSocket } from "ws";
import type { Room } from "./types.js";
export declare function buildRoomState(room: Room, userId: string): Record<string, unknown>;
export declare function attachSocket(ws: WebSocket): void;
export declare function removeUserFromRoom(userId: string): void;
export declare function startPresenceTicks(): void;
export declare function onSocketClose(ws: WebSocket): void;
//# sourceMappingURL=handlers.d.ts.map