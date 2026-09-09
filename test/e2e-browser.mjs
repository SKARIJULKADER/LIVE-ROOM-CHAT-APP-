// CLI wrapper: node test/e2e-browser.mjs [port]
// Verifies the exact user flow in a real browser: join -> type -> send -> bubble visible.
import { runE2E } from "./e2e-core.mjs";

const PORT = process.argv[2] ?? process.env.PORT ?? "8090";
const { pass, result, problems } = await runE2E(`http://localhost:${PORT}`);

console.log("\n===== E2E RESULT =====");
console.log(JSON.stringify(result, null, 2));
console.log("console/JS problems captured:", problems.length);
for (const p of problems.slice(0, 20)) console.log("  -", p.kind, "::", String(p.text).slice(0, 300));
console.log(pass ? "\n✅ E2E PASS — sent messages appear in the feed" : "\n❌ E2E FAIL — message not visible or flow broken");
process.exit(pass ? 0 : 1);
