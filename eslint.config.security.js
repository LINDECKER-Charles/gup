/**
 * Security-only ESLint config (flat). Kept separate from the main lint so
 * failures here are surfaced explicitly in CI (`npm run lint:security`). Tuned
 * for the threat model of a CLI that spawns external package managers:
 *   - command injection (execa shell:true / dynamic argv)
 *   - prototype pollution / unsafe regex / eval-likes
 *   - tainted fs paths
 */
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import security from "eslint-plugin-security";

export default [
  {
    ignores: ["dist/", "node_modules/", "coverage/", "tests/", "*.config.ts", "*.cjs"],
  },
  security.configs.recommended,
  {
    files: ["src/**/*.ts"],
    // Mirror of the switch in eslint.config.js: the size/complexity rules live
    // in the main config, so every `eslint-disable max-params` in source reads
    // as unused from here. Neither half sees the other's rules, so unused-
    // directive reporting can only produce false positives across the split.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        project: false,
      },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
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
  },
  {
    files: ["src/core/runner.ts"],
    rules: {
      "security/detect-child-process": "off",
    },
  },
  {
    // Elevation IPC writes/reads stay inside a freshly-created mkdtemp dir
    // (user-only perms) with filenames assembled from randomBytes(8) plus a
    // hardcoded basename (`.json`, `.out`, `spawn.ps1`). The `wx` flag
    // forbids overwriting any pre-staged file at the resulting path, which
    // shuts down the TOCTOU race on a shared tmp dir. No external input
    // reaches fs.
    files: ["src/core/elevation.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Semgrep python resolver joins `dirname(whichFirst("semgrep"))` with
    // hardcoded basenames ("python.exe", "python3", "python", "bin/python3",
    // "bin/python") to locate the interpreter that owns the on-PATH binary.
    // No untrusted input reaches existsSync.
    files: ["src/providers/security/semgrep.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
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
    // Neovim / vim plugin providers join $XDG_DATA_HOME / $XDG_CONFIG_HOME
    // (or the documented Windows equivalents) with hardcoded subpaths
    // ("lazy", "mason", "packer", "plug.vim", ...). No untrusted input
    // reaches existsSync.
    files: [
      "src/providers/editor-plugins/nvim-lazy.ts",
      "src/providers/editor-plugins/nvim-mason.ts",
      "src/providers/editor-plugins/nvim-packer.ts",
      "src/providers/editor-plugins/vim-plug.ts",
    ],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Eclipse provider probes well-known install roots (%PROGRAMFILES%,
    // %LOCALAPPDATA%) joined with hardcoded subdirs ("features", "plugins")
    // and walks the resulting directories. Entries are then filtered by
    // strict version regex (anchored, bounded quantifiers {1,3}). No
    // external input reaches fs.
    files: ["src/providers/ide/eclipse-marketplace.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-unsafe-regex": "off",
    },
  },
  {
    // Obsidian provider reads %APPDATA%\obsidian\obsidian.json (hardcoded
    // path from env var) then walks vault paths declared by the user's own
    // Obsidian config, joined with hardcoded subpaths
    // (".obsidian/plugins/<id>/manifest.json"). Vault list is authored by
    // the user via Obsidian itself — same trust boundary as the user's
    // home directory.
    files: ["src/providers/ide/obsidian-plugins.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Notepad++ provider joins %LOCALAPPDATA% / %PROGRAMFILES(X86)?% with
    // hardcoded "Notepad++/plugins" subpath and probes <entry>/<entry>.dll
    // inside the resulting dir. No external input reaches fs.
    files: ["src/providers/ide/notepad-pp.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // Sublime / Unity Hub / Zed providers all join %APPDATA% / %LOCALAPPDATA%
    // / $HOME / $XDG_*_HOME with hardcoded subpaths to enumerate user
    // installs. Unity's regex parses `Unity Hub --headless editors` stdout
    // (version line) — single capture, no nested quantifiers.
    files: [
      "src/providers/ide/sublime-pc.ts",
      "src/providers/ide/unity-hub.ts",
      "src/providers/ide/zed-ext.ts",
    ],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-unsafe-regex": "off",
    },
  },
  {
    // Nerd Fonts walks %LOCALAPPDATA%\Microsoft\Windows\Fonts and writes to
    // %LOCALAPPDATA%\gup\nerd-fonts.json. Family names downloaded as zip
    // assets are pre-validated via `isSafeFamilyName` against a strict
    // `^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$` regex before reaching fs/URL.
    files: ["src/providers/shell/nerd-fonts.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // History store appends to <data root>/gup/history/<YYYY-MM>.jsonl. The
    // directory comes from a hardcoded env var (%LOCALAPPDATA%,
    // $XDG_STATE_HOME) or homedir() joined with fixed segments, and the
    // basename is a UTC month formatted by the code itself. The one
    // user-controlled input, $GUP_HISTORY_DIR, is the user pointing their own
    // history at their own path — same trust boundary as their home directory.
    files: ["src/core/history/store.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    // SDKMAN provider reads `$HOME/.sdkman/bin/sdkman-init.sh` (hardcoded
    // subpath off homedir()). Version regex is anchored on `[0-9][\w.+-]*`
    // — single character-class quantifier, no backtracking pathology.
    files: ["src/providers/toolchain/sdkman.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-unsafe-regex": "off",
    },
  },
  {
    // Toolchain / CLI providers parse `<bin> --version` stdout with
    // semver-ish regexes (`\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?`, or the
    // looser `[0-9][\w.+-]*` form). All have a single character-class
    // quantifier with one optional non-capturing tail — no nested
    // quantifiers, no catastrophic backtracking. Scoop's package-id regex
    // is fully anchored with bounded char classes.
    files: [
      "src/providers/jvm/coursier-cs.ts",
      "src/providers/kubernetes/skaffold.ts",
      "src/providers/kubernetes/tilt.ts",
      "src/providers/node/bun-global.ts",
      "src/providers/os/scoop.ts",
      "src/providers/toolchain/asdf.ts",
      "src/providers/toolchain/proto.ts",
    ],
    rules: {
      "security/detect-unsafe-regex": "off",
    },
  },
];
