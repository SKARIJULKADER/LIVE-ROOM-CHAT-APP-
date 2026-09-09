import { broadcast } from "./broadcast.js";
import { awardXp } from "./xp.js";
import { uid } from "./util.js";
export const MAX_POLLS = 10;
export function createPoll(room, userId, username, question, optionTexts) {
    const q = question.trim();
    const opts = optionTexts.map((t) => t.trim()).filter(Boolean);
    if (q.length < 3)
        return { error: "Poll question is too short." };
    if (opts.length < 2 || opts.length > 4)
        return { error: "Polls need 2–4 options." };
    const poll = {
        id: uid("poll-"),
        username,
        question: q,
        options: opts,
        votes: opts.map(() => 0),
        voters: [userId],
        createdAt: Date.now(),
        closed: false,
    };
    poll.votes[0] = 1; // creator's vote
    room.polls.unshift(poll);
    if (room.polls.length > MAX_POLLS)
        room.polls.length = MAX_POLLS;
    room.stats.pollCount++;
    broadcast(room, "POLL_CREATED", { poll });
    awardXp(room, userId, 15, "poll_created", username);
    // auto-close after 3 minutes so the list stays fresh
    setTimeout(() => {
        poll.closed = true;
        broadcast(room, "POLL_UPDATED", { poll });
    }, 180_000);
    return poll;
}
export function votePoll(room, pollId, userId, option) {
    const poll = room.polls.find((p) => p.id === pollId);
    if (!poll)
        return { error: "Poll not found." };
    if (poll.closed)
        return { error: "This poll is closed." };
    if (poll.voters.includes(userId))
        return { error: "You already voted." };
    if (!poll.options[option])
        return { error: "Invalid option." };
    poll.voters.push(userId);
    poll.votes[option] = (poll.votes[option] ?? 0) + 1;
    const me = room.users.get(userId);
    broadcast(room, "POLL_UPDATED", { poll, votedBy: me ? me.username : "?" });
    awardXp(room, userId, 5, "poll_vote", me?.username ?? "?");
    return poll;
}
//# sourceMappingURL=polls.js.map