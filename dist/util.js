export function uid(prefix = "") {
    return (prefix +
        Math.random().toString(36).slice(2, 8) +
        Date.now().toString(36).slice(-4));
}
export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
/** stable hue for an avatar derived from a name */
export function hashHue(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 360;
}
export function fmtShortTime(ms) {
    const d = new Date(ms);
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${mins} ${ampm}`;
}
export function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}
export function sanitizeName(raw) {
    return raw.trim().replace(/[<>&]/g, "").slice(0, 24) || "Guest";
}
//# sourceMappingURL=util.js.map