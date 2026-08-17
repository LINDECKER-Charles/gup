import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  // Must track `engines.node` in package.json: emitting for an older target
  // silently down-levels syntax the supported runtimes handle natively, and
  // lets code that needs a newer runtime build without complaint.
  target: "node24",
  platform: "node",
  outDir: "dist",
  clean: true,
  splitting: false,
  shims: false,
  sourcemap: false,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
});
