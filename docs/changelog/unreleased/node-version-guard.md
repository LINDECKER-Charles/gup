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
