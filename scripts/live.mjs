// Explicit manual live smoke entry. No credentials are accepted in environment or arguments.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
if (process.env.FLOWCREDIT_LIVE !== "1") {
  console.log(
    "Live inference is opt-in. Use FLOWCREDIT_LIVE=1 npm run test:live, then enter a key in the local Activation UI. No model request was made.",
  );
  process.exit(0);
}
console.log(
  "Live smoke: create E, activate, Resume E; inspect its tool event and independent Reviewer. At most six requests per runtime store. Stop with Control-C.",
);
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL("../apps/runtime/server.mjs", import.meta.url))],
  { stdio: "inherit", env: process.env },
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => (process.exitCode = code ?? 0));
