import type {
  OutdatedPackage,
  ProviderScanResult,
  SelectedPackage,
} from "../../core/types.js";
import { isUpdatableNow } from "../../core/self-update.js";
import type { PackageSort } from "../app/ui-preferences.js";
import { orderPackages } from "./package-order.js";

export type PackageRow =
  | { readonly kind: "group"; readonly providerId: string; readonly title: string }
  | { readonly kind: "package"; readonly providerId: string; readonly pkg: OutdatedPackage }
  | {
      readonly kind: "failure";
      readonly providerId: string;
      readonly title: string;
      readonly error: string;
    };

export interface PackageListOptions {
  /**
   * Package order inside each provider (default: as scanned). Read on every
   * use, so a preference changed while the list is on screen applies at once.
   */
  readonly sort?: () => PackageSort;
}

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
 * The checked set is the only selection: nothing acts on the row under the
 * cursor. Checked packages survive filtering — narrowing the list to find one
 * more package never loses what was already picked. Toggling a group or "all"
 * only acts on what the filter currently shows. A package gup can only update
 * once it has exited (gup itself on Windows) is listed, never checked.
 */
export class PackageList {
  readonly #scanned: readonly Group[];
  readonly #sortOf: () => PackageSort;
  #ordered: { readonly sort: PackageSort; readonly groups: readonly Group[] } | null = null;
  readonly #checked = new Set<string>();
  #filter = "";
  #cursor = 0;

  constructor(
    scans: readonly ProviderScanResult[],
    nameOf: (providerId: string) => string,
    options: PackageListOptions = {},
  ) {
    this.#sortOf = options.sort ?? (() => "provider");
    this.#scanned = [...scans]
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
    return this.groups().flatMap((group) => this.groupRows(group));
  }

  get cursor(): number {
    return this.#cursor;
  }

  get filter(): string {
    return this.#filter;
  }

  /** The longest name, and current or latest version, of every package, filter or not. */
  get longest(): { readonly name: number; readonly version: number } {
    let name = 0;
    let version = 0;
    for (const pkg of this.#scanned.flatMap((group) => group.packages)) {
      name = Math.max(name, (pkg.name ?? pkg.id).length);
      version = Math.max(version, pkg.current.length, pkg.latest.length);
    }
    return { name, version };
  }

  /** Every package, filter or not. */
  get total(): number {
    return this.groups().reduce((n, g) => n + g.packages.length, 0);
  }

  /** Checked packages in display order, including those the filter hides. */
  get selection(): SelectedPackage[] {
    return this.groups().flatMap((g) =>
      g.packages
        .filter((pkg) => this.#checked.has(keyOf(g.providerId, pkg)))
        .map((pkg) => ({ providerId: g.providerId, pkg })),
    );
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

  /** Checked / visible checkable package counts of one provider. */
  groupState(providerId: string): { checked: number; total: number } {
    const visible = this.visiblePackages(providerId).filter(isUpdatableNow);
    const checked = visible.filter((pkg) => this.isChecked(providerId, pkg)).length;
    return { checked, total: visible.length };
  }

  /** A package flips; a group header checks all of its visible packages, or clears them. */
  toggleCurrent(): void {
    const row = this.rows[this.#cursor];
    if (row?.kind === "group") this.setAll([row.providerId]);
    else if (row?.kind === "package" && isUpdatableNow(row.pkg)) {
      this.flip(keyOf(row.providerId, row.pkg));
    }
  }

  /** Check every visible package, or clear them all when they already are. */
  toggleAllVisible(): void {
    this.setAll(this.groups().map((g) => g.providerId));
  }

  /**
   * True when the filter shows packages and every one of them is checked:
   * `a` then clears them. Checked packages the filter hides do not count.
   */
  isAllVisibleChecked(): boolean {
    const keys = this.visibleKeys(this.groups().map((g) => g.providerId));
    return keys.length > 0 && this.areChecked(keys);
  }

  private setAll(providerIds: readonly string[]): void {
    const keys = this.visibleKeys(providerIds);
    const isEveryChecked = this.areChecked(keys);
    for (const key of keys) {
      if (isEveryChecked) this.#checked.delete(key);
      else this.#checked.add(key);
    }
  }

  private visibleKeys(providerIds: readonly string[]): string[] {
    return providerIds.flatMap((id) =>
      this.visiblePackages(id)
        .filter(isUpdatableNow)
        .map((pkg) => keyOf(id, pkg)),
    );
  }

  private areChecked(keys: readonly string[]): boolean {
    return keys.every((key) => this.#checked.has(key));
  }

  private flip(key: string): void {
    if (this.#checked.has(key)) this.#checked.delete(key);
    else this.#checked.add(key);
  }

  /** The groups, packages in the preferred order — re-ordered only when the order changes. */
  private groups(): readonly Group[] {
    const sort = this.#sortOf();
    const cached = this.#ordered;
    if (cached?.sort === sort) return cached.groups;
    const groups = this.#scanned.map((group) => ({
      ...group,
      packages: orderPackages(group.packages, sort),
    }));
    this.#ordered = { sort, groups };
    return groups;
  }

  private visiblePackages(providerId: string): readonly OutdatedPackage[] {
    const group = this.groups().find((g) => g.providerId === providerId);
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
