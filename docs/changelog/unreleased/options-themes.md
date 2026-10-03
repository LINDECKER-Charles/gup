# Fragment — `feat/options-themes`

Persisted settings, ten themes and a WCAG contrast guarantee for the interactive screens; the
rebuilt Options view follows on the same branch. Design note:
[`../../development/design/options-themes.md`](../../development/design/options-themes.md).
Guides: [`configuration.md`](../../guide/configuration.md),
[`themes-and-accessibility.md`](../../guide/themes-and-accessibility.md).

## Added

- **ui:** Ten themes — `terminal` (default), `auto`, `dark`, `light`, `high-contrast`, `colorblind` (Okabe-Ito), `dracula`, `catppuccin-mocha`, `github-light`, `monochrome` — set in the settings file ([`a4ae290`](https://github.com/LINDECKER-Charles/gup/commit/a4ae290), [`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **ui:** Every text the screens paint reaches WCAG AA (4.5:1; 7:1 with `theme.contrast: "AAA"`) and every border 3:1, custom colours included: an unreadable colour is moved along its lightness, hue kept ([`a4ae290`](https://github.com/LINDECKER-Charles/gup/commit/a4ae290), [`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **ui:** The `terminal` theme reads the terminal's palette (OSC 4/10/11, once per run, bounded) and raises its colours to AA; 256-colour terminals get standard xterm colours re-checked, 16-colour terminals their own ANSI colours ([`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **core/config:** The menu's scan mode and provider filter and the install timeout are kept in `config.json`; the timeout applies to every command with `--timeout` > `GUP_INSTALL_TIMEOUT` > file > default ([`78f7496`](https://github.com/LINDECKER-Charles/gup/commit/78f7496), [`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))
- **ui:** The menu's preferences (launch view, scan at launch, confirmation, rescan after update, sort, Note column, animations, end-of-update notification, incompatible providers), density, symbol set and mouse are kept in `config.json` ([`6bd42f6`](https://github.com/LINDECKER-Charles/gup/commit/6bd42f6), [`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))
- **cli:** `gup doctor` shows where the settings file is and its state; problems with the file are printed once at startup, before any screen ([`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))

## Changed

- **ui:** When the terminal does not report its palette, the selected row and the title bar are drawn in inverse video: their contrast is the terminal's own, where the grey row of 0.4 measured 2.8:1 on Windows Terminal ([`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))

## Fixed

- **ui:** Package names, dialog text and the dialog's input were painted white whatever the terminal, invisible on light themes (macOS Terminal "Basic", "One Half Light"): they now use the theme's text colour or the terminal's own ([`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f), [`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))
- **cli:** `NO_COLOR` is honoured: no colour in the screens (monochrome) nor in console output (chalk only honoured `FORCE_COLOR`) ([`e9259ba`](https://github.com/LINDECKER-Charles/gup/commit/e9259ba))

## Documentation

- **docs:** Configuration and themes/accessibility guides; design note for the settings and the theme engine

## Internal

- **ui:** A contrast audit walks the whole menu under every theme and measures every painted cell with the independent WCAG oracle; a seeded property test checks 1,000 random palettes per level ([`a4ae290`](https://github.com/LINDECKER-Charles/gup/commit/a4ae290), [`ae2c67f`](https://github.com/LINDECKER-Charles/gup/commit/ae2c67f))
- **ui:** Theme engine and settings lines wrapped at 100 columns ([`5324442`](https://github.com/LINDECKER-Charles/gup/commit/5324442))
