import { WebSocket } from "ws";
import { socketByUser } from "./store.js";
export function rawSend(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(obj));
        }
        catch {
            /* ignore send errors on dead sockets */
        }
    }
}
export function sendEvent(ws, type, payload) {
    rawSend(ws, { type, payload });
}
/** broadcast to every user in the room, optionally skipping one */
export function broadcast(room, type, payload, exceptUserId) {
    for (const userId of room.users.keys()) {
        if (userId === exceptUserId)
            continue;
        const ws = socketByUser.get(userId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendEvent(ws, type, payload);
        }
    }
}
export function broadcastForUser(userId, type, payload) {
    const ws = socketByUser.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendEvent(ws, type, payload);
    }
}
//# sourceMappingURL=broadcast.js.map