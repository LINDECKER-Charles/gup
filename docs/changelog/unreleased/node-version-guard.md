# node-version-guard

## Internal

- **cli:** the installed entry point `dist/cli.js` only loads the program, now a bundle of its own
  (`dist/main.js`, from `src/main.ts`), through an import the bundler leaves alone. `cli.ts` thus
  runs before any module of the program is evaluated; `process.argv[1]` stays `dist/cli.js`, so
  the trampoline lookup, the elevated child and the scheduled task's command are unchanged
  (`refactor(cli): load the program from a bundle of its own`)
