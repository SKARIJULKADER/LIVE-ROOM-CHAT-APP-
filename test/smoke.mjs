// Smoke test for the LIVE ROOM server.
// Connects several real websocket clients and exercises the core events.
import { WebSocket } from "ws";

const URL = process.env.WS_URL ?? "ws://localhost:8080/ws";
const roomId = "test-room-" + Date.now();

const states = {
  alpha: { roomState: false, sawReaction: false },
  beta: { roomState: false, receivedMsg: null },
  carol: { roomState: false },
};

const streams = { alpha: [], beta: [], carol: [] };

function connect(name) {
  const ws = new WebSocket(URL);
  ws.on("message", (d) => {
    const frame = JSON.parse(d.toString());
    streams[name].push(frame.type);
    const payload = frame.payload;
    switch (frame.type) {
      case "ROOM_STATE":
        states[name].roomState = true;
        break;
      case "MESSAGE":
        if (payload.text === "hello live world") {
          states.beta.receivedMsg = payload;
        }
        break;
      case "REACTION_UPDATED":
        if (payload.added) states[name].sawReaction = true;
        break;
    }
  });
  return ws;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (ws, type, payload = {}) => ws.send(JSON.stringify({ type, payload }));

const alice = connect("alpha");
const bob = connect("beta");

await sleep(300);

// join both
send(alice, "JOIN_ROOM", { roomId, username: "Alice" });
await sleep(250);
console.log("alpha ROOM_STATE:", states.alpha.roomState);
send(bob, "JOIN_ROOM", { roomId, username: "Bob" });
await sleep(250);
console.log("beta ROOM_STATE:", states.beta.roomState);

// typing + stop
send(bob, "USER_TYPING");
await sleep(150);
console.log("alpha saw TYPING_START:", streams.alpha.includes("TYPING_START"));
send(bob, "STOP_TYPING");
await sleep(150);

// message roundtrip
send(alice, "SEND_MESSAGE", { text: "hello live world", clientId: "m1" });
await sleep(250);
console.log("beta received message:", states.beta.receivedMsg !== null);
console.log("alpha saw own broadcast MESSAGE:", streams.alpha.includes("MESSAGE"));

// reaction
const msgId = states.beta.receivedMsg?.id;
send(alice, "REACTION_TOGGLE", { messageId: msgId, emoji: "🔥" });
await sleep(250);
console.log("beta saw reaction update:", states.beta.sawReaction);

// chaos (authoritative event)
send(bob, "CHAOS_TRIGGER");
await sleep(250);
console.log("alpha saw CHAOS_STARTED:", streams.alpha.includes("CHAOS_STARTED"));
console.log("beta saw CHAOS_STARTED:", streams.beta.includes("CHAOS_STARTED"));

// poll create + vote
send(alice, "POLL_CREATE", { question: "What should we do tonight?", options: ["🍕 Pizza", "🍔 Burger", "🍜 Chinese"] });
await sleep(250);
console.log("beta saw POLL_CREATED:", streams.beta.includes("POLL_CREATED"));

// time capsule
send(alice, "TIME_CAPSULE_CREATE", { text: "Hello future us", condition: { type: "messages", count: 3 } });
await sleep(250);
console.log("alpha saw TIME_CAPSULE_CREATED:", streams.alpha.includes("TIME_CAPSULE_CREATED"));
console.log("beta saw TIME_CAPSULE_CREATED:", streams.beta.includes("TIME_CAPSULE_CREATED"));

// mystery needs >= 3 users
const carol = connect("carol");
await sleep(150);
send(carol, "JOIN_ROOM", { roomId, username: "Carol" });
await sleep(250);
send(bob, "MYSTERY_ACTIVATE");
await sleep(250);
console.log("alpha saw MYSTERY_STARTED:", streams.alpha.includes("MYSTERY_STARTED"));
console.log("carol saw MYSTERY_ROLE:", streams.carol.includes("MYSTERY_ROLE"));

// invalid room id
send(alice, "JOIN_ROOM", { roomId: "", username: "Alice" });
await sleep(150);
console.log("alpha got ERROR on empty roomId:", streams.alpha.includes("ERROR"));

// let the energy ticker emit at least one update (3s tick)
await sleep(3600);
console.log("beta received ENERGY_UPDATE:", streams.beta.includes("ENERGY_UPDATE"));
console.log("beta received ROOM_META_UPDATE:", streams.beta.includes("ROOM_META_UPDATE"));

console.log("\n=== EVENTS BY STREAM ===");
for (const [name, events] of Object.entries(streams)) {
  console.log(`${name}: ${events.join(", ")}`);
}

for (const ws of [alice, bob, carol]) ws.close();
await sleep(200);
process.exit(0);