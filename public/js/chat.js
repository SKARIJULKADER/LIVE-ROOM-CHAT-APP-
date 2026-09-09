// Chat feed: rendering messages, reactions, typing bar, event cards.
import { state, findMessage, upsertCapsule } from "./store.js";
import { send } from "./connection.js";
import { $, esc, uid, hashHue, fmtTime, timeAgo } from "./utils.js";

const REACTIONS = ["❤️", "😂", "🔥", "😮", "👏", "💀", "👍"];

export function avatarHtml(username, size = 34) {
  const hue = hashHue(username);
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:linear-gradient(135deg,hsl(${hue},70%,48%),hsl(${(hue + 40) % 360},70%,38%))">${esc(username.slice(0, 1).toUpperCase())}</span>`;
}

export function renderMessage(msg, opts = {}) {
  const mine = msg.userId === state.self.userId;
  const isSystem = msg.kind === "system";
  const isEvent = msg.kind === "chaos" || msg.kind === "challenge" || msg.kind === "poll" || msg.kind === "mystery";
  const isCapsule = msg.kind === "time_capsule";

  const wrap = document.createElement("div");
  wrap.className = `msg kind-${msg.kind || "message"}${mine ? " mine" : ""}${isCapsule && !msg.locked ? " capsule-unlocked" : ""}`;
  wrap.dataset.id = msg.id;

  let inner = "";
  if (isSystem || isEvent) {
    inner = `<div class="bubble-wrap"><div class="bubble">${esc(msg.text)}</div></div>`;
  } else {
    const reactionsHtml = reactionsRow(msg, mine);
    const meta = `
      <div class="bubble-meta">
        <span class="author">${esc(msg.username)}</span>
        <span class="time">${fmtTime(msg.timestamp)}</span>
      </div>`;
    let capsuleBadge = "";
    let body = esc(msg.text);
    if (isCapsule) {
      capsuleBadge = `<span class="capsule-badge">${msg.locked ? "🔒 TIME CAPSULE (locked)" : "✨ TIME CAPSULE UNLOCKED"}${!msg.locked && msg.unlockedAt ? " • " + fmtTime(msg.unlockedAt) : ""}</span><br>`;
      if (msg.locked) {
        const c = msg.unlockCondition;
        const when = c && c.type === "messages"
          ? `opens after ${c.count} messages`
          : c && c.type === "date"
            ? `opens ${new Date(c.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : "sealed for later";
        body = `🔒 A sealed message — ${when}.`;
      }
    }
    inner = `
      <div class="bubble-wrap">
        ${meta}
        <div class="bubble">${capsuleBadge}${body}</div>
        ${reactionsHtml ? `<div class="reactions">${reactionsHtml}</div>` : ""}
        <div class="reaction-bar">${REACTIONS.map((r) => `<button data-emoji="${r}">${r}</button>`).join("")}</div>
      </div>`;
  }

  wrap.innerHTML = inner;
  if (!isSystem && !isEvent) {
    wrap.innerHTML = avatarHtml(msg.username) + wrap.innerHTML;
  }

  // click handling: react from the quick bar, or toggle existing reactions
  if (!isSystem && !isEvent) {
    wrap.querySelectorAll(".reaction-bar button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        send("REACTION_TOGGLE", { messageId: msg.id, emoji: btn.dataset.emoji });
      });
    });
    wrap.querySelectorAll(".reaction").forEach((el) => {
      el.addEventListener("click", () => {
        send("REACTION_TOGGLE", { messageId: msg.id, emoji: el.dataset.emoji });
      });
    });
  }
  return wrap;
}

function reactionsRow(msg, mine) {
  const entries = Object.entries(msg.reactions || {});
  if (entries.length === 0) return "";
  return entries
    .filter(([, n]) => n > 0)
    .map(([emoji, n]) => {
      const isMine = (msg.reactedBy?.[emoji] || []).includes(state.self.userId);
      return `<span class="reaction${isMine ? " mine" : ""}" data-emoji="${emoji}">${emoji}<span class="count">${n}</span></span>`;
    })
    .join("");
}

export function appendMessage(msg, { scroll = true } = {}) {
  const pad = $("#feed-pad");
  const node = renderMessage(msg);
  pad.appendChild(node);
  while (pad.children.length > 400) pad.firstChild.remove();
  if (scroll) scrollFeed();
  return node;
}

export function scrollFeed() {
  const feed = $("#feed");
  feed.scrollTop = feed.scrollHeight;
}

// typing bar
export function showTyping(list) {
  const bar = $("#typing-bar");
  if (!list || list.length === 0) {
    bar.classList.add("hidden");
    state.typing.clear();
    return;
  }
  const text =
    list.length === 1
      ? `${list[0]} is typing…`
      : list.length === 2
        ? `${list[0]} and ${list[1]} are typing…`
        : `${list[0]} and ${list.length - 1} others are typing…`;
  $("#typing-text").textContent = text;
  bar.classList.remove("hidden");
}

// ---------- float animation for reactions ----------
export function floatReaction(emoji, fromRect) {
  const el = document.createElement("div");
  el.className = "float-reaction";
  el.textContent = emoji;
  el.style.left = `${Math.max(10, Math.min(window.innerWidth - 40, fromRect.left + fromRect.width / 2 - 14))}px`;
  el.style.top = `${fromRect.top - 8}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ---------- event card (chaos / challenge) ----------
export function renderEventCard() {
  const chaos = state.chaos;
  const challenge = state.challenge;
  const card = $("#event-card");
  if (!chaos && !challenge) {
    card.classList.add("hidden");
    card.innerHTML = "";
    return;
  }
  card.classList.remove("hidden");
  let html = "";
  if (chaos) {
    html = `
      <div class="ev-kind">⚡ CHAOS EVENT</div>
      <div class="ev-title">${esc(chaos.title)}</div>
      <div class="ev-text">${esc(chaos.text)}</div>
      <div class="event-timer">
        <span class="event-cta">Everyone joins — send a message!</span>
        <div class="event-timer-bar"><span id="ev-timer-fill" class="event-timer-fill"></span></div>
        <span id="ev-timer-rem" class="ev-timer">…</span>
      </div>`;
  } else if (challenge) {
    const participants = Object.keys(challenge.participants || {}).length;
    html = `
      <div class="ev-kind">🏆 CHALLENGE</div>
      <div class="ev-title">${esc(challenge.prompt)}</div>
      <div class="ev-text">${participants} participating${challenge.champion ? ` • winner: ${esc(challenge.champion)}` : " — be the first to complete it!"}</div>
      <div class="event-timer">
        <span class="event-cta">Send a matching message to earn 50 XP.</span>
        <div class="event-timer-bar"><span id="ev-timer-fill" class="event-timer-fill" style="background:linear-gradient(90deg,#7c6cff,#4dd6ff)"></span></div>
        <span id="ev-timer-rem" class="ev-timer">…</span>
      </div>`;
  } else {
    return;
  }
  card.innerHTML = html;
}

export function tickEventTimers() {
  renderEventCard();
  const fill = $("#ev-timer-fill");
  const rem = $("#ev-timer-rem");
  if (!fill || !rem) return;
  const ev = state.chaos || state.challenge;
  if (!ev) return;
  const total = ev.endsAt - ev.startsAt;
  const left = Math.max(0, ev.endsAt - Date.now());
  fill.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
  rem.textContent = `${Math.ceil(left / 1000)}s`;
}

let timerInterval = null;
export function startTimersLoop() {
  timerInterval = setInterval(tickEventTimers, 500);
}
export function stopTimersLoop() {
  if (timerInterval) clearInterval(timerInterval);
}