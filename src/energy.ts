import { broadcast } from "./broadcast.js";
import { rooms } from "./store.js";
import { clamp } from "./util.js";
import type { EnergyState, Room } from "./types.js";

const WINDOW = 120_000; // activity window in ms
const TICK = 3_000;

function tierFor(score: number): EnergyState["tier"] {
  if (score >= 81) return "chaos";
  if (score >= 61) return "energetic";
  if (score >= 41) return "active";
  if (score >= 21) return "relaxed";
  return "calm";
}

function labelFor(score: number): string {
  if (score >= 81) return "🔥 CHAOS";
  if (score >= 61) return "⚡ Energetic";
  if (score >= 41) return "💬 Active";
  if (score >= 21) return "🌱 Relaxed";
  return "🌙 Calm";
}

export function computeEnergy(room: Room): EnergyState {
  const now = Date.now();
  const msg = room.activity.messageTs.filter((t) => now - t < WINDOW);
  const react = room.activity.reactionTs.filter((t) => now - t < WINDOW);
  const msgPerMin = msg.length / 2; // messages collected over 120s -> per minute
  const reactPerMin = react.length / 2;

  let active = 0;
  for (const last of room.activity.userActivity.values()) {
    if (now - last < WINDOW) active++;
  }

  const msgScore = clamp((msgPerMin / 15) * 100, 0, 100);
  const reactScore = clamp((reactPerMin / 8) * 100, 0, 100);
  const userScore = clamp((active / 8) * 100, 0, 100);
  const recent30 = room.activity.messageTs.filter((t) => now - t < 30_000).length;
  const recencyScore = clamp((recent30 / 6) * 100, 0, 100);

  let speedScore = 40;
  if (room.activity.gaps.length > 0) {
    const recentGaps = room.activity.gaps.filter((g) => g <= 300);
    if (recentGaps.length > 0) {
      const avg = recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length;
      speedScore = avg <= 25 ? 100 : avg >= 300 ? 0 : (1 - (avg - 25) / 275) * 100;
    }
  }

  const score = Math.round(
    0.35 * msgScore +
      0.2 * reactScore +
      0.2 * userScore +
      0.15 * recencyScore +
      0.1 * speedScore
  );

  return { score, label: labelFor(score), tier: tierFor(score), updatedAt: now };
}

let lastBroadcast = new Map<string, { score: number; at: number }>();

/** recompute + broadcast energy for a room when it changed enough */
export function tickEnergy(room: Room): void {
  const next = computeEnergy(room);
  const prev = lastBroadcast.get(room.id);
  if (
    !prev ||
    next.score - prev.score >= 4 ||
    prev.score - next.score >= 4 ||
    nowDiff(next.updatedAt, prev.at) >= 12_000
  ) {
    room.energy = next;
    lastBroadcast.set(room.id, { score: next.score, at: next.updatedAt });
    broadcast(room, "ENERGY_UPDATE", next);
  }
}

function nowDiff(a: number, b: number): number {
  return Math.abs(a - b);
}

export function startEnergyTicks(): void {
  setInterval(() => {
    for (const room of rooms.values()) tickEnergy(room);
  }, TICK);
}