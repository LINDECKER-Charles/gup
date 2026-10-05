# node-version-guard

## Changed

- **cli:** on a Node older than 26.9, every command now stops before the program loads, with exit
  code 1, the running version, nodejs.org's download page (in English or French) and the line
  that reinstalls gup, in the language `GUP_LANG` names: the settings file belongs to the program.
  It used to fail further on: the interactive app only said it needed Node 26.9, and a command
  such as `gup list` crashed inside a dependency (`execa` calls `Set.prototype.union`, Node 22).
  The floor is `MIN_NODE` in `src/core/node-floor.ts`, which the tests' global setup now reads
  too; a test holds the tsup target and `@types/node` to its major
  (`feat(cli): stop on a Node older than 26.9 with where to get one`)
- **deps:** `engines.node` goes from `>=26.9.0` down to `>=20`, the lowest floor a published gup
  declared, so that npm installs the latest gup on any Node from 20 and gup itself says which Node
  to install. Asked for a package without a version, npm installs the newest release whose
  `engines` accepts the running Node, without a word: Node 22.13 to 26.8 got 0.3.2, Node 20 to
  22.12 got 0.2.2, and `npm install -g` kept reinstalling them. The Node gup needs is still 26.9
  (`MIN_NODE`): the tsup target, `@types/node`, CI, Dependabot and the docs follow it, and a test
  keeps `engines` from rising above Node 20 again
  (`build: let npm install the latest gup on any Node from 20`)

## CI

- **pages:** the site rebuilds when `src/core/node-floor.ts` changes, the source of its Node floor
  (`ci(pages): rebuild the site when the Node floor changes`)
- **ci:** an `older node refusal (node 20 / ubuntu-latest)` job packs gup on Node 26, installs the
  tarball on Node 20 with that Node's npm, and checks that `gup --version` fails with the running
  version and nodejs.org's download page: the suites only fake an older Node
  (`ci(ci): check that the packed gup stops on Node 20`)

## Internal

- **cli:** the installed entry point `dist/cli.js` only loads the program, now a bundle of its own
  (`dist/main.js`, from `src/main.ts`), through an import the bundler leaves alone. `cli.ts` thus
  runs before any module of the program is evaluated; `process.argv[1]` stays `dist/cli.js`, so
  the trampoline lookup, the elevated child and the scheduled task's command are unchanged
  (`refactor(cli): load the program from a bundle of its own`)
- **landing:** the site's Node floor (`nodeMajor`, `nodeEngine` in `facts.js`) is read from
  `MIN_NODE` in `src/core/node-floor.ts`, the floor gup enforces, instead of `engines.node`
  (`build/facts/read-node-floor.mjs`, with its tests); the site still says Node ≥ 26
  (`refactor(landing): read the Node floor from src/core/node-floor.ts`)
