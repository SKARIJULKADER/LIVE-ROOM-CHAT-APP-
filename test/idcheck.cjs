// Cross-checks: every $("#id") referenced in client JS exists in index.html
const fs = require("fs");
const path = require("path");

const pub = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

let missing = [];
for (const f of fs.readdirSync(path.join(pub, "js"))) {
  const src = fs.readFileSync(path.join(pub, "js", f), "utf8");
  for (const m of src.matchAll(/\$\("#([a-zA-Z0-9_-]+)"\)/g)) {
    if (!ids.has(m[1])) missing.push(`${f}: #${m[1]}`);
  }
}
console.log(missing.length ? "MISSING IDS:\n" + missing.join("\n") : "ALL REFERENCED IDS EXIST");
