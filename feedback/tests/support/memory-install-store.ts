import type {
  InstallStore, StoreBatchCommand, StoreBatchOutcome,
} from "../../src/ports/install-store.js";

/** Creation on the first non-empty batch and per-install deduplication, as Postgres does them. */
export class MemoryInstallStore implements InstallStore {
  /** Install ID → hashes of its stored items. */
  readonly installs = new Map<string, Set<string>>();

  async storeBatch(command: StoreBatchCommand): Promise<StoreBatchOutcome> {
    const { installId, batch } = command;
    const known = this.installs.get(installId);
    const isEmpty = batch.history.length === 0 && batch.logs.length === 0;
    if (known === undefined && isEmpty) {
      return { kind: "stored", accepted: { history: 0, logs: 0 }, isNewInstall: false };
    }
    if (known === undefined && !command.mayCreateInstall) return { kind: "creation_refused" };
    const hashes = known ?? new Set<string>();
    this.installs.set(installId, hashes);
    const isNew = (item: { hash: string }) => {
      if (hashes.has(item.hash)) return false;
      hashes.add(item.hash);
      return true;
    };
    const accepted = {
      history: batch.history.filter(isNew).length,
      logs: batch.logs.filter(isNew).length,
    };
    return { kind: "stored", accepted, isNewInstall: known === undefined };
  }

  async remove(installId: string): Promise<void> {
    this.installs.delete(installId);
  }
}
