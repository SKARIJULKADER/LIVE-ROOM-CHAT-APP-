import { addSystemMessage, ensureRoom, getRoom, makeUser, MAX_HISTORY, roomOfUser, rooms, socketByUser, } from "./store.js";
import { broadcast, broadcastForUser, sendEvent } from "./broadcast.js";
import { EVT } from "./types.js";
import { getLevelInfo } from "./xp.js";
import { metaPayload, analyzeMessage, trackReaction, trackMostReacted } from "./meta.js";
import { triggerChaos, noteMessageForChaos, noteReactionForChaos } from "./chaos.js";
import { scheduleNext, cancelChallengeSchedule, noteMessageForChallenge, noteReactionForChallenge } from "./challenges.js";
import { createPoll, votePoll } from "./polls.js";
import { createTimeCapsule } from "./timecapsules.js";
import { startMystery, castMysteryVote, onUserLeftMystery } from "./mystery.js";
import { uid, sanitizeName } from "./util.js";
const ALLOWED_REACTIONS = ["❤️", "😂", "🔥", "😮", "👏", "💀", "👍"];
const TYPING_AUTO_CLEAR = 4_500;
const AWAY_AFTER_MS = 5 * 60_000;
const ROOM_EMPTY_TTL = 2 * 60_000;
const MAX_MESSAGE_LEN = 2_000;
// ---------------------------------------------------------------------------
// rate limiting (simple token bucket per socket)
// ---------------------------------------------------------------------------
const rateBuckets = new WeakMap();
function rateLimited(ws) {
    const now = Date.now();
    let bucket = rateBuckets.get(ws);
    if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + 10_000 };
        rateBuckets.set(ws, bucket);
    }
    bucket.count++;
    return bucket.count > 60;
}
// ---------------------------------------------------------------------------
// presence + typing helpers
// ---------------------------------------------------------------------------
function publicUser(u) {
    return {
        id: u.id,
        username: u.username,
        status: u.status,
        isTyping: u.isTyping,
        xp: u.xp,
        messageCount: u.messageCount,
    };
}
function broadcastPresence(room) {
    broadcast(room, "PRESENCE_UPDATE", {
        users: [...room.users.values()].map(publicUser),
        onlineCount: room.users.size,
    });
}
function setTyping(room, user, typing) {
    if (user.isTyping === typing)
        return;
    user.isTyping = typing;
    if (typing) {
        room.typing.add(user.id);
    }
    else {
        room.typing.delete(user.id);
    }
    broadcast(room, typing ? "TYPING_START" : "TYPING_STOP", {
        userId: user.id,
        username: user.username,
        typingUsers: [...room.typing]
            .map((id) => room.users.get(id)?.username)
            .filter((x) => Boolean(x)),
    });
}
/** scheduled auto-clearing of a stale typing flag */
const typingTimers = new WeakMap();
function scheduleTypingClear(room, user) {
    const existing = typingTimers.get(user);
    if (existing)
        clearTimeout(existing);
    typingTimers.set(user, setTimeout(() => {
        setTyping(room, user, false);
    }, TYPING_AUTO_CLEAR));
}
// ---------------------------------------------------------------------------
// room snapshot for (re)joining clients
// ---------------------------------------------------------------------------
export function buildRoomState(room, userId) {
    const me = room.users.get(userId);
    const level = me ? getLevelInfo(me.xp) : getLevelInfo(0);
    const mystery = room.mystery;
    return {
        roomId: room.id,
        roomTitle: metaPayload(room).title,
        users: [...room.users.values()].map(publicUser),
        messages: room.messages.slice(-MAX_HISTORY),
        energy: room.energy,
        meta: metaPayload(room),
        chaos: room.chaos,
        challenge: room.challenge,
        polls: room.polls,
        mystery: mystery
            ? {
                roundId: mystery.roundId,
                phase: mystery.phase,
                phaseEndsAt: mystery.phaseEndsAt,
                impostorCount: mystery.impostors.length,
            }
            : null,
        capsules: room.capsules,
        me: {
            userId,
            username: me?.username ?? "",
            xp: me?.xp ?? 0,
            level: level.level,
            levelTitle: level.title,
            progress: level.progress,
            xpForNext: level.xpForNext,
            mysteryRole: mystery ? (mystery.impostors.includes(userId) ? "impostor" : "member") : null,
        },
    };
}
// ---------------------------------------------------------------------------
// main entry: attach a socket to the message pump
// ---------------------------------------------------------------------------
export function attachSocket(ws) {
    ws.on("message", (data) => {
        const raw = data.toString();
        let frame;
        try {
            frame = JSON.parse(raw);
        }
        catch {
            sendEvent(ws, EVT.ERROR, { code: "INVALID_JSON", message: "Message must be valid JSON." });
            return;
        }
        handleFrame(ws, frame);
    });
}
function handleFrame(ws, frame) {
    if (typeof frame !== "object" || frame === null)
        return;
    const { type, payload } = frame;
    if (typeof type !== "string")
        return;
    if (rateLimited(ws)) {
        sendEvent(ws, EVT.ERROR, { code: "RATE_LIMIT", message: "Slow down a little." });
        return;
    }
    try {
        dispatch(ws, type, payload);
    }
    catch (err) {
        console.error("[handler] error", type, err);
        sendEvent(ws, EVT.ERROR, { code: "INTERNAL", message: "Something went wrong processing that request." });
    }
}
function currentUser(ws) {
    let userId;
    for (const [id, s] of socketByUser) {
        if (s === ws) {
            userId = id;
            break;
        }
    }
    if (!userId)
        return { userId: "", room: undefined };
    const roomId = roomOfUser.get(userId);
    const room = roomId ? getRoom(roomId) : undefined;
    return { userId, room };
}
function dispatch(ws, type, payload) {
    const { userId, room } = currentUser(ws);
    if (!userId && type !== EVT.JOIN_ROOM)
        return missingJoin(ws);
    switch (type) {
        case EVT.JOIN_ROOM:
            handleJoin(ws, asRecord(payload));
            return;
        case EVT.SEND_MESSAGE:
            if (!room)
                return missingJoin(ws);
            handleMessage(room, userId, asRecord(payload));
            return;
        case EVT.USER_TYPING:
            if (!room)
                return missingJoin(ws);
            handleTyping(room, userId, true);
            return;
        case EVT.STOP_TYPING:
            if (!room)
                return missingJoin(ws);
            handleTyping(room, userId, false);
            return;
        case EVT.REACTION_TOGGLE:
            if (!room)
                return missingJoin(ws);
            handleReaction(room, userId, asRecord(payload));
            return;
        case EVT.CHAOS_TRIGGER:
            if (!room)
                return missingJoin(ws);
            triggerChaos(room, userId);
            return;
        case EVT.CHALLENGE_INTERACT:
            if (!room)
                return missingJoin(ws);
            handleChallengeInteract(room, userId, asRecord(payload));
            return;
        case EVT.POLL_CREATE:
            if (!room)
                return missingJoin(ws);
            handlePollCreate(room, userId, asRecord(payload));
            return;
        case EVT.POLL_VOTE:
            if (!room)
                return missingJoin(ws);
            handlePollVote(room, userId, asRecord(payload));
            return;
        case EVT.TIME_CAPSULE_CREATE:
            if (!room)
                return missingJoin(ws);
            handleCapsuleCreate(room, userId, asRecord(payload));
            return;
        case EVT.MYSTERY_ACTIVATE:
            if (!room)
                return missingJoin(ws);
            handleMysteryActivate(room, userId);
            return;
        case EVT.MYSTERY_VOTE:
            if (!room)
                return missingJoin(ws);
            handleMysteryVote(room, userId, asRecord(payload));
            return;
        default:
            sendEvent(ws, EVT.ERROR, { code: "UNKNOWN_EVENT", message: `Unknown event: ${type}` });
    }
}
function missingJoin(ws) {
    sendEvent(ws, EVT.ERROR, { code: "NOT_JOINED", message: "Join a room first." });
}
function asRecord(payload) {
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
        return payload;
    }
    return {};
}
// ---------------------------------------------------------------------------
// join / rejoin
// ---------------------------------------------------------------------------
function handleJoin(ws, payload) {
    const roomIdRaw = typeof payload.roomId === "string" ? payload.roomId.trim().slice(0, 40) : "";
    const username = sanitizeName(typeof payload.username === "string" ? payload.username : "Guest");
    const userIdRaw = typeof payload.userId === "string" ? payload.userId.trim().slice(0, 64) : "";
    if (!roomIdRaw) {
        sendEvent(ws, EVT.ERROR, { code: "INVALID_ROOM", message: "roomId is required." });
        return;
    }
    const userId = userIdRaw || uid("user-");
    const previousRoomId = roomOfUser.get(userId);
    const previousRoom = previousRoomId ? getRoom(previousRoomId) : undefined;
    // leave previous room (switching rooms / stale session)
    if (previousRoom && previousRoom.id !== roomIdRaw) {
        removeUserFromRoom(userId);
    }
    const room = ensureRoom(roomIdRaw, username);
    const existing = room.users.get(userId);
    const user = existing ?? makeUser(userId, username);
    user.username = username;
    user.status = "online";
    user.lastActivityAt = Date.now();
    if (!existing) {
        room.users.set(userId, user);
        room.emptySince = undefined;
    }
    // swap socket binding (newest socket wins)
    socketByUser.set(userId, ws);
    roomOfUser.set(userId, room.id);
    if (!existing) {
        broadcast(room, "USER_JOINED", publicUser(user));
        addSystemMessage(room, `👋 ${username} joined the room.`, "system");
        if (room.users.size === 1) {
            scheduleNext(room);
        }
    }
    broadcastPresence(room);
    broadcastForUser(userId, EVT.WELCOME, { userId, username: user.username, roomId: room.id });
    sendEvent(ws, EVT.ROOM_STATE, buildRoomState(room, userId));
    console.log(`[join] ${username} (${userId}) -> ${room.id} [${room.users.size}]`);
}
// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------
function handleMessage(room, userId, payload) {
    const user = room.users.get(userId);
    if (!user)
        return;
    const text = typeof payload.text === "string" ? payload.text.trim().slice(0, MAX_MESSAGE_LEN) : "";
    if (!text) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "EMPTY_MESSAGE", message: "Empty messages can't be sent." });
        return;
    }
    const clientId = typeof payload.clientId === "string" ? payload.clientId.slice(0, 40) : undefined;
    // sending a message implies the user stopped typing
    setTyping(room, user, false);
    user.lastActivityAt = Date.now();
    const msg = {
        id: uid("msg-"),
        ...(clientId ? { clientId } : {}),
        roomId: room.id,
        userId,
        username: user.username,
        text,
        kind: "message",
        timestamp: Date.now(),
        reactions: {},
        reactedBy: {},
    };
    room.messages.push(msg);
    if (room.messages.length > MAX_HISTORY) {
        room.messages.splice(0, room.messages.length - MAX_HISTORY);
    }
    activityPush(room, msg.timestamp);
    analyzeMessage(room, msg);
    noteMessageForChaos(room, userId, user.username, text);
    noteMessageForChallenge(room, userId, user.username, text);
    // first message bonus
    if (user.messageCount === 1) {
        applyXp(room, userId, 5, "conversation_starter");
    }
    broadcast(room, EVT.MESSAGE, msg);
}
function activityPush(room, ts) {
    const act = room.activity;
    act.messageTs.push(ts);
    if (act.lastMsgAt > 0)
        act.gaps.push((ts - act.lastMsgAt) / 1000);
    act.lastMsgAt = ts;
    if (act.messageTs.length > 500)
        act.messageTs.splice(0, act.messageTs.length - 500);
    if (act.gaps.length > 200)
        act.gaps.splice(0, act.gaps.length - 200);
}
// ---------------------------------------------------------------------------
// typing / presence
// ---------------------------------------------------------------------------
function handleTyping(room, userId, typing) {
    const user = room.users.get(userId);
    if (!user)
        return;
    user.lastActivityAt = Date.now();
    if (typing) {
        setTyping(room, user, true);
        scheduleTypingClear(room, user);
    }
    else {
        setTyping(room, user, false);
    }
}
// ---------------------------------------------------------------------------
// reactions
// ---------------------------------------------------------------------------
function handleReaction(room, userId, payload) {
    const user = room.users.get(userId);
    if (!user)
        return;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    const emoji = typeof payload.emoji === "string" ? payload.emoji : "";
    if (!ALLOWED_REACTIONS.includes(emoji)) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "BAD_EMOJI", message: "That reaction isn't allowed." });
        return;
    }
    const message = room.messages.find((m) => m.id === messageId);
    if (!message) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "NOT_FOUND", message: "Message not found." });
        return;
    }
    user.lastActivityAt = Date.now();
    const list = message.reactedBy[emoji] ?? [];
    const idx = list.indexOf(userId);
    const added = idx === -1;
    if (added) {
        list.push(userId);
        message.reactedBy[emoji] = list;
        message.reactions[emoji] = list.length;
        user.reactionCount++;
        trackReaction(room, emoji);
        trackMostReacted(room, message.id, message.text, reactionTotal(message));
        noteReactionForChaos(room, userId, user.username);
        noteReactionForChallenge(room, userId, user.username);
        // xp for reactor + message author
        applyXp(room, userId, 1, "reaction_sent");
        if (message.userId !== userId)
            applyXp(room, message.userId, 1, "reaction_received");
    }
    else {
        list.splice(idx, 1);
        message.reactedBy[emoji] = list;
        message.reactions[emoji] = list.length;
    }
    broadcast(room, "REACTION_UPDATED", {
        messageId: message.id,
        emoji,
        added,
        userId,
        username: user.username,
        reactions: message.reactions,
        reactedBy: message.reactedBy,
    });
}
function reactionTotal(message) {
    let total = 0;
    for (const n of Object.values(message.reactions))
        total += n;
    return total;
}
function applyXp(room, userId, amount, reason) {
    const user = room.users.get(userId);
    if (!user)
        return;
    user.xp += amount;
    const info = getLevelInfo(user.xp);
    broadcast(room, "XP_UPDATED", {
        userId,
        username: user.username,
        xp: user.xp,
        delta: amount,
        level: info.level,
        levelTitle: info.title,
        progress: info.progress,
        xpForNext: info.xpForNext,
        leveledUp: false,
        reason,
    });
}
// ---------------------------------------------------------------------------
// challenge interaction (join / claim participation)
// ---------------------------------------------------------------------------
function handleChallengeInteract(room, userId, payload) {
    const user = room.users.get(userId);
    if (!user)
        return;
    const challengeId = typeof payload.challengeId === "string" ? payload.challengeId : "";
    const ch = room.challenge;
    if (!ch || ch.id !== challengeId) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "NO_CHALLENGE", message: "No matching challenge." });
        return;
    }
    if (ch.participants[userId])
        return;
    ch.participants[userId] = { username: user.username, completedAt: Date.now(), completed: false };
    applyXp(room, userId, 10, "challenge_joined");
}
// ---------------------------------------------------------------------------
// polls / capsules / mystery
// ---------------------------------------------------------------------------
function handlePollCreate(room, userId, payload) {
    const user = room.users.get(userId);
    if (!user)
        return;
    const question = typeof payload.question === "string" ? payload.question : "";
    const options = Array.isArray(payload.options)
        ? payload.options.filter((x) => typeof x === "string")
        : [];
    const res = createPoll(room, userId, user.username, question, options);
    if ("error" in res) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "BAD_POLL", message: res.error });
    }
}
function handlePollVote(room, userId, payload) {
    const pollId = typeof payload.pollId === "string" ? payload.pollId : "";
    const option = typeof payload.option === "number" ? payload.option : -1;
    const res = votePoll(room, pollId, userId, option);
    if ("error" in res) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "BAD_VOTE", message: res.error });
    }
}
function handleCapsuleCreate(room, userId, payload) {
    const user = room.users.get(userId);
    if (!user)
        return;
    const text = typeof payload.text === "string" ? payload.text : "";
    const condPayload = asRecord(payload.condition);
    const condType = condPayload.type === "messages" ? "messages" : "date";
    const condition = condType === "messages"
        ? { type: "messages", count: typeof condPayload.count === "number" ? Math.floor(condPayload.count) : 100 }
        : { type: "date", at: typeof condPayload.at === "number" ? condPayload.at : Date.now() + 60_000 };
    const res = createTimeCapsule(room, userId, user.username, { text, condition });
    if ("error" in res) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "BAD_CAPSULE", message: res.error });
    }
}
function handleMysteryActivate(room, userId) {
    const res = startMystery(room);
    if ("error" in res) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "MYSTERY_ERR", message: res.error });
    }
}
function handleMysteryVote(room, userId, payload) {
    const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
    const res = castMysteryVote(room, userId, targetId);
    if (res.error) {
        const sock = socketByUser.get(userId);
        if (sock)
            sendEvent(sock, EVT.ERROR, { code: "MYSTERY_VOTE_ERR", message: res.error });
    }
}
// ---------------------------------------------------------------------------
// disconnect + presence sweeps
// ---------------------------------------------------------------------------
export function removeUserFromRoom(userId) {
    const roomId = roomOfUser.get(userId);
    if (!roomId)
        return;
    const room = getRoom(roomId);
    roomOfUser.delete(userId);
    socketByUser.delete(userId);
    if (!room)
        return;
    const user = room.users.get(userId);
    room.users.delete(userId);
    room.typing.delete(userId);
    onUserLeftMystery(room, userId);
    if (user) {
        broadcast(room, "USER_LEFT", { id: userId, username: user.username });
        broadcastPresence(room);
        addSystemMessage(room, `👋 ${user.username} left the room.`, "system");
    }
    if (room.users.size === 0) {
        room.emptySince = room.emptySince ?? Date.now();
    }
    else {
        room.emptySince = undefined;
    }
    console.log(`[leave] ${userId} left ${roomId}`);
}
export function startPresenceTicks() {
    setInterval(() => {
        const now = Date.now();
        for (const room of rooms.values()) {
            let changed = false;
            for (const user of room.users.values()) {
                if (user.status === "online" && now - user.lastActivityAt > AWAY_AFTER_MS) {
                    user.status = "away";
                    changed = true;
                }
            }
            if (changed)
                broadcastPresence(room);
            // garbage collect empty rooms after TTL
            if (room.users.size === 0 && room.emptySince && now - room.emptySince > ROOM_EMPTY_TTL) {
                if (room.challengeTimer)
                    clearTimeout(room.challengeTimer);
                cancelChallengeSchedule(room.id);
                rooms.delete(room.id);
                console.log(`[room] reaped empty room ${room.id}`);
            }
        }
    }, 30_000);
}
export function onSocketClose(ws) {
    let userId;
    for (const [id, s] of socketByUser) {
        if (s === ws) {
            userId = id;
            break;
        }
    }
    if (userId)
        removeUserFromRoom(userId);
}
//# sourceMappingURL=handlers.js.map