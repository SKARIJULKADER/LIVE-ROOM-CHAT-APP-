const fs = require("node:fs");
const app = fs.readFileSync("/Users/arij/WEB_DEVELOPMENT/CHAT APP_WEBSOCKETS/public/js/app.js", "utf8");

// Proper scanner: tracks braces/parens/brackets while skipping strings,
// comments and template literals (including nested ${} interpolation).
function scan(src) {
  const depth = []; // stack of { line, type }
  const stack = []; // types: '{', '(', '['
  let i = 0, line = 1;
  const n = src.length;

  function err(msg) {
    console.log(`ERROR near line ${line}: ${msg} | unclosed: ${depth.slice(-6).map((d) => d.type + "@" + d.line).join(" ")}`);
    process.exit(1);
  }

  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "\n") { line++; i++; continue; }
    // skip whitespace
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }
    if (ch === "/" && nx === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (ch === "/" && nx === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (ch === "'") { i++; while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === "'") { i++; break; } if (src[i] === "\n") line++; i++; } continue; }
    if (ch === '"') { i++; while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === '"') { i++; break; } if (src[i] === "\n") line++; i++; } continue; }
    if (ch === "`") {
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "`") { i++; break; }
        if (src[i] === "$" && src[i + 1] === "{") {
          // enter interpolation: nested code until matching '}'
          i += 2;
          // recursively handle the interpolation content using a mini stack
          let sub = "";
          let j = i;
          // find the matching close brace respecting nesting
          let b = 1;
          while (j < n && b > 0) {
            if (src[j] === "{") b++;
            if (src[j] === "}") b--;
            if (src[j] === "\n") line++;
            j++;
          }
          // we overshoot; simple approach: skip to the matching '}' without full parsing
          i = j; // position after '}'
          continue;
        }
        if (src[i] === "\n") line++;
        i++;
      }
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth.push({ type: ch, line });
      stack.push(ch);
      i++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      if (stack.length === 0) err(`unexpected ${ch}`);
      const open = stack.pop();
      depth.pop();
      const match = open === "{" ? "}" : open === "(" ? ")" : "]";
      if (match !== ch) err(`mismatch ${open} vs ${ch}`);
      i++;
      continue;
    }
    i++;
  }
  console.log("unclosed count:", depth.length);
  depth.forEach((d) => console.log("  unclosed", d.type, "opened line", d.line));
}

scan(app);