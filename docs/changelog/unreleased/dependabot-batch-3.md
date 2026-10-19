# dependabot-batch-3

## Dependencies

- **deps:** execa 10.0.1 → 10.1.0: fixes on paths `src/core/runner.ts` takes — `killDescendants`
  no longer signals unrelated processes on Windows, no crash on EMFILE/ENFILE during a parallel
  scan, unbuffered streams no longer hold the promise, `kill()` after a failed spawn no longer
  signals the current process group — and `.cmd`/`.bat` arguments escaped the way Rust does on
  Windows; brings pretty-ms 9.3.1 and yoctocolors 2.2.0 in the lockfile
  (`build(deps): bump execa from 10.0.1 to 10.1.0`,
  [#107](https://github.com/LINDECKER-Charles/gup/pull/107))
