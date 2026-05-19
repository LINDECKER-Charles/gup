# Contributing

Thanks for considering a contribution. The most common contribution is adding a new **provider** — a small module that knows how to scan and update one package source.

## Add a new provider

A provider is a class implementing the `Provider` interface from `src/core/types.ts`. Each provider lives in its own file under `src/providers/<category>/` (e.g. `os/`, `node/`, `python/`, `cloud/`, `iac/`, `kubernetes/`, `security/`, `ide/`, ...). See `src/core/registry.ts` for the canonical list of categories.

### 1. Copy the template

```powershell
Copy-Item src/providers/_template.ts src/providers/<category>/<your-provider>.ts
```

### 2. Implement the four methods

```ts
class MyProvider implements Provider {
  readonly id = "my-tool";              // unique, kebab-case, stable
  readonly displayName = "My Tool";
  readonly installHint = "winget install MyTool";
  readonly slow = false;                // true if scan does HTTP per package

  async isAvailable(): Promise<boolean> { /* detect CLI / config dir */ }
  async listOutdated(): Promise<OutdatedPackage[]> { /* return what's behind */ }
  async update(id: string): Promise<UpdateOutcome> { /* upgrade one */ }
  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> { /* bulk */ }
}
```

### 3. Register it

Add an import and an entry to `ALL_PROVIDERS` in `src/core/registry.ts`. Order in the array is the order shown in `gup doctor`.

### 4. Smoke test

```powershell
npm run typecheck
npx tsx src/cli.ts doctor
npx tsx src/cli.ts list --provider my-tool
```

## Conventions

- **One file = one provider**. No cross-provider imports.
- **No throws in scan/update**. Return empty list / `success: false` outcomes — one failing provider must not break the others.
- **Use `run` and `runInherit` from `core/runner.ts`** instead of `child_process`. They handle Windows encoding quirks and never throw on non-zero exit.
- **Set `slow: true`** if the scan does per-package HTTP or filesystem walks. The user opts out with `gup --fast`.
- **Use `skipped: true`** in `UpdateOutcome` when the action requires user input outside the provider (manual download, GUI tool). It surfaces in yellow `SKIP` rather than red `FAIL`.
- **Time-bound HTTP calls**: `fetch(url, { signal: AbortSignal.timeout(5_000) })`.
- **No new dependencies** without discussion. The footprint is intentionally small (commander, chalk, cli-table3, execa, ora, p-limit, @inquirer/prompts).

## Project layout

```
src/
  cli.ts                 # commander entry
  core/
    types.ts             # Provider, OutdatedPackage, UpdateOutcome interfaces
    runner.ts            # execa wrapper with Windows-safe encoding
    registry.ts          # ALL_PROVIDERS + parallel scan
  providers/
    _template.ts         # copy this to start
    <provider>.ts        # one per source
  commands/              # list / update / doctor / menu
  ui/                    # table rendering and inquirer prompts
```

## Code style

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No casts unless necessary.
- No comments stating what the code does — only why, when non-obvious.
- French is fine for user-facing strings (the project's primary user is FR); keep code/docs/identifiers in English.

## Reporting issues

When reporting a provider bug, include:
- `gup doctor` output
- `gup list --provider <id> --json` output (or a redacted snippet)
- OS / package manager versions

That's usually enough to reproduce.
