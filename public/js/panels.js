// Sidebar panels: energy, living world, personality, presence, polls, capsules, moments, mystery.
import { state } from "./store.js";
import { $, esc, fmtTime, timeAgo, hashHue } from "./utils.js";

const LEVELS = [
  { level: 1, xp: 0, title: "Newcomer" },
  { level: 2, xp: 60, title: "Regular" },
  { level: 3, xp: 160, title: "Talker" },
  { level: 4, xp: 340, title: "Conversationalist" },
  { level: 5, xp: 640, title: "Social Pro" },
  { level: 6, xp: 1100, title: "Chat Master" },
  { level: 7, xp: 1800, title: "Chaos Agent" },
  { level: 8, xp: 2800, title: "Chat Legend" },
];
export function levelOf(xp) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) lvl = l;
  return lvl.level;
}

export function renderEnergy() {
  const e = state.energy;
  $("#energy-bar").style.width = `${e.score}%`;
  $("#energy-score").textContent = `${Math.round(e.score)}%`;
  $("#energy-label").textContent = e.label;
  // subtle ambient tier on <body> to influence animations
  document.body.dataset.tier = e.tier;
}

export function renderWorld() {
  const w = state.meta.world || { points: 0, stage: 0, stageName: "🌱 Seed", branches: 0, flowers: 0, glows: 0 };
  $("#world-art").textContent = w.stageName;
  $("#world-stage").textContent = w.stageName;
  $("#world-points").textContent = `${w.points} pts`;
  $("#world-branches").textContent = w.branches;
  $("#world-flowers").textContent = w.flowers;
  $("#world-glows").textContent = w.glows;
}

export function renderPersonality() {
  const p = state.meta.personality || {};
  const set = (id, val) => {
    const el = $(id);
    if (el) el.style.width = `${val}%`;
  };
  set("#trait-humor", p.humor ?? 0);
  set("#trait-chaos", p.chaos ?? 0);
  set("#trait-deep", p.deep ?? 0);
  set("#trait-activity", p.activity ?? 0);
  $("#trait-humor-v").textContent = `${p.humor ?? 0}%`;
  $("#trait-chaos-v").textContent = `${p.chaos ?? 0}%`;
  $("#trait-deep-v").textContent = `${p.deep ?? 0}%`;
  $("#trait-activity-v").textContent = `${p.activity ?? 0}%`;
}

export function renderPresence() {
  const list = [...state.users.values()];
  list.sort((a, b) => (b.xp - a.xp) || (b.messageCount - a.messageCount));
  $("#online-count").textContent = String(list.length);
  const ul = $("#userlist");
  ul.innerHTML = list
    .map((u) => {
      const hue = hashHue(u.username);
      const typing = u.isTyping ? `<span class="u-typing">typing…</span>` : "";
      return `<li class="u">
        <span class="u-av" style="background:linear-gradient(135deg,hsl(${hue},70%,48%),hsl(${(hue + 40) % 360},70%,38%))">${esc(u.username.slice(0, 1).toUpperCase())}</span>
        <span class="u-name">${esc(u.username)}${u.id === state.self.userId ? " <i style='opacity:.6'>(you)</i>" : ""}${typing}</span>
        <span class="u-xp">Lv ${levelOf(u.xp)}</span>
        <span class="u-status ${u.status === "away" ? "u-status-away" : "u-status-online"}"></span>
      </li>`;
    })
    .join("");
}

export function renderPolls() {
  const holder = $("#polls");
  if (!state.polls.length) {
    holder.innerHTML = `<p class="muted empty">No polls yet. Start one with 📊.</p>`;
    return;
  }
  holder.innerHTML = state.polls
    .map((poll) => {
      const total = poll.votes.reduce((a, b) => a + b, 0) || 1;
      const voted = poll.voters.includes(state.self.userId);
      const rows = poll.options
        .map((opt, i) => {
          const n = poll.votes[i] ?? 0;
          const pct = Math.round((n / total) * 100);
          return `<div class="poll-opt ${voted || poll.closed ? "" : "clickable"}" data-poll="${poll.id}" data-opt="${i}">
            <span class="po-bar" style="width:${pct}%;"></span>
            <span class="po-label">${esc(opt)}</span><span class="po-val">${pct}%</span>
          </div>`;
        })
        .join("");
      const by = poll.closed ? "Closed" : `by ${esc(poll.username)} • ${total} vote${total === 1 ? "" : "s"}`;
      return `<div class="poll">
        <div class="poll-q">📊 ${esc(poll.question)}</div>
        ${rows}
        <div class="poll-meta">${by}</div>
      </div>`;
    })
    .join("");

  holder.querySelectorAll(".poll-opt.clickable").forEach((el) => {
    el.addEventListener("click", () => {
      window.dispatchClientEvent?.("poll-vote", { pollId: el.dataset.poll, option: Number(el.dataset.opt) });
    });
  });
}

export function renderCapsules() {
  const holder = $("#capsules");
  if (!state.capsules.length) {
    holder.innerHTML = `<p class="muted empty">Sealed messages for later. 🔒</p>`;
    return;
  }
  holder.innerHTML = state.capsules
    .map((c) => {
      const when = c.locked ? unlockDesc(c.unlockCondition) : `unlocked ${timeAgo(c.unlockedAt || Date.now())}`;
      const note = c.locked ? `🔒 ${esc(c.text.length > 60 ? c.text.slice(0, 60) + "…" : c.text)}` : esc(c.text);
      return `<div class="capsule-item ${c.locked ? "locked" : "unlocked"}">
        <div class="cap-note">${note}</div>
        <span class="cap-when">${when}</span>
      </div>`;
    })
    .join("");
}

function unlockDesc(cond) {
  if (!cond) return "";
  if (cond.type === "messages") return `opens after ${cond.count} messages`;
  if (cond.type === "date") {
    const d = new Date(cond.at);
    return `opens ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  }
  return "";
}

export function renderMoments() {
  const m = state.meta.moments;
  const holder = $("#moments");
  if (!m || m.messageCount === 0) {
    holder.innerHTML = `<p class="muted empty">Building history…</p>`;
    return;
  }
  const rows = [];
  if (m.mostReacted) rows.push(`<div class="m-row"><span>🔥 Most reacted</span><b>"${esc(m.mostReacted.text)}"</b></div>`);
  if (m.mostActive) rows.push(`<div class="m-row"><span>💬 Most active</span><b>${esc(m.mostActive.username)}</b></div>`);
  if (m.mostUsed) rows.push(`<div class="m-row"><span>❤️ Most used</span><b>${m.mostUsed.emoji}</b></div>`);
  if (m.peakMinute && m.peakMinute.count > 0) rows.push(`<div class="m-row"><span>⚡ Peak activity</span><b>${fmtTime(m.peakMinute.at)}</b></div>`);
  if (m.challengeChampion) rows.push(`<div class="m-row"><span>🏆 Challenge winner</span><b>${esc(m.challengeChampion.username)}</b></div>`);
  rows.push(`<div class="m-row"><span>💬 Messages</span><b>${m.messageCount}</b></div>`);
  holder.innerHTML = rows.length ? rows.join("") : `<p class="muted empty">Building history…</p>`;
}

export function renderMysteryPanel() {
  const panel = $("#mystery-panel");
  const m = state.mystery;
  if (!m) {
    panel.innerHTML = `<p class="muted">Turn the room into a game of hidden roles.</p>
      <button id="btn-mystery" class="btn btn-ghost btn-block">Activate round</button>`;
    const btn = $("#btn-mystery");
    if (btn) btn.addEventListener("click", () => window.dispatchClientEvent?.("mystery-activate", {}));
    return;
  }
  const secs = Math.max(0, Math.ceil((m.phaseEndsAt - Date.now()) / 1000));
  panel.innerHTML = `<div class="mystery-banner">🕵️ Mystery round in progress
    <div>Phase: <b>${m.phase === "playing" ? "playing" : "voting"}</b> • ${secs}s left</div>
    ${m.phase === "voting" ? `<button id="btn-vote-now" class="btn btn-ghost btn-block">Cast your vote</button>` : ""}
    </div>`;
  const voteBtn = $("#btn-vote-now");
  if (voteBtn) voteBtn.addEventListener("click", () => window.dispatchClientEvent?.("mystery-vote-open", {}));
}

export function renderAllPanels() {
  renderEnergy();
  renderWorld();
  renderPersonality();
  renderPresence();
  renderPolls();
  renderCapsules();
  renderMoments();
  renderMysteryPanel();
}