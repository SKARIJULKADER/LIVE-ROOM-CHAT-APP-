// WebSocket connection with automatic reconnection and a small event router.
import { state } from "./store.js";
import { $ } from "./utils.js";

const RECONNECT_MS = [800, 1600, 3200, 5000, 8000];

export const socket = {
  ws: null,
  /** handlers by event type */
  handlers: new Map(),
  retry: 0,
  timer: null,
  joinPayload: null, // { roomId, username, userId } used to rejoin after reconnect
  connectedAt: 0,
  joined: false, // true once the server confirmed the join (ROOM_STATE)
  outbox: [], // frames queued while the socket was down, flushed after join
};

export function on(type, fn) {
  socket.handlers.set(type, fn);
}

function setConn(stateName, label) {
  const conn = $("#conn");
  if (!conn) return;
  conn.dataset.state = stateName;
  $("#conn-label").textContent = label;
  state.connected = stateName === "online";
}

export function connect(joinPayload) {
  // keep frames queued for the SAME room (e.g. typed right before/while
  // (re)connecting); only drop them when we are actually switching rooms
  const roomChanged = socket.joinPayload != null && socket.joinPayload.roomId !== joinPayload?.roomId;
  socket.joinPayload = joinPayload;
  socket.joined = false;
  if (roomChanged) socket.outbox.length = 0;
  if (socket.ws) {
    try { socket.ws.close(); } catch { /* ignore */ }
    socket.ws = null;
  }
  openSocket();
}

function openSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/ws`;
  try {
    const ws = new WebSocket(url);
    socket.ws = ws;

    ws.onopen = () => {
      socket.retry = 0;
      socket.connectedAt = Date.now();
      setConn("online", "Connected");
      // rejoin / join the room
      if (socket.joinPayload) {
        ws.send(JSON.stringify({ type: "JOIN_ROOM", payload: socket.joinPayload }));
      }
    };

    ws.onmessage = (ev) => {
      let frame;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!frame || typeof frame.type !== "string") return;
      // join confirmed: flush anything queued while the socket was down
      if (frame.type === "ROOM_STATE") {
        socket.joined = true;
        const queued = socket.outbox.splice(0);
        for (const f of queued) {
          try { ws.send(JSON.stringify(f)); } catch { /* ignore */ }
        }
      }
      const fn = socket.handlers.get(frame.type);
      if (fn) {
        try {
          fn(frame.payload ?? {});
        } catch (err) {
          console.error("[client] handler error for", frame.type, err);
        }
      }
    };

    ws.onclose = () => {
      socket.joined = false; // queue sends until we rejoin
      const wasOnline = state.connected;
      setConn("reconnecting", "Reconnecting…");
      if (wasOnline && socket.joinPayload) {
        // notify handlers the connection dropped
        const drop = socket.handlers.get("__disconnect__");
        if (drop) drop();
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (socket.timer) return;
  const delay = RECONNECT_MS[Math.min(socket.retry, RECONNECT_MS.length - 1)];
  socket.retry++;
  socket.timer = setTimeout(() => {
    socket.timer = null;
    openSocket();
  }, delay);
}

/** send a frame; queues while connecting/reconnecting so nothing is silently lost */
export function send(type, payload = {}) {
  const ws = socket.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN || !socket.joined) {
    if (socket.outbox.length < 100) socket.outbox.push({ type, payload });
    return;
  }
  ws.send(JSON.stringify({ type, payload }));
}