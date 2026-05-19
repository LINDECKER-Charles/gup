import pLimit from "p-limit";
import { run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, UpdateOutcome } from "../../core/types.js";

/**
 * Shared scan/upgrade logic for VS Code and its forks (Cursor, Windsurf, ...).
 * All of them ship the same `<bin> --list-extensions --show-versions` and
 * `<bin> --install-extension <id> --force` interface and all consume the
 * Microsoft Marketplace gallery.
 *
 * VSCodium-style forks that consume Open VSX instead use the same CLI but
 * a different gallery â€” handled by passing a custom `fetchLatest`.
 */
export interface VsCodeLikeOptions {
  /** Binary in PATH (`code`, `cursor`, `windsurf`, `codium`). */
  binary: string;
  /** Per-extension version lookup. */
  fetchLatest: (extensionId: string) => Promise<string | null>;
  /** Parallel HTTP probes against the gallery. */
  concurrency?: number;
}

export async function scanVsCodeLikeExtensions(
  options: VsCodeLikeOptions,
): Promise<OutdatedPackage[]> {
  const { stdout, failed } = await run(options.binary, [
    "--list-extensions",
    "--show-versions",
  ]);
  if (failed) return [];

  const installed = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("@"))
    .map((l) => {
      const at = l.lastIndexOf("@");
      return { id: l.slice(0, at), current: l.slice(at + 1) };
    });
  if (installed.length === 0) return [];

  const limit = pLimit(options.concurrency ?? 8);
  const results = await Promise.all(
    installed.map((ext) =>
      limit(async (): Promise<OutdatedPackage | null> => {
        const latest = await options.fetchLatest(ext.id);
        if (!latest || latest === ext.current) return null;
        return { id: ext.id, name: ext.id, current: ext.current, latest };
      }),
    ),
  );
  return results.filter((r): r is OutdatedPackage => r !== null);
}

export async function updateVsCodeLikeExtension(
  binary: string,
  packageId: string,
): Promise<UpdateOutcome> {
  const res = await runInherit(binary, [
    "--install-extension",
    packageId,
    "--force",
  ]);
  return { id: packageId, success: !res.failed };
}

export async function fetchMicrosoftMarketplaceLatest(
  extensionId: string,
): Promise<string | null> {
  const body = {
    filters: [
      {
        criteria: [
          { filterType: 8, value: "Microsoft.VisualStudio.Code" },
          { filterType: 7, value: extensionId },
        ],
      },
    ],
    flags: 0x100,
  };
  try {
    const res = await fetch(
      "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
      {
        method: "POST",
        headers: {
          Accept: "application/json;api-version=3.0-preview.1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        extensions?: Array<{ versions?: Array<{ version?: string }> }>;
      }>;
    };
    return data.results?.[0]?.extensions?.[0]?.versions?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

export async function fetchOpenVsxLatest(
  extensionId: string,
): Promise<string | null> {
  // Open VSX uses publisher/name URL segments â€” extensionId is publisher.name.
  const idx = extensionId.indexOf(".");
  if (idx === -1) return null;
  const publisher = extensionId.slice(0, idx);
  const name = extensionId.slice(idx + 1);
  try {
    const res = await fetch(
      `https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}
