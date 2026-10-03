# Fragment — `test/harness-and-support`

Test infrastructure only: no change to what gup does. Design note:
[`docs/development/design/test-harness.md`](../../development/design/test-harness.md).

## Internal

- **lint:** Split vitest into `unit`, `providers-legacy`, `providers`, `integration` and an opt-in `e2e` project, with a self-test holding every test file to exactly one project; a shared env turns history, config and the debug log off, pins `TZ=UTC` and points the log, report and scheduler directories at a sandbox unique per run and per worker, removed at the end of the run; a root global setup fails fast below Node 26.9; the ceremonial 90 % global coverage thresholds go; `test:unit` and `test:integration` scripts, `test:security` unchanged ([`5345f69`](https://github.com/LINDECKER-Charles/gup/commit/5345f69))
- **core:** Run the providers project on one strict fake machine — runner, `node:fs`, `node:os`, platform, env, uid and `fetch` faked at the boundary while gup's own helpers run for real, per-OS path semantics, injectable spawn/http/fs faults, unscripted calls failing the test even when a provider swallows them — with fixture references, redaction and a secret scan for recorded output, and a shared `setPlatform` ([`7e97d6a`](https://github.com/LINDECKER-Charles/gup/commit/7e97d6a))
- **providers:** Add the provider contract harness: one data case per provider generates detection, exact rows or golden, row invariants, a fault sweep of the scan, install argv and failure handling, and the `updateAll` shape, with waivers that must carry a reason and be needed ([`535812e`](https://github.com/LINDECKER-Charles/gup/commit/535812e))
- **core:** Add shared data builders, a seeded random source, and the activity-history fixture builder (records, JSONL shards, a deterministic 100 000-event generator) ([`74a3619`](https://github.com/LINDECKER-Charles/gup/commit/74a3619))
- **ui:** Add an independent WCAG 2.1 contrast oracle for the themes and HTML report suites ([`c82cf87`](https://github.com/LINDECKER-Charles/gup/commit/c82cf87))
