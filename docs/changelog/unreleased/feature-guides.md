# Fragment — `docs/feature-guides`

The wave-3 documentation pass. Part 1: the screenshots of every 0.5.0 view, generated and
checked by CI. Design note:
[`docs/development/design/screenshot-pipeline.md`](../../development/design/screenshot-pipeline.md) §9.

## Documentation

- **docs:** The interactive app's screenshots, generated: 23 SVG terminal screenshots under `docs/assets/screens/` — the menu, an update running in the embedded terminal, the retry offer and the results, Planification and its editor, the Journal's four tabs, the theme picker's live preview, the colour editor's contrast check and eight built-in themes — with a gallery page by area, and a picture of the HTML report ([`ca98dfc`](https://github.com/LINDECKER-Charles/gup/commit/ca98dfc))
- **docs:** The documentation conventions describe what a scene runs on, how to add one, the pinned collation, the machine-path check and the report's picture ([`5e2110c`](https://github.com/LINDECKER-Charles/gup/commit/5e2110c))

## CI

- **ci:** The **Screenshots up to date** step (`npm run screenshots:check`, Ubuntu leg) fails a pull request whose UI change left the screenshots stale; job name and matrix unchanged ([`5336a88`](https://github.com/LINDECKER-Charles/gup/commit/5336a88))

## Internal

- **chore:** The screenshot generator mounts the app as gup's startup composes it — the theme engine on the scene's settings, the in-screen update launcher, a debug log at its default level — over fixtures that tell one story: a year of history, this morning's debug log, three schedules over a fixture Task Scheduler entry, and update runs scripted through the real run view, PTY sink and panes on an in-memory pseudo-terminal. node-pty's loader, the report opener and the OS trigger factory are guarded like the runner; a frame showing the rendering machine's paths is refused; the workers start in `fr_FR.UTF-8`, so lists sorted by name come out alike on every OS ([`4b6e564`](https://github.com/LINDECKER-Charles/gup/commit/4b6e564))
- **chore:** `npm run screenshots:report` captures the HTML report's picture: the fixture history, the built CLI's `gup report --no-open` in a throw-away directory, a headless Chromium with a throw-away profile ([`e4df05f`](https://github.com/LINDECKER-Charles/gup/commit/e4df05f))
