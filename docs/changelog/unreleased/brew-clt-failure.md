# brew-clt-failure

## Fixed

- **core:** a failed update no longer ends as a bare "failed" when its provider gives no reason —
  most of them answer a failure without one, which left the run view, the journal, the HTML report
  and the history with nothing to show. When an install sink kept the output (the app's terminal
  pane, a scheduled run), the outcome takes the line that says why: the first that opens on
  `Error:`, `error:`, `fatal:`, `npm error` or apt's `E:`, else the last. A scheduled run keeps the
  last 2 KB of a failed install's output for it, past the log's byte budget
  (`fix(core): explain a failed install in its installer's own words`)
- **ui:** a failed command's line in the debug log (`gup log`, the Journal's Debug tab) shows that
  same line rather than the last one, which Homebrew spends on advice
  (`fix(ui): show the line that says why a command failed in the log`)
- **providers:** a Homebrew formula stopped by its build tools ends as a manual action that names
  the fix, no longer as a failure offered again at every run. A formula with no bottle for this Mac
  installs from source, and Homebrew checks the build tools first: Command Line Tools that do not
  support this macOS (`Your Command Line Tools (CLT) does not support macOS 27.`) or are too old,
  Xcode too old, no developer tools, the Xcode license not accepted. `symfony-cli/tap/symfony-cli`,
  a tap formula without bottles, failed this way at every run on macOS 27 while the bottled
  formulae of the same batch went through
  (`fix(providers/os): make a build-tools block in brew a manual action`)

## Internal

- **core:** `runInherit` hands back what the install sink kept of the output
  (`RunResult.outputTail`), and `consumeFailureOutput()` hands the batch loop a failed install's,
  next to `consumeInterrupt()`. The fake runner's `InstallAnswer` takes `output`, and the
  screenshots' spawn guard lets `consumeFailureOutput` through
  (`fix(core): explain a failed install in its installer's own words`)
