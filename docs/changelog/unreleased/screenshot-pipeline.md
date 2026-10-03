# Fragment — `chore/screenshot-pipeline`

Tooling and documentation only: no change to what gup does. Design note:
[`docs/development/design/screenshot-pipeline.md`](../../development/design/screenshot-pipeline.md).

## Documentation

- **docs:** Add the documentation conventions — where pages go, the README's npm constraints, the Mermaid rules, and the screenshot workflow: commands, adding a scene, fixture and alt-text rules, what makes the output byte-identical (`docs: document the screenshot pipeline and mermaid rules`)

## Internal

- **chore:** Generate the interactive app's screenshots instead of capturing them by hand: `npm run screenshots` renders the real views headless on fixture data with a frozen clock, into deterministic SVG terminal screenshots and a gallery under `docs/assets/screens/`; `npm run screenshots:check` fails on a stale, missing or orphan file; `npm run typecheck:scripts` holds the fixtures to the app's contracts. Scenes cover Scan, Paquets, Providers and Options; every `GUP_*` variable is dropped, data directories are temporary, and a deny-by-default guard refuses and records any process a scene would start. The generated images and the CI check come with the wave-3 documentation pass ([`154f170`](https://github.com/LINDECKER-Charles/gup/commit/154f170))
