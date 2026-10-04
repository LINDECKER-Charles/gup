/**
 * Dev-server plugin: serves every locale from the same index.html, with the
 * head, <html lang dir> and bootstrap the prerender would write, so
 * `npm run dev` shows /gup/fr/ in French with the real head.
 *
 * Page contexts and the renderer load through Vite's SSR module graph, so an
 * edited catalog is re-evaluated on the next request; editing one also
 * triggers a full reload (catalogs are not part of the client graph, so HMR
 * would otherwise never notice). Build output is produced by
 * scripts/prerender.mjs instead — this plugin only applies to `serve`.
 */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { lastContentChange } from "../scripts/last-change.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTENT_DIRS = ["/src/i18n/catalogs/", "/build/"];

/** True for files whose edits change the rendered head or messages. */
const isContentFile = (file) =>
  CONTENT_DIRS.some((dir) => file.replaceAll("\\", "/").includes(dir));

/** The page whose locale path is the first URL segment under the base path. */
function pageForPath(pages, basePath, url) {
  const path = url.split(/[?#]/)[0] ?? "";
  const [segment] = path.slice(basePath.length).split("/");
  const fallback = pages.find((page) => page.locale.isDefault);
  return pages.find((page) => page.locale.path === segment) ?? fallback;
}

async function renderForUrl(html, ctx) {
  const { server } = ctx;
  const { pageContexts } = await server.ssrLoadModule("/build/page-context.mjs");
  const { renderPage } = await server.ssrLoadModule("/build/html/render-page.mjs");
  const pages = pageContexts({ modified: lastContentChange(ROOT) });
  const page = pageForPath(pages, server.config.base, ctx.originalUrl ?? ctx.path);
  return renderPage({ template: html, page, appHtml: "" });
}

export function localeHtml() {
  return {
    name: "gup-locale-html",
    apply: "serve",
    transformIndexHtml: { order: "pre", handler: renderForUrl },
    hotUpdate({ file, server }) {
      if (this.environment.name !== "client" || !isContentFile(file)) return undefined;
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
