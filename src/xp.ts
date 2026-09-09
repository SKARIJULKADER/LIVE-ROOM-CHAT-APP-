import { broadcast } from "./broadcast.js";
import type { LevelInfo, Room, RoomUser } from "./types.js";
import { clamp } from "./util.js";

interface LevelDef {
  level: number;
  xp: number;
  title: string;
}

export const LEVELS: readonly LevelDef[] = [
  { level: 1, xp: 0, title: "Newcomer" },
  { level: 2, xp: 60, title: "Regular" },
  { level: 3, xp: 160, title: "Talker" },
  { level: 4, xp: 340, title: "Conversationalist" },
  { level: 5, xp: 640, title: "Social Pro" },
  { level: 6, xp: 1100, title: "Chat Master" },
  { level: 7, xp: 1800, title: "Chaos Agent" },
  { level: 8, xp: 2800, title: "Chat Legend" },
];

export function getLevelInfo(xp: number): LevelInfo {
  let current: LevelDef = LEVELS[0] as LevelDef;
  let next: LevelDef | undefined;
  for (const lvl of LEVELS) {
    if (xp >= lvl.xp) current = lvl;
  }
  for (const lvl of LEVELS) {
    if (lvl.xp > current.xp) {
      next = lvl;
      break;
    }
  }
  if (!next) {
    return { level: current.level, title: current.title, xp, xpForNext: null, progress: 1 };
  }
  const span = next.xp - current.xp;
  const progress = clamp((xp - current.xp) / span, 0, 1);
  return { level: current.level, title: current.title, xp, xpForNext: next.xp, progress };
}

/**
 * Award XP to a room user and notify the whole room.
 * Returns true when XP actually changed.
 */
export function awardXp(room: Room, userId: string, amount: number, reason: string, actor?: string): boolean {
  const user = room.users.get(userId);
  if (!user) return false;
  const before = getLevelInfo(user.xp).level;
  user.xp = Math.max(0, user.xp + amount);
  const info = getLevelInfo(user.xp);
  const leveledUp = info.level > before;
  broadcast(room, "XP_UPDATED", {
    userId,
    username: user.username,
    xp: user.xp,
    delta: amount,
    level: info.level,
    levelTitle: info.title,
    progress: info.progress,
    xpForNext: info.xpForNext,
    leveledUp,
    reason,
  });
  if (leveledUp) {
    broadcast(room, "MESSAGE", {
      id: "xp-" + Math.random().toString(36).slice(2),
      roomId: room.id,
      userId: "system",
      username: "✦ LEVEL UP",
      text: `${user.username} reached Level ${info.level} — ${info.title}!`,
      kind: "system",
      timestamp: Date.now(),
      reactions: {},
      reactedBy: {},
    } as unknown);
  }
  return true;
}

export function publicUserFromRoomUser(user: RoomUser): {
  id: string;
  username: string;
  status: string;
  isTyping: boolean;
  xp: number;
  messageCount: number;
} {
  return {
    id: user.id,
    username: user.username,
    status: user.status,
    isTyping: user.isTyping,
    xp: user.xp,
    messageCount: user.messageCount,
  };
}