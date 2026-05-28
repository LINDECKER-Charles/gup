// Main lint config (flat). Intentionally minimal: parses TS but enables no
// rules — matches the pre-flat behavior (`eslint src --ext .ts` without a
// root config). Security ruleset lives in eslint.config.security.js and is
// invoked separately via `npm run lint:security`.
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
  },
];
