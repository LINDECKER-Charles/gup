# Fragment — `feat/options-themes`

Persisted settings, ten themes and a WCAG contrast guarantee for the interactive screens, and
the Options view rebuilt to change them: a theme picker with a live preview, a colour editor
that shows every contrast, the comfort settings. Design note:
[`../../development/design/options-themes.md`](../../development/design/options-themes.md).
Guides: [`configuration.md`](../../guide/configuration.md),
[`themes-and-accessibility.md`](../../guide/themes-and-accessibility.md).

## Added

- **ui:** The Options view is rebuilt as sections edited in place — SCAN & INSTALLATION, APPARENCE, CONFORT, FICHIER — each change applied and saved at once; a change that cannot be saved stays in effect and says why above the list ([`9e5eb24`](https://github.com/LINDECKER-Charles/gup/commit/9e5eb24))
- **ui:** Theme picker: every theme with its lowest contrast on this terminal, the theme under the cursor painted on the whole app before it is saved (Entrée applies, Échap goes back) ([`1d7d6de`](https://github.com/LINDECKER-Charles/gup/commit/1d7d6de))
- **ui:** Colour editor: each colour role chosen, painted and its contrast; a colour too pale or too dark to read is shown moved to the closest readable one (`2,1 → 4,6:1 ⚠`), `a` keeps it; hue and lightness nudges previewed live ([`78d7d33`](https://github.com/LINDECKER-Charles/gup/commit/78d7d33))
- **ui:** The comfort settings in Options: launch view, scan at launch, confirmation, rescan after update, package sort, Note column, incompatible providers, animations, mouse (switched at once), end-of-update notification, symbols, density, contrast level ([`9e5eb24`](https://github.com/LINDECKER-Charles/gup/commit/9e5eb24), [`1d7d6de`](https://github.com/LINDECKER-Charles/gup/commit/1d7d6de))
- **ui:** The Options view stays readable in an 80-column terminal: the hint of the row under the cursor is shown whole under the list, the colour editor keeps its contrast column whole and `échap retour` in its key bar, the theme picker its contrast verdict ([`fb689de`](https://github.com/LINDECKER-Charles/gup/commit/fb689de), [`49b95d0`](https://github.com/LINDECKER-Charles/gup/commit/49b95d0))
- **ui:** Reset by group (appearance, comfort, scan & install, all) after a confirmation that defaults to Non; the settings file's state and path in Options, `c` copies the path ([`9e5eb24`](https://github.com/LINDECKER-Charles/gup/commit/9e5eb24))
- **ui:** Ten themes — `terminal` (default), `auto`, `dark`, `light`, `high-contrast`, `colorblind` (Okabe-Ito), `dracula`, `catppuccin-mocha`, `github-light`, `monochrome` ([`a4ae290`](https://github.com/LINDECKER-Charles/gup/commit/a4ae290), [`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **ui:** Every text the screens paint reaches WCAG AA (4.5:1; 7:1 with `theme.contrast: "AAA"`) and every border 3:1, custom colours included: an unreadable colour is moved along its lightness, hue kept ([`a4ae290`](https://github.com/LINDECKER-Charles/gup/commit/a4ae290), [`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **ui:** The `terminal` theme reads the terminal's palette (OSC 4/10/11, once per run, bounded) and raises its colours to AA; 256-colour terminals get standard xterm colours re-checked, 16-colour terminals their own ANSI colours ([`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f), [`c9cb791`](https://github.com/LINDECKER-Charles/gup/commit/c9cb791))
- **core/config:** The menu's scan mode and provider filter and the install timeout are kept in `config.json`; the timeout applies to every command with `--timeout` > `GUP_INSTALL_TIMEOUT` > file > default ([`78f7496`](https://github.com/LINDECKER-Charles/gup/commit/78f7496), [`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))
- **ui:** The menu's preferences (launch view, scan at launch, confirmation, rescan after update, sort, Note column, animations, end-of-update notification, incompatible providers), density, symbol set and mouse are kept in `config.json` ([`6bd42f6`](https://github.com/LINDECKER-Charles/gup/commit/6bd42f6), [`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))
- **cli:** `gup doctor` shows where the settings file is and its state; problems with the file are printed once at startup, before any screen ([`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))

## Changed

- **ui:** The install timeout typed in Options is a whole number of seconds from 0 to 86400 (a day), the range the settings file keeps; any number ≥ 0 was accepted before ([`9e5eb24`](https://github.com/LINDECKER-Charles/gup/commit/9e5eb24))
- **ui:** When the terminal does not report its palette, the selected row and the title bar are drawn in inverse video: their contrast is the terminal's own, where the grey row of 0.4 measured 2.8:1 on Windows Terminal ([`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))

## Fixed

- **ui:** Package names, dialog text and the dialog's input were painted white whatever the terminal, invisible on light themes (macOS Terminal "Basic", "One Half Light"): they now use the theme's text colour or the terminal's own ([`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f), [`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))
- **cli:** `NO_COLOR` is honoured: no colour in the screens (monochrome) nor in console output (chalk only honoured `FORCE_COLOR`) ([`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))

## Documentation

- **docs:** Configuration guide (the Options view, the file, the environment variables) and themes/accessibility guide (the picker, the colour editor, the contrast guarantee, subprocess output on the host palette); design note for the settings, the theme engine and the Options view

## Internal

- **ui:** A contrast audit walks every view, the Options sub-views and every dialog under every built-in theme — including a colour typed unreadable on purpose — and measures every painted cell with the independent WCAG oracle; seeded property tests check 1,000 random palettes per level, and random custom colours and terminal palettes as painted on truecolor and 256-colour terminals at AA and AAA; the menu is also audited at AAA and on Terminal.app's 256 colours ([`c9cb791`](https://github.com/LINDECKER-Charles/gup/commit/c9cb791), [`09ac707`](https://github.com/LINDECKER-Charles/gup/commit/09ac707), [`9e5eb24`](https://github.com/LINDECKER-Charles/gup/commit/9e5eb24), [`1d7d6de`](https://github.com/LINDECKER-Charles/gup/commit/1d7d6de), [`78d7d33`](https://github.com/LINDECKER-Charles/gup/commit/78d7d33), [`a4ae290`](https://github.com/LINDECKER-Charles/gup/commit/a4ae290), [`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **ui:** Theme engine and settings lines wrapped at 100 columns ([`5324442`](https://github.com/LINDECKER-Charles/gup/commit/5324442))
