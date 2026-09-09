import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { attachSocket, onSocketClose, startPresenceTicks } from "./handlers.js";
import { startEnergyTicks } from "./energy.js";
import { startMetaTicks } from "./meta.js";
import { startCapsuleTicks } from "./timecapsules.js";
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
    try {
        let pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
        if (pathname === "/")
            pathname = "/index.html";
        const filePath = normalize(join(PUBLIC_DIR, pathname));
        if (!filePath.startsWith(PUBLIC_DIR)) {
            res.writeHead(403, { "Content-Type": "text/plain" });
            res.end("Forbidden");
            return;
        }
        const data = await readFile(filePath);
        res.writeHead(200, {
            "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
            "Cache-Control": "no-store",
        });
        res.end(data);
    }
    catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    }
});
const wss = new WebSocketServer({ server, path: "/ws" });
// heartbeat: terminate sockets that don't answer pings
const aliveSockets = new Set();
wss.on("connection", (ws) => {
    aliveSockets.add(ws);
    ws.on("pong", () => aliveSockets.add(ws));
    ws.on("error", () => ws.terminate());
    attachSocket(ws);
    ws.on("close", () => {
        aliveSockets.delete(ws);
        onSocketClose(ws);
    });
});
const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
        if (aliveSockets.has(ws)) {
            aliveSockets.delete(ws);
            ws.ping();
        }
        else {
            ws.terminate();
        }
    }
}, 30_000);
server.listen(PORT, HOST, () => {
    const host = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log("\n  ✦ LIVE ROOM — a conversation that is alive");
    console.log(`  → http://${host}:${PORT}`);
    console.log(`  → ws://${host}:${PORT}/ws\n`);
    startEnergyTicks();
    startMetaTicks();
    startCapsuleTicks();
    startPresenceTicks();
});
function shutdown() {
    console.log("\nShutting down...");
    clearInterval(heartbeat);
    for (const ws of wss.clients)
        ws.terminate();
    wss.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
//# sourceMappingURL=index.js.map