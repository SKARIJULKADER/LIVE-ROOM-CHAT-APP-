export declare const EVT: {
    readonly JOIN_ROOM: "JOIN_ROOM";
    readonly SEND_MESSAGE: "SEND_MESSAGE";
    readonly USER_TYPING: "USER_TYPING";
    readonly STOP_TYPING: "STOP_TYPING";
    readonly REACTION_TOGGLE: "REACTION_TOGGLE";
    readonly CHAOS_TRIGGER: "CHAOS_TRIGGER";
    readonly CHALLENGE_INTERACT: "CHALLENGE_INTERACT";
    readonly POLL_CREATE: "POLL_CREATE";
    readonly POLL_VOTE: "POLL_VOTE";
    readonly MYSTERY_ACTIVATE: "MYSTERY_ACTIVATE";
    readonly MYSTERY_VOTE: "MYSTERY_VOTE";
    readonly TIME_CAPSULE_CREATE: "TIME_CAPSULE_CREATE";
    readonly WELCOME: "WELCOME";
    readonly ROOM_STATE: "ROOM_STATE";
    readonly MESSAGE: "MESSAGE";
    readonly USER_JOINED: "USER_JOINED";
    readonly USER_LEFT: "USER_LEFT";
    readonly PRESENCE_UPDATE: "PRESENCE_UPDATE";
    readonly TYPING_START: "TYPING_START";
    readonly TYPING_STOP: "TYPING_STOP";
    readonly REACTION_UPDATED: "REACTION_UPDATED";
    readonly ENERGY_UPDATE: "ENERGY_UPDATE";
    readonly ROOM_META_UPDATE: "ROOM_META_UPDATE";
    readonly CHAOS_STARTED: "CHAOS_STARTED";
    readonly CHAOS_ENDED: "CHAOS_ENDED";
    readonly CHALLENGE_STARTED: "CHALLENGE_STARTED";
    readonly CHALLENGE_COMPLETED: "CHALLENGE_COMPLETED";
    readonly CHALLENGE_ENDED: "CHALLENGE_ENDED";
    readonly XP_UPDATED: "XP_UPDATED";
    readonly POLL_CREATED: "POLL_CREATED";
    readonly POLL_UPDATED: "POLL_UPDATED";
    readonly TIME_CAPSULE_CREATED: "TIME_CAPSULE_CREATED";
    readonly TIME_CAPSULE_UNLOCKED: "TIME_CAPSULE_UNLOCKED";
    readonly MYSTERY_STARTED: "MYSTERY_STARTED";
    readonly MYSTERY_PHASE: "MYSTERY_PHASE";
    readonly MYSTERY_VOTE_CAST: "MYSTERY_VOTE_CAST";
    readonly MYSTERY_REVEAL: "MYSTERY_REVEAL";
    readonly MYSTERY_ROLE: "MYSTERY_ROLE";
    readonly ERROR: "ERROR";
};
export type EventType = (typeof EVT)[keyof typeof EVT];
export type MessageKind = "message" | "system" | "chaos" | "challenge" | "poll" | "time_capsule" | "mystery";
export type CapsuleCondition = {
    type: "date";
    at: number;
} | {
    type: "messages";
    count: number;
};
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
export type ChallengeRule = "any" | "three_words" | "single_word" | "emoji" | "short" | "reaction";
export interface Challenge {
    id: string;
    prompt: string;
    rule: ChallengeRule;
    startsAt: number;
    endsAt: number;
    participants: Record<string, {
        username: string;
        completedAt: number;
        completed: boolean;
    }>;
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
    peakMinute: {
        count: number;
        at: number;
    };
    mostReacted: {
        count: number;
        messageId: string;
        text: string;
    } | null;
    mostActive: {
        userId: string;
        username: string;
        messages: number;
    } | null;
    mostUsed: {
        emoji: string;
        count: number;
    } | null;
    challengeChampion: {
        username: string;
    } | null;
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
    activeMinute: {
        key: number;
        count: number;
    };
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
//# sourceMappingURL=types.d.ts.map