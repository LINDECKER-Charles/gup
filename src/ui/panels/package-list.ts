import type { OutdatedPackage, ProviderScanResult } from "../../core/types.js";
import type { SelectedPackage } from "../select.js";

export type PackageRow =
  | { readonly kind: "group"; readonly providerId: string; readonly title: string }
  | { readonly kind: "package"; readonly providerId: string; readonly pkg: OutdatedPackage }
  | {
      readonly kind: "failure";
      readonly providerId: string;
      readonly title: string;
      readonly error: string;
    };

interface Group {
  readonly providerId: string;
  readonly title: string;
  readonly packages: readonly OutdatedPackage[];
  readonly error?: string;
}

/**
 * The outdated packages of a scan, grouped by provider, with a cursor, a
 * text filter and a set of checked packages.
 *
 * Checked packages survive filtering: narrowing the list to find one more
 * package never loses what was already picked. Toggling a group or "all"
 * only acts on what the filter currently shows.
 */
export class PackageList {
  readonly #groups: readonly Group[];
  readonly #checked = new Set<string>();
  #filter = "";
  #cursor = 0;

  constructor(scans: readonly ProviderScanResult[], nameOf: (providerId: string) => string) {
    this.#groups = [...scans]
      .filter((scan) => scan.packages.length > 0 || scan.error)
      .sort((a, b) => nameOf(a.providerId).localeCompare(nameOf(b.providerId)))
      .map((scan) => ({
        providerId: scan.providerId,
        title: nameOf(scan.providerId),
        packages: scan.packages,
        ...(scan.error && { error: scan.error }),
      }));
  }

  get rows(): PackageRow[] {
    return this.#groups.flatMap((group) => this.groupRows(group));
  }

  get cursor(): number {
    return this.#cursor;
  }

  get filter(): string {
    return this.#filter;
  }

  /** Every package, filter or not. */
  get total(): number {
    return this.#groups.reduce((n, g) => n + g.packages.length, 0);
  }

  /** Checked packages in display order, including those the filter hides. */
  get selection(): SelectedPackage[] {
    return this.#groups.flatMap((g) =>
      g.packages
        .filter((pkg) => this.#checked.has(keyOf(g.providerId, pkg)))
        .map((pkg) => ({ providerId: g.providerId, pkg })),
    );
  }

  /** What Enter acts on when nothing is checked: the package or group under the cursor. */
  get underCursor(): SelectedPackage[] {
    const row = this.rows[this.#cursor];
    if (row?.kind === "package") return [{ providerId: row.providerId, pkg: row.pkg }];
    if (row?.kind !== "group") return [];
    return this.visiblePackages(row.providerId).map((pkg) => ({ providerId: row.providerId, pkg }));
  }

  setFilter(text: string): void {
    this.#filter = text;
    this.#cursor = 0;
  }

  move(delta: number): void {
    this.moveTo(this.#cursor + delta);
  }

  moveTo(index: number): void {
    this.#cursor = Math.max(0, Math.min(index, this.rows.length - 1));
  }

  isChecked(providerId: string, pkg: OutdatedPackage): boolean {
    return this.#checked.has(keyOf(providerId, pkg));
  }

  /** Checked / visible package counts of one provider. */
  groupState(providerId: string): { checked: number; total: number } {
    const visible = this.visiblePackages(providerId);
    const checked = visible.filter((pkg) => this.isChecked(providerId, pkg)).length;
    return { checked, total: visible.length };
  }

  /** A package flips; a group header checks all of its visible packages, or clears them. */
  toggleCurrent(): void {
    const row = this.rows[this.#cursor];
    if (row?.kind === "package") this.flip(keyOf(row.providerId, row.pkg));
    else if (row?.kind === "group") this.setAll([row.providerId]);
  }

  /** Check every visible package, or clear them all when they already are. */
  toggleAllVisible(): void {
    this.setAll(this.#groups.map((g) => g.providerId));
  }

  private setAll(providerIds: readonly string[]): void {
    const keys = providerIds.flatMap((id) => this.visiblePackages(id).map((pkg) => keyOf(id, pkg)));
    const isEveryChecked = keys.every((key) => this.#checked.has(key));
    for (const key of keys) {
      if (isEveryChecked) this.#checked.delete(key);
      else this.#checked.add(key);
    }
  }

  private flip(key: string): void {
    if (this.#checked.has(key)) this.#checked.delete(key);
    else this.#checked.add(key);
  }

  private visiblePackages(providerId: string): readonly OutdatedPackage[] {
    const group = this.#groups.find((g) => g.providerId === providerId);
    if (!group) return [];
    return this.matchesGroup(group)
      ? group.packages
      : group.packages.filter((p) => this.matches(p));
  }

  private groupRows(group: Group): PackageRow[] {
    const packages = this.visiblePackages(group.providerId);
    const { providerId, title } = group;
    if (group.error && (this.matchesGroup(group) || !this.#filter)) {
      return [{ kind: "failure", providerId, title, error: group.error }];
    }
    if (packages.length === 0) return [];
    return [
      { kind: "group", providerId, title },
      ...packages.map((pkg): PackageRow => ({ kind: "package", providerId, pkg })),
    ];
  }

  private matchesGroup(group: Group): boolean {
    const needle = this.#filter.toLowerCase();
    return !needle || `${group.title} ${group.providerId}`.toLowerCase().includes(needle);
  }

  private matches(pkg: OutdatedPackage): boolean {
    return `${pkg.name ?? ""} ${pkg.id}`.toLowerCase().includes(this.#filter.toLowerCase());
  }
}

function keyOf(providerId: string, pkg: OutdatedPackage): string {
  return `${providerId}:${pkg.id}`;
}
