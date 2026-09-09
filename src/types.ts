// ---------------------------------------------------------------------------
// Shared protocol types for the LIVE ROOM experience.
// Every WebSocket frame is JSON: { type: string, payload: unknown }
// ---------------------------------------------------------------------------

export const EVT = {
  // ---------------- client -> server ----------------
  JOIN_ROOM: "JOIN_ROOM",
  SEND_MESSAGE: "SEND_MESSAGE",
  USER_TYPING: "USER_TYPING",
  STOP_TYPING: "STOP_TYPING",
  REACTION_TOGGLE: "REACTION_TOGGLE",
  CHAOS_TRIGGER: "CHAOS_TRIGGER",
  CHALLENGE_INTERACT: "CHALLENGE_INTERACT",
  POLL_CREATE: "POLL_CREATE",
  POLL_VOTE: "POLL_VOTE",
  MYSTERY_ACTIVATE: "MYSTERY_ACTIVATE",
  MYSTERY_VOTE: "MYSTERY_VOTE",
  TIME_CAPSULE_CREATE: "TIME_CAPSULE_CREATE",

  // ---------------- server -> client ----------------
  WELCOME: "WELCOME",
  ROOM_STATE: "ROOM_STATE",
  MESSAGE: "MESSAGE",
  USER_JOINED: "USER_JOINED",
  USER_LEFT: "USER_LEFT",
  PRESENCE_UPDATE: "PRESENCE_UPDATE",
  TYPING_START: "TYPING_START",
  TYPING_STOP: "TYPING_STOP",
  REACTION_UPDATED: "REACTION_UPDATED",
  ENERGY_UPDATE: "ENERGY_UPDATE",
  ROOM_META_UPDATE: "ROOM_META_UPDATE",
  CHAOS_STARTED: "CHAOS_STARTED",
  CHAOS_ENDED: "CHAOS_ENDED",
  CHALLENGE_STARTED: "CHALLENGE_STARTED",
  CHALLENGE_COMPLETED: "CHALLENGE_COMPLETED",
  CHALLENGE_ENDED: "CHALLENGE_ENDED",
  XP_UPDATED: "XP_UPDATED",
  POLL_CREATED: "POLL_CREATED",
  POLL_UPDATED: "POLL_UPDATED",
  TIME_CAPSULE_CREATED: "TIME_CAPSULE_CREATED",
  TIME_CAPSULE_UNLOCKED: "TIME_CAPSULE_UNLOCKED",
  MYSTERY_STARTED: "MYSTERY_STARTED",
  MYSTERY_PHASE: "MYSTERY_PHASE",
  MYSTERY_VOTE_CAST: "MYSTERY_VOTE_CAST",
  MYSTERY_REVEAL: "MYSTERY_REVEAL",
  MYSTERY_ROLE: "MYSTERY_ROLE",
  ERROR: "ERROR",
} as const;

export type EventType = (typeof EVT)[keyof typeof EVT];

export type MessageKind =
  | "message"
  | "system"
  | "chaos"
  | "challenge"
  | "poll"
  | "time_capsule"
  | "mystery";

export type CapsuleCondition =
  | { type: "date"; at: number }
  | { type: "messages"; count: number };

export interface ChatMessage {
  id: string;
  /** optional client-generated id so the sender can reconcile an optimistic bubble */
  clientId?: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  kind: MessageKind;
  timestamp: number;
  reactions: Record<string, number>;
  reactedBy: Record<string, string[]>;
  /** time capsule fields */
  locked?: boolean;
  unlockCondition?: CapsuleCondition;
  unlockedAt?: number;
}

export type PresenceStatus = "online" | "away";

export interface RoomUser {
  id: string;
  username: string;
  status: PresenceStatus;
  joinedAt: number;
  lastActivityAt: number;
  xp: number;
  messageCount: number;
  reactionCount: number;
  isTyping: boolean;
  /** xp award dedupe */
  challengeAwards: string[];
  chaosAwards: string[];
  pollsVoted: string[];
}

export interface EnergyState {
  score: number;
  label: string;
  tier: "calm" | "relaxed" | "active" | "energetic" | "chaos";
  updatedAt: number;
}

export interface ChaosEvent {
  id: string;
  kind: string;
  title: string;
  text: string;
  startsAt: number;
  endsAt: number;
  participants: string[];
  awarded: string[];
}

export type ChallengeRule =
  | "any"
  | "three_words"
  | "single_word"
  | "emoji"
  | "short"
  | "reaction";

export interface Challenge {
  id: string;
  prompt: string;
  rule: ChallengeRule;
  startsAt: number;
  endsAt: number;
  participants: Record<string, { username: string; completedAt: number; completed: boolean }>;
  champion: string | null;
}

export interface Poll {
  id: string;
  username: string;
  question: string;
  options: string[];
  votes: number[];
  voters: string[];
  createdAt: number;
  closed: boolean;
}

export interface MysteryRound {
  roundId: string;
  phase: "playing" | "voting";
  impostors: string[];
  alive: string[];
  startsAt: number;
  phaseEndsAt: number;
  votesBy: Record<string, string>;
  revealed: boolean;
}

export interface WorldState {
  points: number;
  stage: number;
  stageName: string;
  branches: number;
  flowers: number;
  glows: number;
  leaves: number;
}

export interface RoomStats {
  messageCount: number;
  reactionCount: number;
  eventCount: number;
  challengeCount: number;
  capsuleCount: number;
  pollCount: number;
  totalWords: number;
  lastActivityAt: number;
  peakMinute: { count: number; at: number };
  mostReacted: { count: number; messageId: string; text: string } | null;
  mostActive: { userId: string; username: string; messages: number } | null;
  mostUsed: { emoji: string; count: number } | null;
  challengeChampion: { username: string } | null;
}

export type TraitKey = "humor" | "chaos" | "deep" | "activity" | "positivity" | "lateNight";

export interface TraitState {
  score: number;
  nice: number;
  title: string;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
  /** timestamp when the room became empty (for reaping) */
  emptySince: number | undefined;
  users: Map<string, RoomUser>;
  messages: ChatMessage[];
  /** rolling activity windows used by the energy engine */
  activity: {
    messageTs: number[];
    reactionTs: number[];
    gaps: number[];
    lastMsgAt: number;
    userActivity: Map<string, number>;
  };
  /** raw per-message analysis counters for personality + moments */
  traits: Record<TraitKey, number>;
  traitState: TraitState;
  stats: RoomStats;
  energy: EnergyState;
  world: WorldState;
  reactionCounts: Record<string, number>;
  activeMinute: { key: number; count: number };
  typing: Set<string>;
  chaos: ChaosEvent | null;
  challenge: Challenge | null;
  challengeTimer: ReturnType<typeof setTimeout> | null;
  polls: Poll[];
  mystery: MysteryRound | null;
  capsules: ChatMessage[];
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  xpForNext: number | null;
  progress: number;
}

/** snapshot of a user sent to clients */
export interface PublicUser {
  id: string;
  username: string;
  status: PresenceStatus;
  isTyping: boolean;
  xp: number;
  messageCount: number;
}