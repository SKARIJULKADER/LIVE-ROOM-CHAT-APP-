// Games & social features: chaos trigger, poll + capsule modals, mystery voting.
import { state } from "./store.js";
import { send } from "./connection.js";
import { $, esc, toast } from "./utils.js";

// chaos button
export function wireChaosButton() {
  const btn = $("#btn-chaos");
  btn.addEventListener("click", () => {
    send("CHAOS_TRIGGER", {});
    toast("⚡ Chaos unleashed!", "toast-xp");
  });
}

// ---------------- POLL modal ----------------
function openPollModal() {
  $("#modal-poll").classList.remove("hidden");
  $("#poll-q").focus();
}
function closePollModal() {
  $("#modal-poll").classList.add("hidden");
}
export function wirePollModal() {
  $("#btn-poll").addEventListener("click", openPollModal);
  $("#poll-cancel").addEventListener("click", closePollModal);
  $("#poll-save").addEventListener("click", () => {
    const q = $("#poll-q").value.trim();
    const options = [
      $("#poll-o1").value.trim(),
      $("#poll-o2").value.trim(),
      $("#poll-o3").value.trim(),
      $("#poll-o4").value.trim(),
    ].filter(Boolean);
    if (!q) return toast("Add a question.", "toast");
    if (options.length < 2) return toast("Add at least 2 options.", "toast");
    send("POLL_CREATE", { question: q, options });
    // reset
    ["poll-q", "poll-o1", "poll-o2", "poll-o3", "poll-o4"].forEach((id) => ($(id).value = ""));
    closePollModal();
  });
}

// ---------------- TIME CAPSULE modal ----------------
function openCapsuleModal() {
  $("#modal-capsule").classList.remove("hidden");
  $("#cap-text").focus();
  toggleCapFields();
}
function closeCapsuleModal() {
  $("#modal-capsule").classList.add("hidden");
}
function toggleCapFields() {
  const mode = document.querySelector('input[name="cap-cond"]:checked')?.value;
  $("#cap-date-field").classList.toggle("hidden", mode !== "date");
  $("#cap-msg-field").classList.toggle("hidden", mode !== "messages");
}
export function wireCapsuleModal() {
  $("#btn-capsule").addEventListener("click", openCapsuleModal);
  $("#cap-cancel").addEventListener("click", closeCapsuleModal);
  document.querySelectorAll('input[name="cap-cond"]').forEach((r) => r.addEventListener("change", toggleCapFields));

  const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
  $("#cap-date").value = toLocalInput(defaultDate);

  $("#cap-save").addEventListener("click", () => {
    const text = $("#cap-text").value.trim();
    if (!text) return toast("Write a note first.", "toast");
    const mode = document.querySelector('input[name="cap-cond"]:checked')?.value;
    let condition;
    if (mode === "messages") {
      condition = { type: "messages", count: Math.max(3, Number($("#cap-count").value) || 50) };
    } else {
      const val = $("#cap-date").value;
      const at = val ? new Date(val).getTime() : Date.now() + 60 * 60 * 1000;
      condition = { type: "date", at };
    }
    send("TIME_CAPSULE_CREATE", { text, condition });
    toast("🔒 Capsule sealed. Time will tell…", "toast-xp");
    $("#cap-text").value = "";
    closeCapsuleModal();
  });
}
function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------- MYSTERY ----------------
export function wireMystery() {
  const modal = $("#modal-vote");
  const targets = $("#vote-targets");

  window.addEventListener("client:mystery-vote-open", () => {
    const users = [...state.users.values()].filter((u) => u.id !== state.self.userId);
    if (!users.length) return toast("Nobody else to vote for.", "toast");
    targets.innerHTML = users
      .map((u) => `<button data-target="${u.id}">${esc(u.username)}</button>`)
      .join("");
    targets.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        send("MYSTERY_VOTE", { targetId: btn.dataset.target });
        toast("🕵️ Vote cast.", "toast-xp");
        modal.classList.add("hidden");
      });
    });
    modal.classList.remove("hidden");
  });

  window.addEventListener("client:mystery-activate", () => {
    send("MYSTERY_ACTIVATE", {});
  });

  window.addEventListener("client:poll-vote", (e) => {
    const { pollId, option } = e.detail || {};
    send("POLL_VOTE", { pollId, option });
  });

  $("#vote-cancel").addEventListener("click", () => modal.classList.add("hidden"));

  // close modals on backdrop click
  document.querySelectorAll(".modal").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) m.classList.add("hidden");
    });
  });
}

// reveal overlay
export function showMysteryReveal(payload) {
  const title = $("#reveal-title");
  const body = $("#reveal-body");
  const overlay = $("#mystery-reveal");

  if (payload.cancelled) {
    title.textContent = "MYSTERY ROUND CANCELLED";
    body.innerHTML = `<p>Too many players left. The round was called off.</p>`;
  } else {
    title.textContent = payload.caught ? "IMPOSTOR CAUGHT!" : "THE IMPOSTOR WAS…";
    const impText = (payload.impostors || []).map((i) => `👤 <b>${esc(i.username)}</b>`).join(" & ");
    const accused = payload.accused ? `<p>Top suspect: <b>${esc(payload.accused.username)}</b></p>` : "";
    body.innerHTML = `
      <p>${impText || "—"}</p>
      ${accused}
      <p style="margin-top:8px">${payload.caught ? "The crew saw through the lies. 🎉" : "They got away with it. 🔪"}</p>`;
  }
  overlay.classList.remove("hidden");
  $("#reveal-close").onclick = () => overlay.classList.add("hidden");
}