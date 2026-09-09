import { broadcast } from "./broadcast.js";
import { rooms } from "./store.js";
import { clamp } from "./util.js";
const HUMOR_RE = /(lol|lmao|haha|hehe|😂|🤣|💀|jk|no way|fr\b|bruh|omg|rip\b)/i;
const DEEP_RE = /(think|believe|feel|meaning|dream|what if|why\b|life|future|universe|soul|philosoph)/i;
const POSITIVE_RE = /(thanks|thank you|love|great|awesome|amazing|nice|good\b|well done|proud|legend|wow)/i;
/** called for every delivered chat message ("kind: message") */
export function analyzeMessage(room, msg) {
    if (msg.kind !== "message")
        return;
    const now = Date.now();
    const tokens = msg.text.trim().split(/\s+/).filter(Boolean).length;
    const hour = new Date(now).getHours();
    room.traits.activity++;
    if (HUMOR_RE.test(msg.text))
        room.traits.humor++;
    if (DEEP_RE.test(msg.text))
        room.traits.deep++;
    if (POSITIVE_RE.test(msg.text))
        room.traits.positivity++;
    if (tokens <= 2 ||
        /^[A-Z0-9!?]{4,}$/.test(msg.text) ||
        (msg.text.match(/!/g)?.length ?? 0) >= 3) {
        room.traits.chaos++;
    }
    if (hour >= 22 || hour < 5)
        room.traits.lateNight++;
    const stats = room.stats;
    stats.messageCount++;
    stats.totalWords += tokens;
    stats.lastActivityAt = now;
    // peak minute tracking
    const minute = Math.floor(now / 60000);
    if (room.activeMinute.key === minute) {
        room.activeMinute.count++;
    }
    else {
        room.activeMinute = { key: minute, count: 1 };
    }
    if (room.activeMinute.count > stats.peakMinute.count) {
        stats.peakMinute = { count: room.activeMinute.count, at: now };
    }
    // most active user
    const user = room.users.get(msg.userId);
    if (user) {
        user.messageCount++;
        if (!stats.mostActive || user.messageCount > stats.mostActive.messages) {
            stats.mostActive = { userId: user.id, username: user.username, messages: user.messageCount };
        }
    }
}
export function trackReaction(room, emoji) {
    room.stats.reactionCount++;
    room.reactionCounts[emoji] = (room.reactionCounts[emoji] ?? 0) + 1;
    if (!room.stats.mostUsed || (room.reactionCounts[emoji] ?? 0) > room.stats.mostUsed.count) {
        room.stats.mostUsed = { emoji, count: room.reactionCounts[emoji] ?? 0 };
    }
}
export function trackMostReacted(room, messageId, text, count) {
    if (!room.stats.mostReacted || count > room.stats.mostReacted.count) {
        room.stats.mostReacted = { count, messageId, text: text.slice(0, 60) };
    }
}
// ---------------------------------------------------------------------------
// personality scores (0..100) + deterministic room title
// ---------------------------------------------------------------------------
export function computePersonality(room) {
    const t = room.traits;
    const total = Math.max(1, t.activity);
    const humor = clamp(Math.round((t.humor / total) * 210), 0, 100);
    const chaos = clamp(Math.round((t.chaos / total) * 230), 0, 100);
    const deep = clamp(Math.round((t.deep / total) * 190), 0, 100);
    const activity = clamp(Math.round(Math.min(100, (total / 120) * 100)), 0, 100);
    const positivity = clamp(Math.round((t.positivity / total) * 260), 0, 100);
    const lateNight = clamp(Math.round((t.lateNight / total) * 220), 0, 100);
    const score = Math.round((humor + chaos + deep + activity + positivity) / 5);
    const nice = Math.round((humor + chaos + deep + activity + positivity + lateNight) / 6);
    let title = "The Conversation Lounge";
    const high = (v, floor = 55) => v >= floor;
    if (high(lateNight, 45) && high(chaos, 55))
        title = "The Midnight Chaos Club";
    else if (high(chaos, 70))
        title = "Certified Chaos Theory";
    else if (high(humor, 65))
        title = "The Meme Department";
    else if (high(deep, 60))
        title = "The Deep Talk Society";
    else if (high(lateNight, 60))
        title = "The 2AM Society";
    else if (high(activity, 70))
        title = "Professional Procrastinators";
    else if (high(positivity, 65))
        title = "The Compliment Corner";
    else if (total < 5)
        title = "The Quiet Corner";
    return { score, nice, title };
}
// ---------------------------------------------------------------------------
// living world (growth) state
// ---------------------------------------------------------------------------
const STAGES = [
    { min: 0, name: "🌱 Seed" },
    { min: 20, name: "🌿 Sprout" },
    { min: 60, name: "🍃 Sapling" },
    { min: 150, name: "🌳 Tree" },
    { min: 320, name: "🌲✨ Ancient Grove" },
];
export function computeWorld(room) {
    const s = room.stats;
    const points = Math.round(s.messageCount * 1 + s.reactionCount * 0.5 + s.eventCount * 4 + s.challengeCount * 6);
    let stage = 0;
    let stageName = STAGES[0]?.name ?? "🌱 Seed";
    for (let i = STAGES.length - 1; i >= 0; i--) {
        const st = STAGES[i];
        if (st && points >= st.min) {
            stage = i;
            stageName = st.name;
            break;
        }
    }
    return {
        points,
        stage,
        stageName,
        branches: Math.min(42, Math.floor(s.messageCount / 2)),
        flowers: Math.min(28, s.reactionCount),
        glows: Math.min(12, s.eventCount + s.challengeCount),
        leaves: clamp(Math.floor(s.messageCount / 4), 0, 34),
    };
}
// ---------------------------------------------------------------------------
// meta payload + periodic broadcast (personality / moments / world / title)
// ---------------------------------------------------------------------------
export function metaPayload(room) {
    const t = room.traits;
    const total = Math.max(1, t.activity);
    const humor = clamp(Math.round((t.humor / total) * 210), 0, 100);
    const chaos = clamp(Math.round((t.chaos / total) * 230), 0, 100);
    const deep = clamp(Math.round((t.deep / total) * 190), 0, 100);
    const activity = clamp(Math.round(Math.min(100, (total / 120) * 100)), 0, 100);
    const positivity = clamp(Math.round((t.positivity / total) * 260), 0, 100);
    const lateNight = clamp(Math.round((t.lateNight / total) * 220), 0, 100);
    const personality = {
        humor,
        chaos,
        deep,
        activity,
        positivity,
        lateNight,
        score: Math.round((humor + chaos + deep + activity + positivity) / 5),
    };
    return {
        personality,
        title: computePersonality(room).title,
        moments: room.stats,
        world: computeWorld(room),
    };
}
export function broadcastMeta(room) {
    broadcast(room, "ROOM_META_UPDATE", metaPayload(room));
}
export function startMetaTicks() {
    setInterval(() => {
        for (const room of rooms.values()) {
            room.traitState = computePersonality(room);
            room.world = computeWorld(room);
            broadcast(room, "ROOM_META_UPDATE", metaPayload(room));
        }
    }, 4_000);
}
//# sourceMappingURL=meta.js.map