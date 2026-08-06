# CLAUDE.md

## commit

Convention de commits (maintenue par /commit).
- Style : Conventional Commits — langue : `en`
- Types observés : `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`
- Scopes (chemin → scope) :
  - `src/core/**` → `core` (ou `core/<module>` quand le changement est circonscrit, ex. `core/runner`)
  - `src/providers/**` → `providers`
  - `src/cli.ts`, `src/commands/**`, `src/ui/**` → `cli`
  - `tests/**` → même scope que le code testé, jamais de commit séparé
  - `.github/**` → `ci`
  - `docs/**`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md` → `docs`
  - `package.json`, `package-lock.json`, `tsconfig.json`, `tsup.config.ts` → `deps` sous `build`, `deps`/`deps-dev` sous `chore` pour les bumps Dependabot
  - `eslint.config*.js`, `vitest.config.ts`, `audit-ci.json`, `.semgrep.yml`, `.gitleaks.toml` → `lint`
  - bump de version publiée → `chore(release): <version>`
