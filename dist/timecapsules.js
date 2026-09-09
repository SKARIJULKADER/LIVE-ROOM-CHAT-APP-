import { broadcast } from "./broadcast.js";
import { rooms } from "./store.js";
import { awardXp } from "./xp.js";
import { uid } from "./util.js";
const MAX_CAPSULES = 12;
export function createTimeCapsule(room, userId, username, input) {
    const text = input.text.trim();
    const cond = input.condition;
    if (text.length < 3)
        return { error: "Capsule note is too short." };
    if (text.length > 500)
        return { error: "Capsule note is too long (500 chars max)." };
    if (cond.type === "date") {
        const now = Date.now();
        if (cond.at < now + 10_000)
            return { error: "Unlock time must be at least 10s in the future." };
        if (cond.at > now + 1000 * 60 * 60 * 24 * 90)
            return { error: "Unlock time is too far away (90 days max)." };
    }
    else if (cond.type === "messages") {
        if (cond.count < 3 || cond.count > 10000)
            return { error: "Message target must be between 3 and 10 000." };
    }
    else {
        return { error: "Invalid unlock condition." };
    }
    const now = Date.now();
    const capsule = {
        id: uid("cap-"),
        roomId: room.id,
        userId,
        username,
        text,
        kind: "time_capsule",
        timestamp: now,
        reactions: {},
        reactedBy: {},
        locked: true,
        unlockCondition: cond,
    };
    room.capsules.unshift(capsule);
    if (room.capsules.length > MAX_CAPSULES)
        room.capsules.length = MAX_CAPSULES;
    room.messages.push(capsule);
    room.stats.capsuleCount++;
    if (room.messages.length > 250)
        room.messages.splice(0, room.messages.length - 250);
    broadcast(room, "TIME_CAPSULE_CREATED", { capsule });
    awardXp(room, userId, 20, "time_capsule", username);
    console.log(`[capsule] ${room.id} sealed by ${username}`);
    return capsule;
}
export function tickCapsules(room) {
    if (room.capsules.length === 0)
        return;
    const now = Date.now();
    for (const capsule of room.capsules) {
        if (!capsule.locked || !capsule.unlockCondition)
            continue;
        let due = false;
        if (capsule.unlockCondition.type === "date") {
            due = now >= capsule.unlockCondition.at;
        }
        else {
            due = room.stats.messageCount >= capsule.unlockCondition.count;
        }
        if (due) {
            unlockCapsule(room, capsule);
        }
    }
}
function unlockCapsule(room, capsule) {
    capsule.locked = false;
    capsule.unlockedAt = Date.now();
    broadcast(room, "TIME_CAPSULE_UNLOCKED", { capsule });
    const creator = room.users.get(capsule.userId);
    if (creator)
        awardXp(room, capsule.userId, 10, "capsule_unlocked", creator.username);
    console.log(`[capsule] ${room.id} unlocked -> "${capsule.text.slice(0, 40)}"`);
}
export function startCapsuleTicks() {
    setInterval(() => {
        for (const room of rooms.values()) {
            tickCapsules(room);
        }
    }, 2_000);
}
//# sourceMappingURL=timecapsules.js.map