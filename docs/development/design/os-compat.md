# Design note — providers incompatible with the OS (`feat/os-compat-providers`)

Status: wave 2 of 0.5.0, on top of the foundation (`int/wave-1`). Scope: os-compat spec steps 2,
4 and 5 (the parts the foundation left), 8 (this branch's docs), and the plan's §6.2 additions
(`showIncompatibleProviders`, the `--provider` warning). Steps 6 and 7 — removing the leading
`isAvailable()` guards, the static drift test, the unreachable install hints — belong to the wave-3
branch `refactor/provider-platform-gate`.

User request (FR): *griser les providers non compatibles avec l'OS — ceux qui n'existent que sous
Windows doivent apparaître grisés dans la liste des providers sur Mac, et inversement.*

---

## 1. What changed for the user

| Change | Where |
|---|---|
| 35 providers declare the OSes gup supports them on; elsewhere they are never probed, scanned nor updated (14 refused on Windows, 21 on macOS, 27 on Linux). | `src/providers/**` |
| The Providers view opens on a summary and lists a third, greyed group "Incompatibles avec \<OS\>" (`–` mark, `<OS> uniquement` badge, no install hint). | `ui/panels/providers-panel.ts` |
| The `showIncompatibleProviders` preference (on by default) hides that group, live. | `ui/views/providers-view.ts` |
| `gup doctor` prints the same group, dimmed, after the missing providers. | `ui/table.ts` |
| `gup list` / `gup update` warn once per `--provider` id gup cannot act on (foreign to the OS, or unknown) instead of scanning nothing in silence. | `commands/warn-ignored-providers.ts` |
| Side effects of the declarations: a `winget`/`scoop`/`choco` shim on a POSIX `PATH` is no longer detected; `gup update brew-cask:x` exits 2 on Windows (the foundation's refusal, now live). | — |

## 2. What the foundation already provided

`src/core/platform/` (`PLATFORMS`, `isSupportedOn`, `platformName`, `supportLabel`,
`readProviderStatus`, `lookupProvider`), `Provider.platforms`, the registry gate (detection and
`getProvidersToScan`), `lookupProvider` in `gup update` targets, `__admin-batch` and the update
pipeline, the `disabled` tone (painted like `muted` by the legacy appearance), the `–` glyph in
`STATUS_GLYPHS`, `UiPreferences.showIncompatibleProviders`, and the Providers view port
(`providersView({ status: readProviderStatus })`). This branch declares, renders and documents;
it adds no contract.

## 3. Declarations

`readonly platforms = PLATFORMS.<set>;` — one line, a named set, so the landing build can count
per-OS support with a regex. Placed right after `installHint`, with a one-line (or short block)
rationale above it.

| Set | Providers |
|---|---|
| `windows` (21) | winget, scoop, choco, msys2, cygwin, npackd, wsl, wsl-apt, wsl-dnf, wsl-pacman, wsl-brew, wsl-flatpak, wsl-nix, nvm-windows, pyenv-win, docker-desktop, podman-desktop, rancher-desktop, nerd-fonts, git-for-windows, visual-studio |
| `macos` (6) | brew-cask, mas, macports, sparkle, fink, xcodes |
| `notWindows` (8) | brew, nix, pkgx, pkgin, nvm, pyenv, mint, swiftly |

The counts of the spec (35 restricted, 118 unrestricted, 153 registered; 14 / 21 / 27
incompatible) were checked against the code: every `process.platform` gate under
`src/providers/` is either one of these 35 or a path/flavour branch (`gem`, `nuget`,
`dotnet-sdk`, `semgrep`, `jetbrains`, the unregistered IDE providers).

**Guards.** The leading `isAvailable()` guards stay until wave 3: they keep a provider honest when
something probes it without the registry. Where a guard carried the rationale (`brew`,
`brew-cask`, `pyenv`, `mint`), the rationale moved onto the `platforms` line and the guard got a
one-line pointer (`Mirrors \`platforms\` for a caller that probes without the registry gate.`), so
wave 3 deletes guard + pointer and keeps the knowledge. Helper guards (`findPacmanExe`,
`isWslAvailable`, `installerDirs`…) are method contracts and stay for good.

**`self`.** `SelfTarget.platforms` is a `PlatformSet` checked by `isSupportedOn`; the `brew`
target declares `PLATFORMS.notWindows` like the `brew` provider (it was an ad-hoc
`["darwin", "linux"]`; the BSDs are now included, as for `brew` itself).

## 4. Providers view

```
27 détecté(s) · 112 non installé(s) · 14 incompatible(s) avec Windows      (muted)

● Détectés (27)
  ● Winget                         winget
○ Non installés / hors PATH (112)
  ○ Chocolatey                     choco
      → https://chocolatey.org/install

– Incompatibles avec Windows (14)                                           (header strong)
  Réservés à un autre système : gup ne les détecte                          (muted, wrapped)
  ni ne les met à jour ici.
  – Homebrew                       brew      macOS/Linux uniquement         (whole row disabled)
  – Homebrew (casks)               brew-cask macOS uniquement
```

- `ProvidersPanel.setData(report: ProviderStatusReport)` replaces `setData(detected, missing)`;
  `ProviderInfo` is gone. Groups in fixed order, registry order inside each group. The third
  group and the summary's third part are omitted when empty.
- Meaning never rests on colour (WCAG 1.4.1): the `–` mark, the header and the badge say it.
  The legacy appearance paints `disabled` like `muted` (SGR 2, which conhost does not render);
  the themes branch gives it its own colour, held to 4.5:1 by its contrast audit.
- **Layout.** Names keep the 30-column cell plus an explicit one-column gap (a name exactly as
  wide as the column — `xcodes (Xcode version manager)` — no longer touches its id). In the
  incompatible group the id column is as wide as the longest id of the group plus a gap, and the
  name column shrinks (down to 10) when the panel is narrow, so every badge stays whole and
  aligned: checked at 80, 100 and 120 columns on the real Windows report, macOS simulated. The
  explanation wraps at 48 columns (two lines), which fits the panel of an 80-column terminal and
  keeps the line count independent of the width (scrolling stays exact).
- **Preference.** The view hands the panel `showIncompatible: () =>
  context.preferences().showIncompatibleProviders`, read on every render: the session redraws
  when preferences change, so the group appears or disappears live, without a new detection. When
  hidden, the panel renders the report without its incompatible group (the "pre-filtered
  report" of the themes spec) and clamps its scroll offset to the shorter list.
- Strings live in `src/ui/text/providers-labels.ts`.

## 5. `gup doctor`

`renderProvidersStatus(report)` takes the whole report: detected (always), missing (with the install
hint), incompatible (dimmed rows, `–`, `(id)`, badge; no hint). `doctor.ts` changed by two lines
to pass the report, and its help text names the third group. The name column of the incompatible
section stretches to its longest name so the badges line up.

## 6. `--provider` warning

`warnIgnoredProviders(ids)` runs before the scan of `gup list` (both modes) and of the scan path of
`gup update` (not when explicit targets are given: those already exit 2). One stderr line per id
`lookupProvider()` refuses: `Attention : Provider brew-cask indisponible sur Windows (macOS
uniquement) — ignoré.` / `Attention : Provider inconnu: nope — ignoré.`. stdout is untouched, so
`--json` stays parseable. The scan is unchanged (the registry already drops those ids).

## 7. Security

- Smaller execution surface: on an OS outside the set, no `where`/`which` probe and no command
  of a same-named binary (`brew.cmd` → WSL, NCAR `ncl`, a `winget` shim on POSIX).
- No new input surface: ids come from the existing parsing; messages interpolate the id the user
  typed, as `Provider inconnu` already did. No new I/O, dependency or process.

## 8. Tests

| File | What |
|---|---|
| `tests/core/platform/provider-platforms.test.ts` | Golden incompatible lists for win32 / darwin / linux over the real `ALL_PROVIDERS`; declarations are named sets only (identity); with every probe true, detection returns exactly the supported providers and never calls a refused one's probe; shared `pyenv`/`nvm` binaries go to the Windows ports on Windows and to upstream on macOS. |
| `tests/ui/panels/providers-panel.test.ts` | Summary and group order; badge row, no hint; every segment `disabled`; header names `report.platform`; empty group omitted; preference hides live; narrow panel keeps badges whole and aligned; 30-column name keeps its gap; scroll clamp; lazy load. |
| `tests/ui/views/providers-view.test.ts` (new) | Through `bootMenu`: greyed group from the port; preference toggled live; failed detection shows empty groups. |
| `tests/commands/doctor.test.ts` | Rewritten on the real renderer, only `readProviderStatus` mocked: titles, hint line, incompatible rows, OS name, empty section omitted (plus the foundation's Système cases). |
| `tests/ui/table.test.ts` (new) | Incompatible rows dimmed end to end; badges aligned past a long name. |
| `tests/commands/list.test.ts`, `update.test.ts` (additions) | `--provider` warnings: foreign, unknown, pure JSON stdout, silence for actionable ids, none on the targets path. |

## 9. Deviations from the plan and the spec

1. **`src/commands/doctor.ts` edited** (two lines + help text), although amendment W2-7 says
   "never edit `doctor.ts`": W2-7 is about the "Système" diagnostics; the incompatible section
   needs the call site to pass the report (`renderProvidersStatus(report)`, spec §4.8). No other
   wave-2 branch edits that function.
2. **The `--provider` warning also covers unknown ids**: it is built from `lookupProvider()`,
   whose two refusals are "unknown" and "foreign"; an unknown id scanned nothing in silence too.
3. **`ID_WIDTH = 20` (spec §2.1) is replaced** by group-sized columns in the panel (tight id
   column, shrinkable names, wrapped explanation): with a fixed 30 + 20 layout the badges were cut
   at 100 columns and invisible at 80. `gup doctor` keeps a 20-column id cell.
4. **Unregistered `notepad-pp` / `unity-hub` are not annotated** (spec §3.3): the task and
   amendment U-4 leave the seven manual IDE providers to wave 3, which deletes them.
5. **`self` winget/scoop/choco targets stay unrestricted** (spec §4.9, optional): restricting
   them changes the rows `tests/providers/self*.test.ts` expect on the POSIX CI legs, and
   `tests/providers/**` belongs to `test/provider-contracts` in wave 2. Candidate for wave 3.
6. **No duplicate `getProvidersToScan` case**: the foundation's `registry-extra.test.ts` already
   proves an injected unsupported provider is dropped.

## 10. Hand-off to wave 3 (`refactor/provider-platform-gate`)

- Remove the leading guards of the 19 registered providers listed in spec §4.6 with their
  `Mirrors \`platforms\`…` pointers where present; the rationale is already on `platforms`.
- Add `tests/core/platform-gate-source.test.ts` (no `process.platform` in `isAvailable()`, no
  `.isAvailable(` outside the registry) and delete the superseded per-provider tests.
- Drop the install-hint keys made unreachable by the declarations (spec §4.9 rule).
- Consider `PLATFORMS.windows` on the `self` winget/scoop/choco targets with their tests.
