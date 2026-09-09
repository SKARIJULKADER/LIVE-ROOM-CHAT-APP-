const fs = require("fs");

function scan(f) {
  let s = fs.readFileSync(f, "utf8");
  let depth = 0, line = 1, i = 0, last = 0;
  while (i < s.length) {
    const ch = s[i];
    const nx = s[i + 1];
    if (ch === "\n") line++;
    if (ch === "/" && nx === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (ch === "/" && nx === "*") { while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { if (s[i] === "\n") line++; i++; } i += 2; continue; }
    if (ch === "'") { i++; while (i < s.length && s[i] !== "'") { if (s[i] === "\\") i++; if (s[i] === "\n") line++; i++; } i++; continue; }
    if (ch === '"') { i++; while (i < s.length && s[i] !== '"') { if (s[i] === "\\") i++; if (s[i] === "\n") line++; i++; } i++; continue; }
    if (ch === "`") { i++; while (i < s.length) { if (s[i] === "\\") { i += 2; continue; } if (s[i] === "`") { i++; break; } if (s[i] === "\n") line++; i++; } continue; }
    if (ch === "{") { depth++; last = line; }
    if (ch === "}") depth--;
    i++;
  }
  console.log(f, "final depth", depth, "last open at line", last);
}

for (const f of process.argv.slice(2)) scan(f);