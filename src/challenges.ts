import { broadcast } from "./broadcast.js";
import { awardXp } from "./xp.js";
import { uid } from "./util.js";
import type { Challenge, ChallengeRule, Room } from "./types.js";

interface ChallengeTemplate {
  prompt: string;
  rule: ChallengeRule;
  duration: number;
}

const TEMPLATES: readonly ChallengeTemplate[] = [
  { prompt: "Describe your day using exactly 3 words.", rule: "three_words", duration: 75_000 },
  { prompt: "Send only emojis for your next message.", rule: "emoji", duration: 75_000 },
  { prompt: "Who would survive a zombie apocalypse? Tell us.", rule: "any", duration: 90_000 },
  { prompt: "Describe your mood without using words.", rule: "emoji", duration: 75_000 },
  { prompt: "Give someone in this room a compliment.", rule: "any", duration: 75_000 },
  { prompt: "What's one thing you'd change about the world?", rule: "any", duration: 90_000 },
  { prompt: "Send the first movie that pops into your head.", rule: "short", duration: 45_000 },
  { prompt: "Describe today in exactly one word.", rule: "single_word", duration: 60_000 },
  { prompt: "React with 🔥 to the last message.", rule: "reaction", duration: 45_000 },
  { prompt: "Confess a harmless secret about your day.", rule: "any", duration: 60_000 },
];

let nextSchedule = new Map<string, ReturnType<typeof setTimeout>>();

export function startChallenge(room: Room, picks?: { prompt: string; rule: ChallengeRule; duration: number }): void {
  if (room.challenge) return;
  const tpl = picks ?? randomTemplate();
  const now = Date.now();
  const challenge: Challenge = {
    id: uid("ch-"),
    prompt: tpl.prompt,
    rule: tpl.rule,
    startsAt: now,
    endsAt: now + tpl.duration,
    participants: {},
    champion: null,
  };
  room.challenge = challenge;
  room.stats.challengeCount++;
  broadcast(room, "CHALLENGE_STARTED", { challenge });
  console.log(`[challenge] ${room.id} <- ${tpl.prompt}`);

  if (room.challengeTimer) clearTimeout(room.challengeTimer);
  room.challengeTimer = setTimeout(() => {
    finishChallenge(room);
  }, tpl.duration + 300);
}

function randomTemplate(): ChallengeTemplate {
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)] as ChallengeTemplate;
}

export function finishChallenge(room: Room, championOverride?: string | null): void {
  const ch = room.challenge;
  if (!ch) return;
  broadcast(room, "CHALLENGE_ENDED", {
    id: ch.id,
    champion: championOverride ?? ch.champion,
    participantCount: Object.keys(ch.participants).length,
  });
  const winner = championOverride ?? ch.champion;
  if (winner) {
    room.stats.challengeChampion = { username: winner };
  }
  room.challenge = null;
  scheduleNext(room);
}

/** called when a new chat message arrives while a challenge is live */
export function noteMessageForChallenge(room: Room, userId: string, username: string, text: string): void {
  const ch = room.challenge;
  if (!ch || ch.participants[userId]?.completed) return;
  const ok = qualifies(ch.rule, text);
  if (!ok) return;
  markCompleted(room, ch, userId, username);
}

/** called when a reaction arrives while a challenge is live */
export function noteReactionForChallenge(room: Room, userId: string, username: string): void {
  const ch = room.challenge;
  if (!ch || ch.participants[userId]?.completed) return;
  if (ch.rule !== "reaction") return;
  markCompleted(room, ch, userId, username);
}

function qualifies(rule: ChallengeRule, text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  switch (rule) {
    case "three_words":
      return tokens.length === 3;
    case "single_word":
      return tokens.length === 1;
    case "emoji":
      return /^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(text.trim());
    case "short":
      return tokens.length <= 4;
    case "any":
      return text.trim().length > 0;
    case "reaction":
      return false;
  }
}

function markCompleted(room: Room, ch: Challenge, userId: string, username: string): void {
  ch.participants[userId] = { username, completedAt: Date.now(), completed: true };
  if (!ch.champion) ch.champion = username;
  awardXp(room, userId, 50, "challenge_complete", username);
  broadcast(room, "CHALLENGE_COMPLETED", {
    challengeId: ch.id,
    user: { id: userId, username },
  });
  console.log(`[challenge] ${room.id} completed by ${username}`);
  // celebrate early: end challenge once ≥ half the room completed or champion set? keep full window.
}

export function scheduleNext(room: Room): void {
  const existing = nextSchedule.get(room.id);
  if (existing) clearTimeout(existing);
  const delay = 90_000 + Math.floor(Math.random() * 240_000); // 1.5m - 5.5m
  const timer = setTimeout(() => {
    startChallenge(room);
  }, delay);
  nextSchedule.set(room.id, timer);
}

export function cancelChallengeSchedule(roomId: string): void {
  const existing = nextSchedule.get(roomId);
  if (existing) clearTimeout(existing);
  nextSchedule.delete(roomId);
}