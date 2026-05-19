/**
 * Security-only ESLint config. Kept separate from the main lint so failures
 * here are surfaced explicitly in CI (`npm run lint:security`). Tuned for the
 * threat model of a CLI that spawns external package managers:
 *   - command injection (execa shell:true / dynamic argv)
 *   - prototype pollution / unsafe regex / eval-likes
 *   - tainted fs paths
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    project: false,
  },
  env: { node: true, es2023: true },
  plugins: ["@typescript-eslint", "security"],
  extends: ["plugin:security/recommended-legacy"],
  rules: {
    "security/detect-child-process": "error",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-eval-with-expression": "error",
    "security/detect-pseudoRandomBytes": "error",
    "security/detect-unsafe-regex": "warn",
    "security/detect-object-injection": "off",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
  },
  overrides: [
    {
      files: ["src/core/runner.ts"],
      rules: {
        "security/detect-child-process": "off",
      },
    },
    {
      // JetBrains providers walk %APPDATA%\JetBrains\<IDE>\plugins. Paths are
      // joined from a hardcoded env var with directory entries filtered by
      // strict regex (^[A-Za-z]+\d{4}\.\d+$). No external input reaches fs.
      files: ["src/providers/ide/jetbrains.ts", "src/providers/ide/jetbrains-plugins.ts"],
      rules: {
        "security/detect-non-literal-fs-filename": "off",
      },
    },
    {
      // Desktop container providers probe well-known install paths joined from
      // %ProgramFiles% / %LOCALAPPDATA% with hardcoded subdirs. The version
      // regexes are anchored with bounded quantifiers ({1,3}/{1,2}) so
      // detect-unsafe-regex is a false positive here.
      files: [
        "src/providers/containers/docker-desktop.ts",
        "src/providers/containers/podman-desktop.ts",
        "src/providers/containers/rancher-desktop.ts",
      ],
      rules: {
        "security/detect-non-literal-fs-filename": "off",
        "security/detect-unsafe-regex": "off",
      },
    },
    {
      // Neovim plugin providers join $XDG_DATA_HOME / $XDG_CONFIG_HOME (or the
      // documented Windows equivalents) with hardcoded subpaths ("lazy",
      // "mason", "lazy-lock.json"). No untrusted input reaches existsSync.
      files: [
        "src/providers/editor-plugins/nvim-lazy.ts",
        "src/providers/editor-plugins/nvim-mason.ts",
      ],
      rules: {
        "security/detect-non-literal-fs-filename": "off",
      },
    },
  ],
  ignorePatterns: ["dist/", "node_modules/", "tests/", "*.config.ts", "*.cjs"],
};
