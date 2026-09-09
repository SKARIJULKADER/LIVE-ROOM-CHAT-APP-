// Regression check for the "sent message silently disappears" bug.
// Exercises public/js/connection.js queueing: frames sent before the socket is
// open / before the join is confirmed must be flushed to the wire afterwards.
// Runs in-process (import) or standalone: node test/outbox-check.mjs
import { pathToFileURL } from "node:url";

export async function checkOutbox() {
  // --- minimal browser shims (connection.js touches location/WebSocket only) ---
  // save & restore so in-process consumers (run-all) are not affected
  const saved = {
    WebSocket: globalThis.WebSocket,
    location: globalThis.location,
    document: globalThis.document,
  };
  const sent = [];
  class FakeWS {
    static OPEN = 1;
    constructor() {
      this.readyState = 0; // CONNECTING
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
    }
    send(data) { sent.push(JSON.parse(data)); }
    emit(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  }
  globalThis.WebSocket = FakeWS;
  globalThis.location = { protocol: "http:", host: "localhost:8080" };
  globalThis.document = { querySelector: () => null };

  try {
    return await runCheck(sent);
  } finally {
    globalThis.WebSocket = saved.WebSocket;
    globalThis.location = saved.location;
    globalThis.document = saved.document;
  }
}

async function runCheck(sent) {
  const mod = await import("../public/js/connection.js");

  // 1. send while NOT connected -> must be queued, not dropped
  mod.send("SEND_MESSAGE", { text: "queued hello", clientId: "m-test" });

  // 2. connect() -> socket opens -> JOIN_ROOM goes out; queue must NOT flush before join ack
  mod.connect({ roomId: "outbox-test", username: "Tester", userId: "user-test" });
  await new Promise((r) => setTimeout(r, 30));
  const typesSoFar = sent.map((f) => f.type);
  const prematureFlush = typesSoFar.includes("SEND_MESSAGE");

  // 3. server confirms join (ROOM_STATE) -> queue must flush now
  // (the live socket is reachable through the module's exported `socket`)
  mod.socket.ws.emit({ type: "ROOM_STATE", payload: {} });

  const after = sent.map((f) => f.type);
  const queuedDelivered = after.includes("SEND_MESSAGE");
  const joinFirst = after.indexOf("JOIN_ROOM") !== -1 && after.indexOf("JOIN_ROOM") < after.indexOf("SEND_MESSAGE");

  // 4. sends while connected go straight to the wire (no double-queue)
  mod.send("SEND_MESSAGE", { text: "direct hello", clientId: "m-test-2" });
  const direct = sent.some((f) => f.type === "SEND_MESSAGE" && f.payload?.text === "direct hello");

  const pass = !prematureFlush && queuedDelivered && joinFirst && direct;
  return {
    pass,
    detail: { prematureFlush, queuedDelivered, joinFirst, direct, wire: sent.map((f) => f.type + (f.payload?.text ? `:${f.payload.text}` : "")) },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { pass, detail } = await checkOutbox();
  console.log(JSON.stringify(detail, null, 2));
  console.log(pass ? "✅ OUTBOX CHECK PASS — queued messages are flushed after join, nothing dropped" : "❌ OUTBOX CHECK FAIL");
  process.exit(pass ? 0 : 1);
}
