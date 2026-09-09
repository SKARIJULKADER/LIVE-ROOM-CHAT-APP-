import { WebSocket } from "ws";
import { socketByUser } from "./store.js";
import type { Room } from "./types.js";

export function rawSend(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* ignore send errors on dead sockets */
    }
  }
}

export function sendEvent(ws: WebSocket, type: string, payload: unknown): void {
  rawSend(ws, { type, payload });
}

/** broadcast to every user in the room, optionally skipping one */
export function broadcast(room: Room, type: string, payload: unknown, exceptUserId?: string): void {
  for (const userId of room.users.keys()) {
    if (userId === exceptUserId) continue;
    const ws = socketByUser.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendEvent(ws, type, payload);
    }
  }
}

export function broadcastForUser(userId: string, type: string, payload: unknown): void {
  const ws = socketByUser.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendEvent(ws, type, payload);
  }
}