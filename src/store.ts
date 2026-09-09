import type { WebSocket } from "ws";
import { pick } from "./util.js";
import type { Room, RoomUser, TraitKey } from "./types.js";

/** userId -> current open socket (one socket per user, newest wins) */
export const socketByUser = new Map<string, WebSocket>();

/** userId -> roomId they are currently in */
export const roomOfUser = new Map<string, string>();

/** all rooms in memory */
export const rooms = new Map<string, Room>();

export const MAX_HISTORY = 250;

const TRAIT_KEYS: readonly TraitKey[] = [
  "humor",
  "chaos",
  "deep",
  "activity",
  "positivity",
  "lateNight",
];

function emptyTraits(): Record<TraitKey, number> {
  const t = {} as Record<TraitKey, number>;
  for (const k of TRAIT_KEYS) t[k] = 0;
  return t;
}

export function createRoom(roomId: string, createdBy: string): Room {
  const now = Date.now();
  const room: Room = {
    id: roomId,
    name: roomId,
    createdAt: now,
    users: new Map(),
    messages: [],
    activity: {
      messageTs: [],
      reactionTs: [],
      gaps: [],
      lastMsgAt: 0,
      userActivity: new Map(),
    },
    traits: emptyTraits(),
    traitState: { score: 0, nice: 0, title: "The Conversation Lounge" },
    stats: {
      messageCount: 0,
      reactionCount: 0,
      eventCount: 0,
      challengeCount: 0,
      capsuleCount: 0,
      pollCount: 0,
      totalWords: 0,
      lastActivityAt: 0,
      peakMinute: { count: 0, at: now },
      mostReacted: null,
      mostActive: null,
      mostUsed: null,
      challengeChampion: null,
    },
    energy: { score: 0, label: "🌙 Calm", tier: "calm", updatedAt: now },
    world: {
      points: 0,
      stage: 0,
      stageName: "🌱 Seed",
      branches: 0,
      flowers: 0,
      glows: 0,
      leaves: 0,
    },
    reactionCounts: {},
    activeMinute: { key: Math.floor(now / 60000), count: 0 },
    typing: new Set(),
    chaos: null,
    challenge: null,
    challengeTimer: null,
    polls: [],
    mystery: null,
    capsules: [],
    emptySince: undefined,
  };
  rooms.set(roomId, room);
  console.log(`[room] created "${roomId}" by ${createdBy}`);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function ensureRoom(roomId: string, createdBy: string): Room {
  return getRoom(roomId) ?? createRoom(roomId, createdBy);
}

export function makeUser(id: string, username: string): RoomUser {
  const now = Date.now();
  return {
    id,
    username,
    status: "online",
    joinedAt: now,
    lastActivityAt: now,
    xp: 0,
    messageCount: 0,
    reactionCount: 0,
    isTyping: false,
    challengeAwards: [],
    chaosAwards: [],
    pollsVoted: [],
  };
}

export function addSystemMessage(room: Room, text: string, kind: "system" | "chaos" | "challenge" | "mystery" | "poll" = "system"): void {
  room.messages.push({
    id: "sys-" + Math.random().toString(36).slice(2),
    roomId: room.id,
    userId: "system",
    username: room.name,
    text,
    kind,
    timestamp: Date.now(),
    reactions: {},
    reactedBy: {},
  });
  if (room.messages.length > MAX_HISTORY) {
    room.messages.splice(0, room.messages.length - MAX_HISTORY);
  }
}

export function roomUserCount(room: Room): number {
  return room.users.size;
}

/** pick the most active opportunity - used to pick a random-ish target user */
export function randomOtherUser(room: Room, exceptId?: string): RoomUser | undefined {
  const others = [...room.users.values()].filter((u) => u.id !== exceptId);
  if (others.length === 0) return undefined;
  return pick(others);
}