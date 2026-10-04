# Documentation conventions

How `gup`'s documentation is written: where a page goes, what the README may
contain, how diagrams are drawn and how the screenshots of the interactive app
are produced. For the code conventions, see
[`CONTRIBUTING.md`](../../.github/CONTRIBUTING.md).

---

## Language and audience

- **Everything is written in English**: guides, development notes, release
  notes, code comments. Contributors and bug reports arrive in English.
- **The interface is French** and stays quoted as it is: name a UI label in
  **bold**, with an English gloss the first time a page uses it —
  "**Paquets** (packages)", "**Mode rapide** (fast mode)". Never translate a
  label in place: a reader looks for the French word on screen.
- User pages explain what to do; contributor pages explain how it works. A
  page that does both is two pages.

## Where things go

| Path | Content |
|---|---|
| `docs/guide/` | User-facing pages: install, the interactive app, CLI reference, schedules, journal and reports, configuration, themes, troubleshooting, scope, provider catalog. |
| `docs/development/` | Contributor-facing pages: architecture, internals, testing, releasing, the website, these conventions. |
| `docs/development/design/` | Design records, one per area: the decisions and deviations behind a feature, kept as they were written ([index](design/README.md)). The current behaviour goes in `architecture.md`, `how-gup-works.md` and `SECURITY.md`, which win over a record. |
| `docs/releases/` | Release notes, the text of each GitHub Release. |
| `docs/changelog/` | Commit-level history; `unreleased/` holds one fragment per branch ([how](../changelog/README.md)). |
| `docs/assets/` | Images. `demo.svg` (the animated `gup list`) is hand-made; `screens/` is generated, the HTML report's picture included ([Screenshots](#screenshots)). |
| `docs/archived/` | Local working documents, gitignored except its README. |

A new page is listed in the [documentation index](../README.md) in the same
pull request.

## The README is also the npm page

`README.md` ships in the npm package, and npm renders neither Mermaid nor
relative image paths:

- no Mermaid block in `README.md` — put the diagram in a page under `docs/`
  and link to it;
- images by absolute URL
  (`https://raw.githubusercontent.com/LINDECKER-Charles/gup/main/docs/assets/…`);
- links to other files by absolute GitHub URL when the README must work on npm
  as well.

## Mermaid diagrams

A diagram earns its place when it explains a mechanism — a flow, a sequence,
the states of a screen — that prose would spread over several paragraphs.

- **Stable diagram types only**, which GitHub and VS Code render: `flowchart`,
  `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `gitGraph`. No
  `*-beta` type.
- **One diagram, one question**, about 20 nodes at most. A one-sentence
  caption before the block says what it answers.
- **Labels in English**; French UI labels stay verbatim, inside quotes. Quote
  any label holding `( ) : , #`; break lines with `<br/>`.
- **No custom colours**: no `classDef` fills, no `style` colours. GitHub
  switches between light and dark themes and a fixed fill breaks one of them.
  The existing `stroke-dasharray` boundary class is the one exception.
- **Never in `README.md`** ([why](#the-readme-is-also-the-npm-page)).
- Check the rendering in the pull request's rich diff before asking for a
  review: a syntax error only shows there.

## Screenshots

The screenshots of the interactive app are **generated**, never captured by
hand: `npm run screenshots` renders the real views headless, on fixture data,
with a frozen clock, into SVG terminal screenshots under
`docs/assets/screens/`, plus a generated gallery page
([`docs/assets/screens/README.md`](../assets/screens/README.md)). A UI change
regenerates them in the same pull request, so the docs never show a screen gup
no longer has; CI fails the pull request otherwise.

How a screenshot is made:

```mermaid
flowchart LR
    Fx["fixtures/<br/>scan · providers · history · log<br/>schedules · update script"] --> App
    Comp["composition<br/>theme engine · settings<br/>in-screen launcher"] --> App
    Sbx["sandbox<br/>GUP_* scrubbed · temp dirs<br/>spawn guard"] --> App
    Clock["frozen clock<br/>2026-09-15 11:30 Europe/Paris"] --> App
    Keys[scene key presses] --> App["MenuApp on the<br/>OpenTUI test renderer"]
    App --> Spans["captureSpans()<br/>text · colours · attributes"]
    Spans --> Pal["resolve colours<br/>docs palette"]
    Pal --> Svg[SVG serializer]
    Svg --> Mode{mode}
    Mode -->|write| Out[("docs/assets/screens/*.svg")]
    Mode -->|check| Cmp{same bytes?}
    Cmp -->|no| Fail(["fail: run npm run screenshots"])
```

### Commands

| Command | Effect |
|---|---|
| `npm run screenshots` | Renders every scene, writes `docs/assets/screens/<id>.svg` and the gallery, deletes the SVGs no scene produces any more. One line per scene. |
| `npm run screenshots:check` | Renders every scene and compares with the committed files; writes nothing. Fails on a stale, missing or orphan file, naming it: ``docs/assets/screens/packages-select.svg is out of date — run `npm run screenshots` and commit the result.`` The **Screenshots up to date** step of CI runs it on the Ubuntu leg. |
| `npm run typecheck:scripts` | Type-checks the generator against the real app: a member added to `MenuController` must be implemented by the fixture controller. `npm run typecheck` covers it too. |
| `npm run screenshots:report` | Builds gup and captures the HTML report's picture, `docs/assets/screens/html-report.png` ([below](#the-html-reports-picture)). |

Run `npm run screenshots:check` before pushing a change to the interactive
app. The screenshot commands need Node ≥ 26.9, like the UI tests.

### Adding a scene

1. **Data.** If the view needs data the fixture machine does not have, add it
   under `scripts/screenshots/fixtures/`. If the view reads it through a port
   that reaches the system (detection, the OS scheduler, a browser, a file
   outside the sandbox), give it a fixture port in `fixtures/app-fixture.ts`
   — otherwise the spawn guard fails the scene.
2. **Scene.** Add a `Scene` to the group of its area in
   `scripts/screenshots/scenes/catalogue/` (`menu-scenes.ts`,
   `update-scenes.ts`, `schedule-scenes.ts`, `journal-scenes.ts`,
   `settings-scenes.ts`, `theme-gallery.ts`): an `id` in kebab-case (the file
   name), a `title` `gup — <view label as the app shows it>` built from the
   labels constants, an `alt` text, a size from `SCENE_SIZES`, the
   `fixture()`, and a `play()` that drives the app with key presses and ends
   on a `waitForText` of something only the target state shows.
   - Reach a view with `stage.open("<view id>")`, never by counting sidebar
     rows: it follows the menu's own order, so a view added later does not
     shift the scene.
   - Wait for texts built from the labels constants, not typed again: a
     reworded label then fails at compile time or in one place.
   - The frame clock is frozen: `stage.tick()` lets it tick once when the
     state shows a duration (an update in flight).
   - Settings the scene needs (a theme, a custom colour) go in
     `appFixture({ settings })`; updates it launches, in
     `appFixture({ updates })` — a script of each package's output, duration
     and outcome (`fixtures/update/run-scripts.ts`).
3. **Group.** A new area gets a `SceneGroup` listed in
   `scripts/screenshots/scenes/catalog.ts`, in the order a user meets it: each
   group is a section of the gallery page.
4. **Render.** Run `npm run screenshots`, open the SVG in a browser, and
   commit it with the gallery in the same commit as the change it shows.
5. **Embed.** In `docs/`, by relative path:
   `![alt text](../assets/screens/<id>.svg)`; in `README.md`, by absolute
   URL ([the README is also the npm page](#the-readme-is-also-the-npm-page)).

### What a scene runs on

The production app, composed as `gup`'s startup composes it, with fixtures
only where the real thing would reach the machine:

| Part | In a screenshot |
|---|---|
| Views | `menuViews()`, the menu's own list. Providers reads `PROVIDERS_FIXTURE`; Planification reads the fixture schedules; the Journal reads the history and debug log written in the sandbox; Options and the Journal read the scene's settings. |
| Settings | In memory, as with `GUP_CONFIG=0`: the defaults, then the scene's own. Nothing is read from or written to a file, and no scene sees another's. |
| Look | The theme engine (`ThemedAppearance`) on those settings, in a truecolor terminal that reports the docs palette — the default `terminal` theme follows it, as on Windows Terminal or iTerm2. |
| Updates | The in-screen launcher, its run view, the PTY sink and session, the terminal panes. Under them, an in-memory pseudo-terminal plays the script's output; the pipeline is the script, firing the same observer events and asking the same questions (elevation, retry) in the same order. No provider runs. |
| Scheduler | The real controller and stores, in the sandbox's scheduler directory, over a fixture Task Scheduler entry that answers from memory and refuses any change. |
| Debug log | A backend at the default level (`info`) that writes nowhere, so the Debug tab reads as it does in gup. |

### Fixture rules

- **Fictional but plausible.** Real provider ids — display names and declared
  platforms come from the registry, so a screenshot shows what gup shows —
  with made-up versions, schedules and history. Never data copied from a real
  machine: no user name, path, host or token can reach a screenshot.
- **One story.** The fixtures agree with each other: the history's latest
  scan is the fixture scan, its versions end where Paquets starts, the
  schedules' last runs are in the history and the debug log tells the same
  morning.
- **The platform comes from the fixtures** (the fixture machine runs Windows),
  never from stubbing `process.platform`, which OpenTUI needs to load its
  native renderer. A value that depends on the OS rendering the screenshots —
  a provider's install hint, whether winget is supported here, the elevation
  kind — is fixed in the fixture.
- **No process.** The generator replaces every function that can start a
  process or reach the OS with a refusal, and records each call: the runner,
  node-pty's loader, the HTML report's opener and the scheduler's OS trigger
  factory. A scene that called one fails, even when the app swallowed the
  refusal (providers treat a failed probe as "not installed"). Fixtures never
  reach the network either.
- **No data from the developer's machine.** Every `GUP_*` variable is dropped,
  and gup's history, settings, log, report and scheduler directories point at
  a temporary tree that only the fixtures write to. As a last check, a frame
  showing the rendering machine's home, temp directory or checkout is
  refused.
- **Time is frozen** at 2026-09-15 11:30 in Paris (`Date` and the frame
  clock, so spinners stand still). The UI formats dates and numbers through
  `src/ui/text/fr-format.ts` (explicit `fr-FR`), never with the host's
  locale: a CI runner in `en-US` must render the same bytes as a developer in
  `fr-FR`.

### Alt text

English, at most 250 characters, saying what the screen shows and what state
it is in — "The Paquets view: 12 outdated packages grouped by provider, Winget
fully checked…" — never "Screenshot of…". Figures match the fixture. The
generator refuses an empty or longer text.

### Why the output is byte-identical

Same scenes, same bytes, on every run and every OS:

- the clock, the time zone (`Europe/Paris`, set inside the vitest worker,
  where Windows honours it) and the data are fixed;
- the collation is pinned: the workers start in `LC_ALL=fr_FR.UTF-8`, which
  ICU reads for the order of every list gup sorts by name. A runner's
  `C.UTF-8` would give ICU's POSIX collation, where `Scoop` sorts before
  `npm`; the setup refuses to run under it. Windows takes the user's locale,
  where any common one sorts these names alike;
- the terminal is pinned (`TERM=xterm-256color`, a UTF-8 locale), so the
  glyph mode is Unicode even on a CI runner whose locale is `C`;
- colours are resolved against one fixed palette (GitHub Dark Default, the
  scheme of `demo.svg`): gup paints through ANSI slots and, in its default
  theme, through the colours the terminal reports — the same palette;
- the SVG is serialised deterministically: one decimal, colour classes
  numbered by first use, one element per line, LF endings.

Every cell is placed on a fixed grid (`textLength` per span), so the image
holds whatever monospace font the viewer falls back to. Should a platform
ever render an ambiguous-width glyph differently, generate on Linux (WSL on
Windows) and say so in the pull request.

### The HTML report's picture

The gallery ends with a picture of the HTML report, a PNG:
`npm run screenshots:report` writes the fixture history in a throw-away
directory, has the built CLI write its report there
(`gup report --format html --no-open`: nothing opens), and photographs it with
a headless Chromium using a throw-away profile — never the user's browser
session. `CHROME_PATH` names the browser (Chrome, Edge, Chromium, or
Playwright's headless shell); otherwise the usual install path is tried.

A browser's rendering varies with the machine, so this picture is not
byte-identical and CI does not check it: regenerate it by hand when the
report's design changes. Its relative dates ("il y a 19 jours") are counted
from the day it was taken.

### Inside `scripts/screenshots/`

```
scripts/screenshots/
├── vitest.config.ts     the generator's runner: one worker, TZ, LC_ALL, --mode check
├── tsconfig.json        npm run typecheck:scripts
├── setup.ts             sandbox, frozen clock, spawn guards, locale checks
├── capture.screens.ts   entry: catalogue check, one test per scene, gallery, orphans
├── report-sample.ts     npm run screenshots:report
├── sandbox/             env-sandbox · frozen-clock · no-spawn · machine-paths
├── fixtures/            clock · machine · scan · providers · controller · app-fixture
│   ├── journal/         a year of history · the debug log
│   ├── schedules/       three schedules · their last runs · the fixture trigger
│   └── update/          scripted run · canned output · the in-screen launcher
├── scenes/              scene contracts · capture · composition · render · sizes · catalogue
│   └── catalogue/       one group of scenes per area of the app
├── render/              docs palette · colour resolution · frame model · SVG
└── output/              sync-file · find-orphans · render-gallery · screens-run
```

vitest hosts the generator for its fake timers, the same TypeScript transform
as the UI suites, and a `--mode check` switch that works in every shell. The
unit tests of the pipeline live in `tests/scripts/screenshots/` and run with
the main suite.

## Link checking

The `docs` workflow (`.github/workflows/docs.yml`) checks every relative link
and its anchor in the tracked Markdown files, offline (lychee with
`--include-fragments`), on pull requests that touch Markdown or
`docs/assets/`. It is not a required check — a path-filtered workflow cannot
be — but a red run is fixed before merging. The lychee action is pinned to a
commit SHA, its release in a comment, like any third-party action
(`tests/security/workflow-pins.test.ts`); Dependabot bumps both.

- Link to a file by relative path, to a section by its GitHub anchor:
  [`documentation.md#screenshots`](#screenshots).
- An anchor is the heading, lowercased, punctuation dropped, spaces turned to
  hyphens. Keep numbers out of the headings other pages link to: renumbering a
  section would break every link to it.
- External URLs (badges, npm, commits) are not checked: offline keeps the job
  deterministic.

## Changelog and release notes

- Each branch writes its changelog fragment, `docs/changelog/unreleased/<branch-slug>.md`,
  as described in the [changelog README](../changelog/README.md).
- Release notes live in [`docs/releases/`](../releases/README.md); the release
  procedure is [`releasing.md`](releasing.md). The version shows in the title
  bar of every screenshot: a release regenerates them
  ([releasing.md § 2](releasing.md#2-prepare-the-release-branch)).
