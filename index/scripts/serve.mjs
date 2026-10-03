/**
 * Serves dist/ under the base path the way GitHub Pages does: directory URLs
 * resolve to their index.html, unknown paths get dist/404.html with a 404
 * status, text is gzipped and everything carries Pages' ten-minute cache
 * lifetime — so the Lighthouse audit measures what visitors get. Used by the
 * verify suite and the audit; runnable on its own
 * (`node scripts/serve.mjs [port]`) to preview a build.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createGzip } from "node:zlib";
import { LINKS } from "../src/data/links.js";

const DIST = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const DEFAULT_PORT = 4178;
const PAGES_CACHE_CONTROL = "max-age=600";
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/;
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
  const body = file ?? join(DIST, "404.html");
  const type = MIME[extname(body)] ?? "application/octet-stream";
  const acceptsGzip = /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
  const isGzipped = acceptsGzip && COMPRESSIBLE.test(type);
  response.writeHead(file ? 200 : 404, {
    "content-type": type,
    "cache-control": PAGES_CACHE_CONTROL,
    vary: "Accept-Encoding",
    ...(isGzipped ? { "content-encoding": "gzip" } : {}),
  });
  const stream = createReadStream(body);
  (isGzipped ? stream.pipe(createGzip()) : stream).pipe(response);
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
