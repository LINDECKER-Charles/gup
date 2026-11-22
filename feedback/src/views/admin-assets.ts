import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ADMIN_UI } from "./admin-ui.js";

/** Resolves the same from src/ (tsx, vitest) and dist/ (tsc keeps the depth). */
const DIRECTORY = new URL("../../assets/", import.meta.url);
const VERSION_LENGTH = 12;
const STYLESHEET_NAME = "app.css";

/** In cascade order: each sheet builds on the ones before it. */
const STYLE_SHEETS = [
  "fonts", "tokens", "base", "frame", "controls", "lists", "detail", "tables",
] as const;

/** The landing's faces and icons (index/static), copied: the image builds from feedback/. */
const FILES = {
  "anton.woff2": "font/woff2",
  "geist.woff2": "font/woff2",
  "geist-mono.woff2": "font/woff2",
  "logo-64.png": "image/png",
  "favicon.ico": "image/x-icon",
  "favicon-96.png": "image/png",
  "apple-touch-icon.png": "image/png",
} as const satisfies Record<string, string>;

export type AdminAssetName = keyof typeof FILES | typeof STYLESHEET_NAME;

export interface AdminAsset {
  readonly body: Buffer | string;
  readonly contentType: string;
  /** Carries the content's hash: cacheable for good, changed by any edit. */
  readonly href: string;
}

function asset(name: string, body: Buffer | string, contentType: string): AdminAsset {
  const version = createHash("sha256").update(body).digest("hex").slice(0, VERSION_LENGTH);
  return { body, contentType, href: `${ADMIN_UI.assetsPath}/${name}?v=${version}` };
}

function loadFiles(): Map<string, AdminAsset> {
  return new Map(Object.entries(FILES).map(([name, contentType]) =>
    [name, asset(name, readFileSync(new URL(name, DIRECTORY)), contentType)]));
}

/** The sheets joined in order, each `url("<file>")` pointed at that file's versioned URL. */
function stylesheet(files: ReadonlyMap<string, AdminAsset>): AdminAsset {
  let css = STYLE_SHEETS
    .map((sheet) => readFileSync(new URL(`styles/${sheet}.css`, DIRECTORY), "utf8"))
    .join("\n");
  for (const [name, file] of files) css = css.replaceAll(`url("${name}")`, `url("${file.href}")`);
  return asset(STYLESHEET_NAME, css, "text/css; charset=utf-8");
}

const FILE_ASSETS = loadFiles();

/** Everything `/admin/assets/:name` serves, read once at start-up. */
export const ADMIN_ASSETS: ReadonlyMap<string, AdminAsset> = new Map([
  ...FILE_ASSETS,
  [STYLESHEET_NAME, stylesheet(FILE_ASSETS)],
]);

/** The versioned URL a page links to. */
export function assetHref(name: AdminAssetName): string {
  const found = ADMIN_ASSETS.get(name);
  if (found === undefined) throw new Error(`Unknown back-office asset: ${name}`);
  return found.href;
}
