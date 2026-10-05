import { defineConfig } from "tsup";

export default defineConfig({
  // cli is the installed entry point, which loads the program (main) as a
  // bundle of its own. pty-exec is the trampoline the embedded terminal runs
  // once per install: its own small bundle, so an install does not pay for
  // loading the CLI.
  entry: ["src/cli.ts", "src/main.ts", "src/pty-exec.ts"],
  // node-pty is an optional dependency with a native part, loaded at runtime
  // only (core/pty/pty-loader.ts); tsup externalises dependencies and peer
  // dependencies by itself, not optional ones.
  external: ["node-pty"],
  format: ["esm"],
  // Must track the Node floor, `MIN_NODE` in src/core/node-floor.ts (a test
  // holds the major), not `engines.node`, which is lower on purpose: emitting
  // for an older target silently down-levels syntax the supported runtimes
  // handle natively, and lets code that needs a newer runtime build without
  // complaint. `dist/cli.js` must still run on older Nodes: it imports only
  // plain text and checks.
  target: "node26",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  shims: false,
  sourcemap: false,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
});
