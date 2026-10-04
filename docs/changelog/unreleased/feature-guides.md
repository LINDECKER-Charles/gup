# Fragment — `docs/feature-guides`

The wave-3 documentation pass. Part 1: the screenshots of every 0.5.0 view, generated and
checked by CI. Part 2: the guides that show them, the consolidation of the design notes into the
reference pages, the diagrams, and this changelog. Design note:
[`docs/development/design/screenshot-pipeline.md`](../../development/design/screenshot-pipeline.md) §9.

## Documentation

- **docs:** The interactive app's screenshots, generated: 23 SVG terminal screenshots under `docs/assets/screens/` — the menu, an update running in the embedded terminal, the retry offer and the results, Planification and its editor, the Journal's four tabs, the theme picker's live preview, the colour editor's contrast check and eight built-in themes — with a gallery page by area, and a picture of the HTML report ([`ca98dfc`](https://github.com/LINDECKER-Charles/gup/commit/ca98dfc))
- **docs:** The documentation conventions describe what a scene runs on, how to add one, the pinned collation, the machine-path check and the report's picture ([`5e2110c`](https://github.com/LINDECKER-Charles/gup/commit/5e2110c))
- **docs:** The installation guide explains node-pty's install script and npm 11's review of it — what `--allow-scripts=node-pty`, a plain install, `strict-allow-scripts` and `--ignore-scripts` each do — the embedded terminal per platform, the per-OS provider counts and everything gup leaves on disk (`docs: document npm 11's install-script gate for node-pty`)
- **docs:** The fourteen design notes of the 0.5.0 cycle stay as indexed design records: an index says what each one covers, which reference page describes the area today and wins over it, how to read the plan identifiers they cite, and how to add one; the hand-offs the documentation pass completed are marked done (`docs: keep the 0.5.0 design notes as indexed design records`)
- **docs:** `architecture.md` and `how-gup-works.md` rewritten for 0.5.0 from the design notes: the layers, the provider contract's new fields, the platform gate, the scan, the update pipeline (embedded terminal, one UAC or `sudo` batch, retries, the batch lock), the interactive app and its run view, the runner and its install sinks, the history and debug log read back for display only, scheduling and its OS triggers, which setting value wins, the CLI modules and their slots — with twelve diagrams, and the walkthrough of every command (`docs(architecture): redraw the layers, pipelines and run flows`)
- **docs:** `SECURITY.md`'s threat model covers 0.5.0: both spawn paths (the runner and the PTY trampoline), hostile text in the terminal, the embedded terminal and the HTML report (CSP, Trusted Types, JSON data blocks), the elevated batch that never reads the settings, unattended scheduled runs and their OS trigger, native code, local data (file modes, redaction, a history read back for display only) and terminal integrity on signals; the scope names the trigger, the reports and the settings (`docs(security): cover the PTY, elevation, schedules and local data`)

## CI

- **ci:** The **Screenshots up to date** step (`npm run screenshots:check`, Ubuntu leg) fails a pull request whose UI change left the screenshots stale; job name and matrix unchanged ([`5336a88`](https://github.com/LINDECKER-Charles/gup/commit/5336a88))

## Internal

- **chore:** The screenshot generator mounts the app as gup's startup composes it — the theme engine on the scene's settings, the in-screen update launcher, a debug log at its default level — over fixtures that tell one story: a year of history, this morning's debug log, three schedules over a fixture Task Scheduler entry, and update runs scripted through the real run view, PTY sink and panes on an in-memory pseudo-terminal. node-pty's loader, the report opener and the OS trigger factory are guarded like the runner; a frame showing the rendering machine's paths is refused; the workers start in `fr_FR.UTF-8`, so lists sorted by name come out alike on every OS ([`4b6e564`](https://github.com/LINDECKER-Charles/gup/commit/4b6e564))
- **chore:** `npm run screenshots:report` captures the HTML report's picture: the fixture history, the built CLI's `gup report --no-open` in a throw-away directory, a headless Chromium with a throw-away profile ([`e4df05f`](https://github.com/LINDECKER-Charles/gup/commit/e4df05f))
