import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const environment = { ...process.env };

// The Codex host may inject its own OpenAI credential. Local development should use the
// project-specific value in .env.local; Next loads it once the inherited value is absent.
delete environment.OPENAI_API_KEY;

const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  env: environment,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
