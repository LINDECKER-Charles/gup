import { run } from "../../core/runner.js";
import { canonicalName } from "./canonical-name.js";
import { pythonBehind } from "./python-behind.js";
import { SYSTEM_SITE_PROBE } from "./system-site-probe.js";

/** A run of `pip install` over the packages of one site. */
interface SiteBatch<T> {
  /** `--user`, or nothing for the interpreter's own site-packages. */
  readonly scope: readonly string[];
  readonly packages: readonly T[];
}

const USER_SCOPE = "--user";

/**
 * The sites the pip provider upgrades, and the `pip install` scope that keeps
 * each package in the one it lives in.
 *
 * The user site always. The interpreter's own site-packages too, when it is
 * the user's to write (`system-site-probe.ts`): a Python installed in a
 * folder of theirs — python.org "for me only", a custom folder, pyenv. Scoped
 * to `--user`, gup never listed what pip had put there (73 of 75 outdated
 * packages on one machine), so a pin held by a package there — an
 * `opentelemetry-proto` capping protobuf — could never be lifted by
 * upgrading it.
 *
 * A package found in both sites is the user site's: it is the copy Python
 * imports, and `pip install` without `--user` would uninstall it to write
 * over the other one.
 */
export class PipSites {
  private constructor(
    private readonly userNames: ReadonlySet<string>,
    /** Null while the interpreter's own site-packages is left alone. */
    private readonly systemNames: ReadonlySet<string> | null,
  ) {}

  /** What `pip` (or `pip3`) on PATH may upgrade, read from its interpreter and pip itself. */
  static async read(pip: string): Promise<PipSites> {
    const folders = await ownedSystemFolders(pip);
    if (folders.length === 0) return new PipSites(new Set(), null);
    const systemScope = folders.flatMap((folder) => ["--path", folder]);
    const [user, system] = await Promise.all([
      installedNames(pip, [USER_SCOPE]),
      installedNames(pip, systemScope),
    ]);
    return new PipSites(user, system);
  }

  /** The scope of `pip list --outdated`: the user site, or every site, sorted out by `holds`. */
  listScope(): readonly string[] {
    return this.systemNames ? [] : [USER_SCOPE];
  }

  /** True when the package lives in a site gup upgrades. */
  holds(packageId: string): boolean {
    if (!this.systemNames) return true;
    const name = canonicalName(packageId);
    return this.userNames.has(name) || this.systemNames.has(name);
  }

  /** The `pip install` scope that keeps the package in its site. */
  scopeOf(packageId: string): readonly string[] {
    return this.isSystem(packageId) ? [] : [USER_SCOPE];
  }

  /** `packages` split by site, each batch in their order: one `pip install` per site. */
  batches<T extends { readonly id: string }>(packages: readonly T[]): SiteBatch<T>[] {
    const batches: SiteBatch<T>[] = [
      { scope: [USER_SCOPE], packages: packages.filter((p) => !this.isSystem(p.id)) },
      { scope: [], packages: packages.filter((p) => this.isSystem(p.id)) },
    ];
    return batches.filter((batch) => batch.packages.length > 0);
  }

  private isSystem(packageId: string): boolean {
    const name = canonicalName(packageId);
    return this.systemNames?.has(name) === true && !this.userNames.has(name);
  }
}

/** The site-packages folders of pip's interpreter that gup may write; none when unsure. */
async function ownedSystemFolders(pip: string): Promise<string[]> {
  const python = await pythonBehind(pip);
  if (!python) return [];
  const { stdout, failed } = await run(python, ["-I", "-c", SYSTEM_SITE_PROBE]);
  if (failed) return [];
  const folders = parseJson(stdout);
  return Array.isArray(folders) && folders.every((f) => typeof f === "string") ? folders : [];
}

/** The canonical names `pip list` reports within `scope`. */
async function installedNames(pip: string, scope: readonly string[]): Promise<Set<string>> {
  const { stdout } = await run(pip, [
    "list",
    ...scope,
    "--format=json",
    "--disable-pip-version-check",
  ]);
  const rows = parseJson(stdout);
  if (!Array.isArray(rows)) return new Set();
  return new Set(rows.flatMap((row) => (hasName(row) ? [canonicalName(row.name)] : [])));
}

function hasName(row: unknown): row is { readonly name: string } {
  return typeof row === "object" && row !== null && typeof Reflect.get(row, "name") === "string";
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
