const ts = require("typescript");
const fs = require("fs");

for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const errs = (sf.parseDiagnostics || []).map((d) => {
    const pos = sf.getLineAndCharacterOfPosition(d.start);
    return `${d.messageText} @ ${pos.line + 1}:${pos.character + 1}`;
  });
  console.log(f, errs.length ? errs.slice(0, 8) : "OK");
}