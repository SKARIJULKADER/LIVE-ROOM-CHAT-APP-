// Shared helpers for the LIVE ROOM client.

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export const $ = (sel) => document.querySelector(sel);

export function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function hashHue(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function fmtTime(ts) {
  const d = new Date(ts);
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

export function timeAgo(ts) {
  const sec = (Date.now() - ts) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function toast(text, cls = "toast") {
  const layer = $("#toasts");
  if (!layer) return;
  const node = document.createElement("div");
  node.className = `toast ${cls}`;
  node.textContent = text;
  layer.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity 0.4s ease";
    setTimeout(() => node.remove(), 450);
  }, 3600);
}