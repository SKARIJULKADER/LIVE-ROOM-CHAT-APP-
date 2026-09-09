// LIVE ROOM client bootstrap: joins the room, routes all server events to the UI.
import { state, upsertUser, findMessage, upsertCapsule } from "./store.js";
import { connect, on, send } from "./connection.js";
import { $, toast, uid } from "./utils.js";
import {
  appendMessage,
  renderMessage,
  showTyping,
  floatReaction,
  renderEventCard,
  startTimersLoop,
  scrollFeed,
} from "./chat.js";
import { renderAllPanels } from "./panels.js";
import { wireChaosButton, wirePollModal, wireCapsuleModal, wireMystery, showMysteryReveal } from "./games.js";

// client event bus (used by panels to request actions)
window.dispatchClientEvent = (name, detail) => {
  window.dispatchEvent(new CustomEvent(`client:${name}`, { detail }));
};

// ---------------- identity / persistence helpers ----------------
const SAVE_KEY = "liveroom.identity";
function loadIdentity() {
  const id = localStorage.getItem("liveroom.userId") || uid("user-");
  localStorage.setItem("liveroom.userId", id);
  return id;
}

// ---------------- onboarding ----------------
function initOnboarding() {
  $("#join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const username = $("#join-name").value.trim() || "Guest";
    const roomId = $("#join-room").value.trim();
    if (!roomId) return;
    const join = { roomId, username, userId: loadIdentity() };
    state.self.username = username;
    // same-tab transition: fade the card out, reveal the app, then connect
    const onb = $("#onboarding");
    onb.classList.add("exit");
    setTimeout(() => {
      onb.classList.add("hidden");
      const app = $("#app");
      app.classList.remove("hidden");
      app.classList.add("enter");
      connect(join);
    }, 450);
  });

  const last = JSON.parse(localStorage.getItem("liveroom.last") || "{}");
  if (last.username) $("#join-name").value = last.username;
  if (last.room) $("#join-room").value = last.room;

  // quick room suggestion buttons
  document.querySelectorAll(".room-suggestions button[data-room]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#join-room").value = btn.getAttribute("data-room");
      $("#join-room").focus();
    });
  });
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}
// ---------------- server event handlers ----------------
function wireEvents() {
  on("WELCOME", (p) => {
    if (p.userId) state.self.userId = p.userId;
    localStorage.setItem(
      "liveroom.last",
      JSON.stringify({ username: p.username || state.self.username, room: p.roomId || state.roomId })
    );
  });

  on("ROOM_STATE", (p) => {
    state.roomId = p.roomId;
    state.roomTitle = p.roomTitle || p.roomId;
    state.users.clear();
    (p.users || []).forEach(upsertUser);
    state.messages = p.messages || [];
    state.energy = p.energy || state.energy;
    state.meta = p.meta || state.meta;
    state.chaos = p.chaos || null;
    state.challenge = p.challenge || null;
    state.polls = p.polls || [];
    state.capsules = p.capsules || [];
    state.mystery = p.mystery || null;
    if (p.me) {
      Object.assign(state.self, {
        userId: p.me.userId,
        username: p.me.username,
        xp: p.me.xp ?? 0,
        level: p.me.level ?? 1,
        levelTitle: p.me.levelTitle ?? "Newcomer",
        progress: p.me.progress ?? 0,
        xpForNext: p.me.xpForNext ?? null,
        mysteryRole: p.me.mysteryRole ?? null,
      });
    }
    state.joined = true;

    $("#room-title").textContent = state.roomTitle;
    $("#room-personality").textContent = state.meta.title || state.roomTitle;
    const pad = $("#feed-pad");
    pad.innerHTML = `<div class="dayline"><span class="dayline-text">🌱 Welcome to <b>${escHtml(state.roomTitle)}</b>. The conversation is alive.</span></div>`;
    (state.messages || []).forEach((m) => pad.appendChild(renderMessage(m)));
    renderEventCard();
    renderAllPanels();
    renderXpPill();
    scrollFeed();
  });

  on("MESSAGE", (msg) => {
    appendMessage(msg);
    if (msg.kind === "time_capsule") upsertCapsule(msg);
  });

  on("USER_JOINED", (u) => {
    upsertUser(u);
    renderAllPanels();
    toast(`${u.username} joined 🌟`, "toast");
  });

  on("USER_LEFT", (u) => {
    state.users.delete(u.id);
    renderAllPanels();
    toast(`${u.username} left 👋`, "toast");
  });

  on("PRESENCE_UPDATE", (p) => {
    state.users.clear();
    (p.users || []).forEach(upsertUser);
    renderAllPanels();
    const typing = (p.users || []).filter((u) => u.isTyping).map((u) => u.username);
    showTyping(typing.length ? typing : null);
  });

  on("TYPING_START", (p) => {
    const u = state.users.get(p.userId);
    if (u) {
      u.isTyping = true;
      renderAllPanels();
    }
    showTyping(p.typingUsers || [p.username]);
  });

  on("TYPING_STOP", (p) => {
    const u = state.users.get(p.userId);
    if (u) {
      u.isTyping = false;
      renderAllPanels();
    }
    showTyping(p.typingUsers && p.typingUsers.length ? p.typingUsers : null);
  });
on("REACTION_UPDATED", (p) => {
    const msg = findMessage(p.messageId);
    if (!msg) return;
    const wasMine = (msg.reactedBy?.[p.emoji] || []).includes(state.self.userId);
    msg.reactions = p.reactions || {};
    msg.reactedBy = p.reactedBy || {};;
    const node = document.querySelector(`.msg[data-id="${p.messageId}"] .reactions`);
    const isMine = (msg.reactedBy?.[p.emoji] || []).includes(state.self.userId);
    if (p.added && !isMine && !wasMine) {
      const from = node || document.querySelector(`.msg[data-id="${p.messageId}"]`);
      if (from) floatReaction(p.emoji, from.getBoundingClientRect());
    }
    // re-render just the reaction row
    const holder = document.querySelector(`.msg[data-id="${p.messageId}"] .reactions`);
    if (holder) {
      holder.innerHTML = Object.entries(msg.reactions || {})
        .filter(([, n]) => n > 0)
        .map(
          ([emoji, n]) =>
            `<span class="reaction${(msg.reactedBy?.[emoji] || []).includes(state.self.userId) ? " mine" : ""}" data-emoji="${emoji}">${emoji}<span class="count">${n}</span></span>`
        )
        .join("");
      holder.querySelectorAll(".reaction").forEach((el) => {
        el.addEventListener("click", () => send("REACTION_TOGGLE", { messageId: p.messageId, emoji: el.dataset.emoji }));
      });
    }
  });

  on("ENERGY_UPDATE", (e) => {
    state.energy = e;
    renderAllPanels();
  });

  on("ROOM_META_UPDATE", (m) => {
    state.meta = m;
    state.roomTitle = m.title || state.roomTitle;
    $("#room-title").textContent = state.roomTitle;
    $("#room-personality").textContent = m.title || state.roomTitle;
    renderAllPanels();
  });

  on("CHAOS_STARTED", (p) => {
    state.chaos = p.event;
    renderEventCard();
    toast(`⚡ CHAOS: ${p.event.title}`, "toast-xp");
  });

  on("CHAOS_ENDED", () => {
    state.chaos = null;
    renderEventCard();
  });

  on("CHALLENGE_STARTED", (p) => {
    state.challenge = p.challenge;
    renderEventCard();
    toast(`🏆 Challenge: ${p.challenge.prompt}`, "toast-xp");
  });

  on("CHALLENGE_COMPLETED", (p) => {
    if (state.challenge) {
      state.challenge.participants[p.user.id] = { username: p.user.username, completedAt: Date.now(), completed: true };
      if (!state.challenge.champion) state.challenge.champion = p.user.username;
    }
    toast(`🏆 ${p.user.username} completed the challenge! +50 XP`, "toast-xp");
    renderEventCard();
  });

  on("CHALLENGE_ENDED", () => {
    state.challenge = null;
    renderEventCard();
  });

  on("POLL_CREATED", (p) => {
    state.polls = [p.poll, ...state.polls.filter((x) => x.id !== p.poll.id)].slice(0, 10);
    renderAllPanels();
  });

  on("POLL_UPDATED", (p) => {
    state.polls = state.polls.map((poll) => (poll.id === p.poll.id ? p.poll : poll));
    renderAllPanels();
  });

  on("XP_UPDATED", (p) => {
    if (p.userId === state.self.userId) {
      state.self.xp = p.xp;
      state.self.level = p.level;
      state.self.levelTitle = p.levelTitle;
      state.self.progress = p.progress;
      state.self.xpForNext = p.xpForNext;
      if (p.leveledUp) toast(`✨ LEVEL ${p.level} — ${p.levelTitle}!`, "toast-xp");
    }
    const u = state.users.get(p.userId);
    if (u) u.xp = p.xp;
    renderAllPanels();
    renderXpPill();
  });

  on("TIME_CAPSULE_CREATED", (p) => {
    upsertCapsule(p.capsule);
    renderAllPanels();
  });

  on("TIME_CAPSULE_UNLOCKED", (p) => {
    upsertCapsule(p.capsule);
    const msg = state.messages.find((m) => m.id === p.capsule.id) || p.capsule;
    const existing = document.querySelector(`.msg[data-id="${p.capsule.id}"]`);
    if (existing) existing.replaceWith(renderMessage(msg));
    renderAllPanels();
    toast(`✨ A time capsule just opened!`, "toast-xp");
  });

  on("MYSTERY_STARTED", (p) => {
    state.mystery = { roundId: p.roundId, phase: p.phase, phaseEndsAt: p.phaseEndsAt, impostorCount: p.impostorCount };
    renderAllPanels();
    toast(`🕵️ Mystery round began — ${p.impostorCount} impostor(s) among ${p.playerCount}!`, "toast-xp");
  });

  on("MYSTERY_ROLE", (p) => {
    state.self.mysteryRole = p.role;
    if (p.role === "impostor") toast("🕵️ You are the IMPOSTOR. Blend in…", "toast-xp");
    renderAllPanels();
  });

  on("MYSTERY_PHASE", (p) => {
    state.mystery = { ...(state.mystery || {}), roundId: p.roundId, phase: p.phase, phaseEndsAt: p.phaseEndsAt };
    renderAllPanels();
    if (p.phase === "voting") toast("🕵️ Voting time — who do you trust?", "toast-xp");
  });

  on("MYSTERY_REVEAL", (p) => {
    state.mystery = null;
    state.self.mysteryRole = null;
    renderAllPanels();
    showMysteryReveal(p);
  });

  on("ERROR", (p) => {
    toast(`⚠️ ${p.message || p.code}`, "toast");
  });

  on("__disconnect__", () => {
    state.chaos = null;
    state.challenge = null;
    renderEventCard();
  });
}
// ---------------- XP pill ----------------
export function renderXpPill() {
  const s = state.self;
  let el = $("#xp-pill");
  if (!el) {
    el = document.createElement("span");
    el.id = "xp-pill";
    el.className = "xp-pill";
    el.title = "Your XP";
    const conn = $("#conn");
    if (conn) conn.parentElement.insertBefore(el, conn);
  }
  el.innerHTML = `<span>LVL ${s.level} • ${escHtml(s.levelTitle)}</span>
    <span class="xp-bar"><i style="width:${Math.round((s.progress || 0) * 100)}%"></i></span>
    <span class="lvl">${Math.round(s.xp)}${s.xpForNext != null ? ` / ${s.xpForNext}` : ""}</span>`;
}

// ---------------- composer ----------------
function wireComposer() {
  const input = $("#input");
  const sendBtn = $("#btn-send");
  let typingSentAt = 0;
  let stopTimer = null;

  const sendMessage = () => {
    const text = input.value.trim();
    if (!text) return;
    send("SEND_MESSAGE", { text, clientId: uid("m") });
    input.value = "";
    input.focus();
  };

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // throttled typing indicator (max one START per 1.2s + auto STOP after 4s)
  input.addEventListener("input", () => {
    const now = Date.now();
    if (now - typingSentAt > 1200) {
      typingSentAt = now;
      send("USER_TYPING");
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => send("STOP_TYPING"), 4000);
    }
  });
  input.addEventListener("blur", () => send("STOP_TYPING"));
}

// ---------------- sidebar (mobile drawer) ----------------
function wireSidebar() {
  const sb = $("#sidebar");
  const backdrop = $("#sheet-backdrop");
  const open = () => {
    sb.classList.add("open");
    backdrop.classList.remove("hidden");
  };
  const close = () => {
    sb.classList.remove("open");
    backdrop.classList.add("hidden");
  };
  $("#btn-sidebar").addEventListener("click", open);
  $("#btn-sidebar-close").addEventListener("click", close);
  backdrop.addEventListener("click", close);
}

// ---------------- ambient canvas ----------------
function initAmbient() {
  const canvas = $("#ambient");
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  const resize = () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);

  const particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      hue: 250 + Math.random() * 70,
      a: 0.15 + Math.random() * 0.4,
    });
  }

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const tier = document.body.dataset.tier || "calm";
    const speed = tier === "chaos" ? 1.6 : tier === "energetic" ? 1.3 : tier === "active" ? 1.1 : tier === "relaxed" ? 0.8 : 0.6;
    for (const p of particles) {
      p.x += p.vx * speed;
      p.y += p.vy * speed;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${p.a * (tier === "chaos" ? 1 : 0.8)})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

// ---------------- boot ----------------
function boot() {
  initOnboarding();
  wireEvents();
  wireComposer();
  wireSidebar();
  wireChaosButton();
  wirePollModal();
  wireCapsuleModal();
  wireMystery();
  initAmbient();
  startTimersLoop();

  // refresh mystery timer text every second
  setInterval(() => {
    if (state.mystery) renderAllPanels();
  }, 1000);
}

document.addEventListener("DOMContentLoaded", boot);