import { broadcast, broadcastForUser } from "./broadcast.js";
import { awardXp } from "./xp.js";
import { pick, uid } from "./util.js";
import type { MysteryRound, Room } from "./types.js";

const PLAY_TIME = 75_000;
const VOTE_TIME = 35_000;

export function startMystery(room: Room): { round: MysteryRound } | { error: string } {
  if (room.mystery) return { error: "A mystery round is already running." };
  const users = [...room.users.values()];
  if (users.length < 3) return { error: "Mystery mode needs at least 3 players." };

  const impostorCount = Math.max(1, Math.min(2, Math.floor(users.length / 4)));
  const pool = [...users];
  const impostors: string[] = [];
  for (let i = 0; i < impostorCount && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    impostors.push((pool.splice(idx, 1)[0] as RoomUserLike).id);
  }

  const now = Date.now();
  const round: MysteryRound = {
    roundId: uid("myst-"),
    phase: "playing",
    impostors,
    alive: users.map((u) => u.id),
    startsAt: now,
    phaseEndsAt: now + PLAY_TIME,
    votesBy: {},
    revealed: false,
  };
  room.mystery = round;
  room.stats.eventCount++;

  broadcast(room, "MYSTERY_STARTED", {
    roundId: round.roundId,
    phase: "playing",
    playerCount: users.length,
    impostorCount: impostors.length,
    phaseEndsAt: round.phaseEndsAt,
  });
  // private role whisper for every player
  for (const u of users) {
    broadcastForUser(u.id, "MYSTERY_ROLE", {
      roundId: round.roundId,
      role: impostors.includes(u.id) ? "impostor" : "member",
    });
  }
  console.log(`[mystery] ${room.id} round started, impostors=${impostors.length}`);

  setTimeout(() => beginVoting(room, round), PLAY_TIME + 200);
  return { round };
}

interface RoomUserLike {
  id: string;
  username: string;
}

function beginVoting(room: Room, round: MysteryRound): void {
  if (room.mystery?.roundId !== round.roundId || round.revealed) return;
  round.phase = "voting";
  round.phaseEndsAt = Date.now() + VOTE_TIME;
  broadcast(room, "MYSTERY_PHASE", { roundId: round.roundId, phase: "voting", phaseEndsAt: round.phaseEndsAt });
  setTimeout(() => revealMystery(room, round), VOTE_TIME + 200);
}

export function castMysteryVote(room: Room, userId: string, targetId: string): { error?: string } {
  const round = room.mystery;
  if (!round || round.revealed) return { error: "No active mystery round." };
  if (round.phase !== "voting") return { error: "Voting hasn't started yet." };
  if (round.votesBy[userId]) return { error: "You already voted." };
  if (!round.alive.includes(userId)) return { error: "You are not in this round." };
  if (!round.alive.includes(targetId)) return { error: "Invalid target." };
  if (targetId === userId) return { error: "You can't vote for yourself." };
  round.votesBy[userId] = targetId;
  const me = room.users.get(userId);
  broadcast(room, "MYSTERY_VOTE_CAST", {
    roundId: round.roundId,
    userId,
    username: me ? me.username : "?",
  });
  const me2 = room.users.get(userId);
  if (me2) awardXp(room, userId, 5, "mystery_vote", me2.username);
  return {};
}

function revealMystery(room: Room, round: MysteryRound): void {
  if (room.mystery?.roundId !== round.roundId || round.revealed) return;
  round.revealed = true;

  const tally = new Map<string, number>();
  for (const target of Object.values(round.votesBy)) {
    tally.set(target, (tally.get(target) ?? 0) + 1);
  }
  let accusedId: string | null = null;
  let max = 0;
  for (const [id, count] of tally) {
    if (count > max) {
      max = count;
      accusedId = id;
    }
  }

  const impostors = round.impostors
    .map((id) => {
      const u = room.users.get(id);
      return u ? { id, username: u.username } : null;
    })
    .filter((x): x is { id: string; username: string } => x !== null);
  const accusedName = accusedId && room.users.get(accusedId)?.username;
  const caught = accusedId !== null && round.impostors.includes(accusedId);

  broadcast(room, "MYSTERY_REVEAL", {
    roundId: round.roundId,
    impostors,
    caught,
    accused: accusedName
      ? { id: accusedId, username: accusedName }
      : null,
    voterCount: Object.keys(round.votesBy).length,
  });

  // xp settlements
  for (const id of round.alive) {
    const u = room.users.get(id);
    if (!u) continue;
    if (round.impostors.includes(id)) {
      awardXp(room, id, caught ? 80 : 50, caught ? "impostor_caught" : "impostor_survived", u.username);
    } else {
      awardXp(room, id, 15, "mystery_participation", u.username);
    }
  }
  room.mystery = null;

  // re-enable roles are handled by client clearing state
  console.log(`[mystery] ${room.id} revealed caught=${caught}`);
}

/** handle a user disconnecting during a round */
export function onUserLeftMystery(room: Room, userId: string): void {
  const round = room.mystery;
  if (!round || round.revealed) return;
  round.alive = round.alive.filter((id) => id !== userId);
  delete round.votesBy[userId];

  if (round.impostors.includes(userId)) {
    // re-roll a new impostor from remaining members
    const candidates = round.alive.filter((id) => !round.impostors.includes(id));
    if (candidates.length === 0 || round.alive.length < 3) {
      // too small - call it off
      broadcast(room, "MYSTERY_REVEAL", {
        roundId: round.roundId,
        impostors: round.impostors.map((id) => ({ id, username: room.users.get(id)?.username ?? "?" })),
        caught: false,
        accused: null,
        voterCount: 0,
        cancelled: true,
      });
      room.mystery = null;
      return;
    }
    const newImpostor = pick(candidates);
    round.impostors = [newImpostor];
    broadcastForUser(newImpostor, "MYSTERY_ROLE", { roundId: round.roundId, role: "impostor" });
    console.log(`[mystery] ${room.id} impostor left, re-rolled`);
  }
}