# landing-install-command

## Fixed

- **landing:** the site gives the README's install command,
  `npm install -g @charles_lindecker/gup --allow-scripts=node-pty`, where it still showed the
  bare `npm install -g @charles_lindecker/gup` — which npm 12 installs without node-pty's install
  scripts, so without the embedded terminal on Linux. `sync-facts` reads the command from the
  README's `## Install` block instead of composing it from the package name, and fails the build
  if that block stops installing the package; the hero, the install section, the FAQ and its
  JSON-LD, `llms.txt`, `llms-full.txt`, the 404 and the regenerated social cards (still on
  v0.4.0) all follow it, and the FAQ explains the flag in the eight languages. A command too long
  for its box now wraps between its words instead of scrolling the flag out of sight, and
  `verify` checks the command is shown whole, inside its card, at 1440, 820 and 390 px in every
  locale (`fix(landing): show the install command with --allow-scripts=node-pty`)

## CI

- **pages:** the landing workflow also runs when `README.md` changes: the site reads its install
  command from there now (`ci(pages): run the landing checks when the README changes`)
