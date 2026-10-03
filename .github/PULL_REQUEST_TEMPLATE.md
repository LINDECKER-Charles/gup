## What and why
<!-- One paragraph. Link the issue: "Closes #123". One subject per pull request. -->

## Checklist
- [ ] Branch is `type/short-description`; commits follow Conventional Commits
      (English, imperative, subject ≤ 72 chars) — see CONTRIBUTING.md
- [ ] Tests ship with the change and check behaviour, not implementation
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run security`
      pass locally on Node ≥ 26.9
- [ ] User-facing strings are French; docs, comments and commits are English
- [ ] Docs updated where behaviour changed (README, docs/guide, providers catalog + count)
- [ ] Mermaid diagrams checked in the rich diff ("Files changed" → rendered view)
- [ ] Changelog entry added as `docs/changelog/unreleased/<branch-slug>.md`

## Tested by hand on
- [ ] Windows  - [ ] macOS  - [ ] Linux  - [ ] WSL
<!-- CI runs the unit suite on all three OSes; tick what you ran for real. -->

## Screens or output
<!-- UI change: before/after screenshot or terminal output. -->
