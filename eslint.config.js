// Main lint config (flat). Parses TS and enforces the size/complexity ceilings
// declared in CLAUDE.md — nothing else. Style is not linted (no formatter in
// this repo), and the security ruleset lives in eslint.config.security.js,
// invoked separately via `npm run lint:security`.
//
// Counting policy: `skipComments` / `skipBlankLines` are ON. These limits exist
// to cap how much a reader must hold in their head at once, and this codebase
// documents heavily on purpose — counting comment lines would penalise exactly
// the thing that makes long functions readable, and push contributors to delete
// explanations to get green. Code lines are what gets measured.
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import security from "eslint-plugin-security";

export default [
  {
    ignores: ["dist/", "node_modules/", "coverage/", "tests/", "*.config.ts", "*.cjs"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        project: false,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      // Registered (not enabled) so inline `eslint-disable security/*`
      // directives in source files do not error out under the main lint.
      security,
    },
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 30, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "max-params": ["error", 3],
      "max-depth": ["error", 3],
      complexity: ["error", 10],
    },
  },
  {
    // Exception nommée (voir CLAUDE.md § Exceptions nommées) : catalogue plat
    // des 134 providers, une ligne d'import et une ligne d'instanciation
    // chacun. Le découper produit N fichiers de sous-listes plus un fichier
    // d'agrégation — plus de code pour la même chose, alors que la limite vise
    // la charge cognitive, ici nulle.
    files: ["src/core/registry.ts"],
    rules: { "max-lines": "off" },
  },
];
