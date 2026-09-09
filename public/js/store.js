// Client-side state store (lightweight, non-reactive by design).
// The UI reads directly from these module-level maps; render functions
// are called explicitly when an event arrives.

export const state = {
  connected: false,
  joined: false,
  roomId: "",
  roomTitle: "…",
  personalitySub: "a quiet room",
  self: {
    userId: "",
    username: "",
    xp: 0,
    level: 1,
    levelTitle: "Newcomer",
    progress: 0,
    xpForNext: null,
    mysteryRole: null,
  },
  users: new Map(), // id -> { id, username, status, isTyping, xp, messageCount }
  messages: [], // ChatMessage[]
  energy: { score: 0, label: "🌙 Calm", tier: "calm" },
  meta: {
    personality: { humor: 0, chaos: 0, deep: 0, activity: 0, positivity: 0, lateNight: 0, score: 0 },
    title: "The Conversation Lounge",
    moments: null,
    world: { points: 0, stage: 0, stageName: "🌱 Seed", branches: 0, flowers: 0, glows: 0 },
  },
  chaos: null, // { id, kind, title, text, startsAt, endsAt, participants, awarded }
  challenge: null, // { id, prompt, rule, startsAt, endsAt, participants, champion }
  polls: [], // Poll[]
  capsules: [], // Capsule[]
  mystery: null, // { roundId, phase, phaseEndsAt, impostorCount }
  typing: new Set(), // usernames currently typing
};

export function upsertUser(u) {
  const prev = state.users.get(u.id);
  state.users.set(u.id, {
    ...(prev ?? {}),
    id: u.id,
    username: u.username,
    status: u.status ?? "online",
    isTyping: u.isTyping ?? prev?.isTyping ?? false,
    xp: u.xp ?? prev?.xp ?? 0,
    messageCount: u.messageCount ?? prev?.messageCount ?? 0,
  });
}

export function findMessage(id) {
  return state.messages.find((m) => m.id === id);
}

export function upsertCapsule(capsule) {
  const idx = state.capsules.findIndex((c) => c.id === capsule.id);
  if (idx >= 0) state.capsules[idx] = capsule;
  else state.capsules.unshift(capsule);
}