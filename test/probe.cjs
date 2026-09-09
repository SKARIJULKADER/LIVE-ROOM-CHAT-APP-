const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");

const app = fs.readFileSync("/Users/arij/WEB_DEVELOPMENT/CHAT APP_WEBSOCKETS/public/js/app.js", "utf8");
const lines = app.split("\n");

const cases = {
  "head288+exportConst": lines.slice(0, 288).join("\n") + "\nexport const X = 1;\n",
  "head288+exportFn": lines.slice(0, 288).join("\n") + "\nexport function renderXpPill() {\n  const s = 1;\n}\n",
  "fullFile": app,
  "replace289explicit": lines
    .map((l, i) => (i === 288 ? "export const X = 1;" : l))
    .join("\n"),
};

for (const [name, src] of Object.entries(cases)) {
  fs.writeFileSync("/tmp/probe_" + name + ".mjs", src);
  const r = spawnSync(process.execPath, ["--check", "/tmp/probe_" + name + ".mjs"], {
    encoding: "utf8",
  });
  console.log("=== " + name + " exit=" + r.status);
  if (r.stderr.trim()) console.log(r.stderr.trim().split("\n").slice(0, 4).join("\n"));
}