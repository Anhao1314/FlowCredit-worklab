// Standalone read-only design preview. Product hosting uses a separate explicit asset allowlist.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.SWARM_SPACE_PORT || 8123);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("INVALID_PORT");

/** Explicit allowlist: no directory traversal, no dotfiles, no fallthrough. */
const FILES = new Map([
  ["/organization-story.js", ["organization-story.js", "text/javascript"]],
  ["/organization-scene.js", ["organization-scene.js", "text/javascript"]],
  ["/office-scene.js", ["office-scene.js", "text/javascript"]],
  ["/vendor/munder-difflin/portrait-art.js", ["vendor/munder-difflin/portrait-art.js", "text/javascript"]],
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/swarm-space.css", ["swarm-space.css", "text/css"]],
  ["/main.js", ["main.js", "text/javascript"]],
  ["/scene.js", ["scene.js", "text/javascript"]],
  ["/fixtures.js", ["fixtures.js", "text/javascript"]],
  ["/assets.js", ["assets.js", "text/javascript"]],
  ["/game-loop.js", ["game-loop.js", "text/javascript"]],
]);

const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const entry = req.method === "GET" ? FILES.get(req.url.split("?")[0]) : null;
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": entry[1] + "; charset=utf-8" });
  res.end(await readFile(join(here, entry[0])));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Swarm Space V0.6 (mock state only): http://127.0.0.1:${port}/`);
  console.log("Review aid: add ?scene=STAND_DOWN to the URL. Nothing else is served.");
});
