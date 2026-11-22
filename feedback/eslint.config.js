// Lint config of the feedback service. Same policy as the root eslint.config.js:
// it enforces the size and complexity ceilings of CLAUDE.md and dead code,
// nothing about style. Comments and blank lines do not count towards the size
// limits — they cap what a reader holds in their head, and explanations are
// not what makes a function hard to hold.
import tseslint from "typescript-eslint";

const SHARED_RULES = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
  ],
  "max-params": ["error", 3],
  complexity: ["error", 10],
};

export default [
  { ignores: ["dist/", "node_modules/", "coverage/"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...SHARED_RULES,
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 30, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "max-depth": ["error", 3],
      "max-len": ["error", { code: 100, ignoreUrls: true }],
    },
  },
  {
    // Tests and tooling: no size ceilings (a test file's length measures
    // coverage), but parameter count, complexity and dead code still apply.
    files: ["tests/**/*.ts", "scripts/**/*.ts", "*.config.ts"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: SHARED_RULES,
  },
];
