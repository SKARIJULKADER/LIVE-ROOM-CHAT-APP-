import { broadcast } from "./broadcast.js";
import { addSystemMessage } from "./store.js";
import { awardXp } from "./xp.js";
import { pick, uid } from "./util.js";
import type { ChaosEvent, Room } from "./types.js";

interface ChaosTemplate {
  kind: string;
  title: string;
  text: string;
  duration: number;
}

const TEMPLATES: readonly ChaosTemplate[] = [
  {
    kind: "SPEED_ROUND",
    title: "SPEED ROUND",
    text: "Everyone has 15 seconds to send a message.",
    duration: 15_000,
  },
  {
    kind: "EMOJI_ROUND",
    title: "EMOJI ROUND",
    text: "Describe your current mood using only emojis.",
    duration: 20_000,
  },
  {
    kind: "HOT_TAKE",
    title: "HOT TAKE",
    text: "Send your hottest opinion.",
    duration: 25_000,
  },
  {
    kind: "ONE_WORD",
    title: "ONE WORD",
    text: "Describe today in exactly one word.",
    duration: 15_000,
  },
  {
    kind: "RAPID_FIRE",
    title: "RAPID FIRE",
    text: "Send 3 messages in 10 seconds.",
    duration: 10_000,
  },
  {
    kind: "REACTION_STORM",
    title: "REACTION STORM",
    text: "React to the last message.",
    duration: 15_000,
  },
  {
    kind: "TRIVIA",
    title: "TRIVIA",
    text: "Answer the room's question.",
    duration: 30_000,
  },
];

export function triggerChaos(room: Room, requestedBy: string): ChaosEvent {
  // a chaos event is already running - extend it instead of stacking
  if (room.chaos) return room.chaos;

  const tpl = pick(TEMPLATES);
  const now = Date.now();
  const event: ChaosEvent = {
    id: uid("chaos-"),
    kind: tpl.kind,
    title: tpl.title,
    text: tpl.text,
    startsAt: now,
    endsAt: now + tpl.duration,
    participants: [],
    awarded: [],
  };
  room.chaos = event;
  room.stats.eventCount++;

  addSystemMessage(room, `⚡ CHAOS EVENT\n${tpl.title}\n${tpl.text}\nYou have ${Math.round(tpl.duration / 1000)} seconds. GO!`, "chaos");
  broadcast(room, "CHAOS_STARTED", {
    event,
    requestedBy,
  });
  console.log(`[chaos] ${room.id} <- ${tpl.title} by ${requestedBy}`);

  // auto-close
  setTimeout(() => {
    if (room.chaos?.id === event.id) {
      broadcast(room, "CHAOS_ENDED", { id: event.id });
      room.chaos = null;
    }
  }, tpl.duration + 250);

  return event;
}

/** a message arrived while an event is active - mark the author as a participant (once) */
export function noteMessageForChaos(room: Room, userId: string, username: string, text: string): void {
  const ev = room.chaos;
  if (!ev || ev.awarded.includes(userId)) return;
  const isEmojiRound = ev.kind === "EMOJI_ROUND" && !isOnlyEmoji(text);
  const isOneWord = ev.kind === "ONE_WORD" && text.trim().split(/\s+/).filter(Boolean).length !== 1;
  // RAPID_FIRE counts up to 3 separate messages
  if (isEmojiRound || isOneWord) return;
  const count = ev.participants.filter((id) => id === userId).length;
  if (ev.kind === "RAPID_FIRE" && count >= 3) return;
  if (!ev.awarded.includes(userId) && count >= 1 && ev.kind !== "RAPID_FIRE") return;

  ev.participants.push(userId);
  if (!ev.awarded.includes(userId) && ev.kind !== "RAPID_FIRE") {
    ev.awarded.push(userId);
    awardXp(room, userId, 25, "chaos_event", username);
  }
  // for RAPID_FIRE award once after the third msg? simpler: award on first.
  if (ev.kind === "RAPID_FIRE" && !ev.awarded.includes(userId)) {
    ev.awarded.push(userId);
    awardXp(room, userId, 25, "chaos_event", username);
  }
}

export function noteReactionForChaos(room: Room, userId: string, username: string): void {
  const ev = room.chaos;
  if (!ev || ev.awarded.includes(userId)) return;
  if (ev.kind === "REACTION_STORM") {
    ev.awarded.push(userId);
    awardXp(room, userId, 25, "chaos_event", username);
  }
}

function isOnlyEmoji(text: string): boolean {
  return /^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(text.trim());
}