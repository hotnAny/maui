import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "../lib/agent/manifest";
import { renderReadme } from "../lib/agent/readme";

// Emits the documentation artifact of every agent manifest (compile rules R6/R7).
// `--check` is static check 10: fail rather than write, so CI cannot ship a README that
// describes the previous design.

const check = process.argv.includes("--check");
const agentsDir = join(process.cwd(), "agents");
const agentIds = readdirSync(agentsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(agentsDir, entry.name, "manifest.yaml")))
  .map((entry) => entry.name);

let stale = 0;
for (const agentId of agentIds) {
  const path = join(agentsDir, agentId, "README.md");
  const readme = renderReadme(loadManifest(agentId));
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;

  if (current === readme) {
    console.log(`  ok       ${agentId}/README.md`);
  } else if (check) {
    stale += 1;
    console.error(`  stale    ${agentId}/README.md`);
  } else {
    writeFileSync(path, readme);
    console.log(`  ${current === null ? "created " : "updated "} ${agentId}/README.md`);
  }
}

if (stale) {
  console.error(`\n${stale} README(s) out of date. Run \`npm run compile:agents\` and commit the result.`);
  process.exit(1);
}
