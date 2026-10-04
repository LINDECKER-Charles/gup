# windows-self-update

## Fixed

- **providers/node, ui:** on Windows, gup no longer updates itself while it runs: its native
  modules (OpenTUI's renderer, node-pty's ConPTY) stay loaded, Windows replaces no loaded DLL, and
  `npm install -g` failed half way, which could leave the package emptied. Its `npm-g` row is
  listed without a checkbox, with the command to run once gup has exited
  (`npm install -g @charles_lindecker/gup@latest --allow-scripts=node-pty`); Space says to quit
  and run it, `gup update --all` leaves the row out, `gup update npm-g:@charles_lindecker/gup` is
  skipped with that command, and the menu, `gup update` and `gup list` print it as they exit.
  macOS and Linux update gup like any other global package (`7c2494a`, `ac8a5a0`)
