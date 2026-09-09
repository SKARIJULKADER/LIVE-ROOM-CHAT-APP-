// Reusable browser E2E core (spawns headless Chrome over raw CDP — no extra deps).
// Exports runE2E(urlBase) so other test runners can call it in-process.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The flow executed inside the page (serialized via toString).
async function pageFlow() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const result = { joined: false, sentEnter: false, seenEnter: null, sentButton: false, seenButton: null };

  document.querySelector("#join-name").value = "Tester";
  document.querySelector("#join-room").value = "e2e-room-" + Math.floor(Math.random() * 1e9);
  document.querySelector("#join-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await sleep(1400); // onboarding fade (450ms) + ws join + ROOM_STATE
  result.joined = !document.querySelector("#app").classList.contains("hidden");

  // --- path 1: type + Enter ---
  const input = document.querySelector("#input");
  input.value = "Hello E2E via Enter";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(800);
  result.sentEnter = input.value === ""; // composer clears after send
  result.seenEnter = [...document.querySelectorAll("#feed-pad .msg .bubble")]
    .map((b) => b.textContent.trim())
    .filter((t) => t.includes("Hello E2E via Enter")).length > 0;

  // --- path 2: type + click send button ---
  input.value = "Hello E2E via button";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#btn-send").click();
  await sleep(800);
  result.sentButton = input.value === "";
  result.seenButton = [...document.querySelectorAll("#feed-pad .msg .bubble")]
    .map((b) => b.textContent.trim())
    .filter((t) => t.includes("Hello E2E via button")).length > 0;

  result.feedCountAfter = document.querySelectorAll("#feed-pad .msg").length;
  result.msgClasses = [...document.querySelectorAll("#feed-pad .msg")].map((n) => n.className);
  return result;
}

export async function runE2E(urlBase, { log = console.log } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "chrome-e2e-"));
  log(`[e2e] launching headless Chrome -> ${urlBase}`);
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=9223`,
      "--window-size=1400,900",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    let target = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:9223/json`);
        const targets = await res.json();
        target = targets.find((t) => t.type === "page");
        if (target) break;
      } catch {}
      await sleep(250);
    }
    if (!target) throw new Error("Chrome did not expose a debug target");

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });

    await ws.send(JSON.stringify({ id: 1, method: "Runtime.enable", params: {} }));
    await ws.send(JSON.stringify({ id: 2, method: "Page.enable", params: {} }));
    await ws.send(JSON.stringify({ id: 3, method: "Log.enable", params: {} }));

    // capture console errors + uncaught exceptions from the very start
    const problems = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
        problems.push({ kind: "console." + msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ") });
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        problems.push({ kind: "exception", text: `${d.text} ${d.exception?.description ?? ""} @${d.url ?? ""}:${d.lineNumber ?? ""}` });
      }
      if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
        problems.push({ kind: "log.error", text: `${msg.params.entry.text} (${msg.params.entry.url ?? ""})` });
      }
    });

    // minimal CDP caller with per-call id
    let cdpId = 10;
    async function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = cdpId++;
        const onMsg = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id === id) {
            ws.removeEventListener("message", onMsg);
            msg.error ? reject(new Error(method + ": " + JSON.stringify(msg.error))) : resolve(msg.result);
          }
        };
        ws.addEventListener("message", onMsg);
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { ws.removeEventListener("message", onMsg); reject(new Error("CDP timeout: " + method)); }, 20000);
      });
    }

    await cdp("Page.navigate", { url: urlBase });
    await sleep(1500);
    const flowRes = await cdp("Runtime.evaluate", {
      expression: `(${pageFlow.toString()})()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const r = flowRes.result?.value ?? {};
    const pass = r.joined && r.sentEnter && r.seenEnter && r.sentButton && r.seenButton && problems.length === 0;
    return { pass, result: r, problems, pageFlowSrc: pageFlow };
  } finally {
    chrome.kill("SIGTERM");
    await sleep(300);
  }
}
