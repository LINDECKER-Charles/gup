# landing-install-command

## Fixed

- **landing:** the site gives the README's install command,
  `npm install -g @charles_lindecker/gup --allow-scripts=node-pty`, where it still showed the
  bare `npm install -g @charles_lindecker/gup` — which npm 12 installs without node-pty's install
  scripts, so without the embedded terminal on Linux. `sync-facts` reads the command from the
  README's `## Install` block instead of composing it from the package name, and fails the build
  if that block stops installing the package; the hero, the install section, the FAQ and its
  JSON-LD, `llms.txt`, `llms-full.txt`, the 404 and the social cards all follow it, and the FAQ
  explains the flag in the eight languages. Re-rendering the social cards also moves their
  version badge from the stale v0.4.0 to v0.5.0. A command too long for its box now wraps
  between its words instead of scrolling the flag out of sight, and `verify` checks the command
  is shown whole, inside its card, at 1440, 820 and 390 px in every locale
  (`fix(landing): show the install command with --allow-scripts=node-pty`,
  `test(landing): read the 404 command without stripping tags to nothing`,
  `docs: say the landing social cards move to v0.5.0`)

## CI

- **pages:** the landing workflow also runs when `README.md` changes: the site reads its install
  command from there now (`ci(pages): run the landing checks when the README changes`)
