/**
 * Serves dist/ under the base path exactly as GitHub Pages does: directory
 * URLs resolve to their index.html, unknown paths get dist/404.html with a
 * 404 status. Used by the verify suite and the Lighthouse audit; runnable on
 * its own (`node scripts/serve.mjs [port]`) to preview a build.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, resolve, sep } from "node:path";
import { LINKS } from "../src/data/links.js";

const DIST = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const DEFAULT_PORT = 4178;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true;

/** The file a URL path maps to inside dist/, or null (outside the base, traversal, missing). */
function fileFor(pathname) {
  if (!pathname.startsWith(LINKS.basePath)) return null;
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(LINKS.basePath.length));
  } catch {
    return null;
  }
  if (relative === "" || relative.endsWith("/")) relative += "index.html";
  const target = normalize(join(DIST, relative));
  if (!target.startsWith(DIST + sep)) return null;
  return isFile(target) ? target : null;
}

function respond(request, response) {
  const file = fileFor(new URL(request.url, "http://localhost").pathname);
  const status = file ? 200 : 404;
  const body = file ?? join(DIST, "404.html");
  response.writeHead(status, { "content-type": MIME[extname(body)] ?? "application/octet-stream" });
  createReadStream(body).pipe(response);
}

/**
 * @param {{ port?: number }} [options]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serveDist({ port = DEFAULT_PORT } = {}) {
  const server = createServer(respond);
  return new Promise((resolveStart) => {
    server.listen(port, "127.0.0.1", () =>
      resolveStart({
        url: `http://localhost:${port}${LINKS.basePath}`,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await serveDist({ port: Number(process.argv[2]) || DEFAULT_PORT });
  process.stdout.write(`serving dist/ at ${url}\n`);
}
