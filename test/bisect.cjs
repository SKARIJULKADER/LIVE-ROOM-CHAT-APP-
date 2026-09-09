const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const app = fs.readFileSync("/Users/arij/WEB_DEVELOPMENT/CHAT APP_WEBSOCKETS/public/js/app.js", "utf8");
const lines = app.split("\n");

function parsesUpTo(n) {
  const src = lines.slice(0, n).join("\n") + "\n}\nexport const X = 1;\n";
  fs.writeFileSync("/tmp/bisect.mjs", src);
  const r = spawnSync(process.execPath, ["--check", "/tmp/bisect.mjs"], { encoding: "utf8" });
  return r.status === 0;
}

// find the first failing poi
let lo = 1, hi = lines.length;
for (let i = 1; i <= 60; i++) {
  const ok = parsesUpTo(i * 8);
  console.log(`lines 1..${i * 8}: ${ok ? "OK" : "FAIL"}`);
}