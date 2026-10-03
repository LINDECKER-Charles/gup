import { defineConfig } from "tsup";

export default defineConfig({
  // pty-exec is the trampoline the embedded terminal runs once per install:
  // its own small bundle, so an install does not pay for loading the CLI.
  entry: ["src/cli.ts", "src/pty-exec.ts"],
  // node-pty is an optional dependency with a native part, loaded at runtime
  // only (core/pty/pty-loader.ts); tsup externalises dependencies and peer
  // dependencies by itself, not optional ones.
  external: ["node-pty"],
  format: ["esm"],
  // Must track `engines.node` in package.json: emitting for an older target
  // silently down-levels syntax the supported runtimes handle natively, and
  // lets code that needs a newer runtime build without complaint.
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
