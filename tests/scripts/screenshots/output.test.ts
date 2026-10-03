import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOrphans } from "../../../scripts/screenshots/output/find-orphans.js";
import { renderGallery } from "../../../scripts/screenshots/output/render-gallery.js";
import { syncFile } from "../../../scripts/screenshots/output/sync-file.js";
import type { Scene } from "../../../scripts/screenshots/scenes/scene.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-screens-output-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("syncFile", () => {
  it("counts a CRLF checkout of the same content as unchanged, and leaves it alone", async () => {
    const path = join(dir, "a.svg");
    await writeFile(path, "<svg>\r\n</svg>\r\n");
    await expect(syncFile(path, "<svg>\n</svg>\n", "check")).resolves.toEqual({ path, status: "unchanged" });
    await expect(syncFile(path, "<svg>\n</svg>\n", "write")).resolves.toEqual({ path, status: "unchanged" });
    expect(await readFile(path, "utf8")).toBe("<svg>\r\n</svg>\r\n");
  });

  it("reports a stale or missing file in check mode without writing anything", async () => {
    const stale = join(dir, "stale.svg");
    const missing = join(dir, "screens", "missing.svg");
    await writeFile(stale, "old\n");
    await expect(syncFile(stale, "new\n", "check")).resolves.toEqual({ path: stale, status: "stale" });
    await expect(syncFile(missing, "new\n", "check")).resolves.toEqual({ path: missing, status: "missing" });
    expect(await readFile(stale, "utf8")).toBe("old\n");
    await expect(readFile(missing, "utf8")).rejects.toThrow();
  });

  it("writes what differs in write mode, creating the directory", async () => {
    const path = join(dir, "screens", "new.svg");
    await expect(syncFile(path, "<svg/>\n", "write")).resolves.toEqual({ path, status: "written" });
    expect(await readFile(path, "utf8")).toBe("<svg/>\n");
  });
});

describe("findOrphans", () => {
  it("lists the SVGs no scene produces, and nothing for a directory not created yet", async () => {
    await Promise.all(
      ["kept.svg", "gone.svg", "older.svg", "README.md"].map((name) => writeFile(join(dir, name), "")),
    );
    await expect(findOrphans(dir, ["kept"])).resolves.toEqual([join(dir, "gone.svg"), join(dir, "older.svg")]);
    await expect(findOrphans(join(dir, "absent"), ["kept"])).resolves.toEqual([]);
  });
});

describe("renderGallery", () => {
  it("keeps a title or an alt text from breaking out of its markup", () => {
    const scene: Scene = {
      id: "tricky",
      title: "gup — *Paquets*",
      alt: "Rows [x] checked,\n\nthen ] and <b>",
      size: { cols: 100, rows: 28 },
      fixture: () => {
        throw new Error("the gallery never mounts a scene");
      },
      play: async () => {},
    };
    const page = renderGallery([scene]);
    expect(page).toContain("**gup — \\*Paquets\\*** · 100 × 28");
    expect(page).toContain("![Rows \\[x\\] checked, then \\] and \\<b\\>](tricky.svg)");
  });
});
