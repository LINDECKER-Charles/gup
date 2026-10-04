# Themes and accessibility

`gup`'s screens are readable on any terminal theme, light or dark, with the
colours you choose: every piece of text reaches the WCAG 2.x **AA** contrast
ratio (4.5:1; 7:1 with the AAA option) against what it is drawn on, and every
border 3:1. This page lists the themes, explains how the default one follows
your terminal, and what `gup` guarantees.

- [Themes](#themes)
- [Choosing a theme](#choosing-a-theme)
- [Your own colours](#your-own-colours)
- [How the `terminal` theme follows your terminal](#how-the-terminal-theme-follows-your-terminal)
- [The contrast guarantee](#the-contrast-guarantee)
- [Not by colour alone](#not-by-colour-alone)
- [Terminals with fewer colours, and NO_COLOR](#terminals-with-fewer-colours-and-no_color)
- [The embedded terminal](#the-embedded-terminal)

Pick the theme in the interactive app, **Options › Thème**, with a live preview
(below), or in the settings file (`theme.id`, see
[configuration.md](configuration.md#theme)).

## Themes

| `id` | What it paints | Lowest text contrast (AA) |
|---|---|---|
| `terminal` (default) | your terminal's own colours, raised to AA when the terminal reports them | depends on the terminal |
| `auto` | `dark` or `light`, following your terminal's background | as `dark` / `light` |
| `dark` | gup's brand palette: navy, violet, amber, green, red | 6.1:1 |
| `light` | the same, for light backgrounds | 4.8:1 |
| `high-contrast` | white on black, bright accents; AAA everywhere | 7.8:1 |
| `colorblind` | Okabe-Ito colours: success sky blue, danger orange — never red against green | 5.9:1 |
| `dracula` | Dracula, a few colours adjusted for AA (muted, accent, danger, highlight) | 4.6:1 |
| `catppuccin-mocha` | Catppuccin Mocha | 5.4:1 |
| `github-light` | GitHub light, adjusted for AA (success, warning, highlight) | 4.5:1 |
| `monochrome` | no colour: your terminal's text colour only, selection in inverse video | your terminal's |

The RGB themes (`auto` to `github-light`) paint their own background: a
transparent or image background of your terminal is covered while `gup`'s screen
is up. `terminal` and `monochrome` leave your terminal's background as it is.

The cursor row is a soft tint on purpose: the `›` in the gutter carries the
cursor, the tint only reinforces it.

The same **Paquets** view in eight of them (the default `terminal` theme is the
one every other screenshot of these docs shows):

| | |
|---|---|
| ![The Paquets view in the Sombre (gup) theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-dark.svg) | ![The Paquets view in the Clair (gup) theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-light.svg) |
| `dark` — **Sombre (gup)** | `light` — **Clair (gup)** |
| ![The Paquets view in the Contraste élevé theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-high-contrast.svg) | ![The Paquets view in the Daltonisme (Okabe-Ito) theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-colorblind.svg) |
| `high-contrast` — **Contraste élevé** | `colorblind` — **Daltonisme (Okabe-Ito)** |
| ![The Paquets view in the Dracula theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-dracula.svg) | ![The Paquets view in the Catppuccin Mocha theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-catppuccin-mocha.svg) |
| `dracula` — **Dracula** | `catppuccin-mocha` — **Catppuccin Mocha** |
| ![The Paquets view in the GitHub (clair) theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-github-light.svg) | ![The Paquets view in the Monochrome theme, with packages checked, the cursor row highlighted and the selection bar's button.](../assets/screens/theme-monochrome.svg) |
| `github-light` — **GitHub (clair)** | `monochrome` — **Monochrome** |

## Choosing a theme

In **Options**, the *Thème* row shows the theme in use and, as its hint, how
readable it is on your terminal: `✔ AA · contraste min. 6,1:1`, `⚠ 2 couleurs
ajustées · min. 4,6:1`, or `? palette du terminal inconnue — contraste non
vérifiable`. The count is of the colours you can set in the colour editor —
the same number the picker and the editor give; the colours drawn from them
(the title bar's fill, the text on it, the focus border) follow without being
counted again. `entrée` opens the theme picker:

![Options, theme picker: every built-in theme with its lowest contrast ratio, the Dracula theme under the cursor previewed on the whole app, its sample and contrast verdict on the right.](../assets/screens/options-themes.svg)

| Mark | Meaning |
|---|---|
| `✔ 6,1` | readable as is; its lowest text contrast is 6.1:1 |
| `⚠ 4,6` | some colours had to be adjusted to reach the level; lowest contrast after adjustment |
| `? —` | your terminal did not report its palette: contrast cannot be checked |
| `✔ —` | monochrome: your terminal's own text and background |
| `–` (greyed) | this terminal cannot paint it (16 colours) — it cannot be applied |

- Moving the cursor **paints the whole app** with the theme under it — the
  menu, the borders, the title bar and a sample of every colour on the right —
  without saving anything. The title bar says `aperçu du thème` while a theme
  is only previewed, even if you go to another view meanwhile.
- `entrée` saves the theme under the cursor; `échap` (or `←`) goes back to
  the saved one.
- The *Niveau de contraste* row switches between AA (4.5:1) and AAA (7:1) for
  every theme.

## Your own colours

*Couleurs perso.* opens the colour editor for the theme in use. Your colours
belong to that theme: an accent tuned for `dark` does not change `light`.

![Options, colour editor: each colour role with the chosen and displayed colour, its contrast ratio and a sample; a custom accent too dark to read raised from 1.4:1 to 4.5:1, with a warning.](../assets/screens/options-colors.svg)

| Column | Shows |
|---|---|
| Choisie | your colour, or `(thème)` when the role follows the theme |
| Affichée | the colour actually painted |
| Contraste | its lowest ratio on the background and the selected row — or `2,1 → 4,6:1 ⚠` when your colour was too pale or too dark to read and was moved to the closest readable one |
| Aperçu | the role painted as it is |

| Key | Effect |
|---|---|
| `↑` `↓` | another role |
| `entrée` | type a colour, `#RRGGBB` or `#RGB` |
| `←` `→` | hue −/+ 10° (previewed on the whole app) |
| `+` `-` | lighter / darker (previewed) |
| `a` | keep the adjusted colours as your own |
| `suppr` | give the role back to the theme |
| `échap` | back to the list |

A colour you type is saved at once; nudges with the arrows and `+` `-` are
saved when you move to another role or leave the editor. **However you set
them, what is painted stays readable**: the setting keeps your choice, the screen
shows the adjusted colour, and the editor tells you so (`⚠ 1 couleur ajustée
automatiquement pour rester lisible (AA)`).

The editor is unavailable — and the row says why — when there is nothing to
tune: `monochrome`, `NO_COLOR`, a 16-colour terminal, or the `terminal` theme
on a terminal that does not report its palette.

## How the `terminal` theme follows your terminal

When a screen opens, `gup` asks the terminal for its colours (the standard OSC
4 / 10 / 11 queries, through OpenTUI, bounded by a one-second timeout and asked
once per run):

- **The terminal answers** — Windows Terminal, iTerm2, most modern terminals.
  `gup` builds its palette from your terminal's text and background colours and
  its ANSI colours (cyan for the accent, green, yellow, red), and checks every
  pair. What already passes is painted as your terminal's own colour; what does
  not is adjusted (lightness only, hue kept) and painted in RGB. For example,
  Windows Terminal's "Campbell" red (below 2.5:1 on its background) is
  lightened, and macOS Terminal.app's light "Basic" profile gets darker cyan,
  green and yellow.
- **The terminal does not answer.** `gup` cannot measure your colours, so it
  paints no RGB of its own: text is your terminal's own text colour, the
  selected row and the title bar are drawn in **inverse video** — their
  contrast is your terminal's own by construction — and each accent is one of
  your ANSI colours, picked to read on the default colours of the terminals
  that stay silent:

  | What `gup` knows | Defaults it relies on | What changes from the usual slots |
  |---|---|---|
  | Windows — its console (conhost) never answers | Campbell (the console's default since Windows 10 1709, and Windows Terminal's), the console colours of before | red, green and cyan take their **bright** slots — Campbell's red is 3.2:1 on its background, its bright red 5.1:1; yellow and the borders keep theirs |
  | the background is **dark**, and nothing more | iTerm2's default profile, GNOME Terminal's Tango dark | green and cyan take their bright slots; red and the borders of the panels without focus, readable in no slot on both, are drawn in your text colour |
  | the background is **light**, and nothing more | Terminal.app's *Basic* profile, xterm's black on white | green, yellow, cyan and the focused border, readable in no slot (about 3:1), are drawn in your text colour; red keeps its slot |
  | nothing at all, outside Windows | — | nothing: the usual slots, unverified |

  That is at AA; at AAA more of them may fall back to your text colour. A
  colour drawn in your text colour keeps its meaning through its symbol (`✔`,
  `✖`, `⚠`). If you changed your console's colours, `gup` paints with yours,
  unverified: pick an RGB theme for ratios guaranteed whatever the terminal.

Which terminals answer is not recorded here yet: the manual verification passes
of 0.5.0 (conhost and Windows Terminal, then macOS) will list them. conhost
never does.

## The contrast guarantee

Checked on every pair `gup` paints:

| What | Against | Minimum |
|---|---|---|
| all text (normal, bold, secondary, disabled, accent, success, warning, danger) | the background and the selected row | 4.5:1 (AA) or 7:1 (AAA) |
| the title bar's and the active button's text | the title bar | same |
| panel and dialog borders, the title bar's edge | the background | 3:1 |

- **Your custom colours are checked too.** A colour that would be unreadable is
  moved along its lightness, keeping its hue, just far enough to reach the
  target; the setting keeps what you chose. Grounds come first: a custom
  background so mid-grey that no text could reach the target is moved away from
  the middle.
- Ratios are computed on the exact 8-bit colours painted, as WCAG defines them
  (relative luminance, `(L1 + 0.05) / (L2 + 0.05)`), and shown truncated: a "4,5"
  is never a rounded-up 4.46.
- "Disabled" text (a provider foreign to your OS) is the dimmest grey that still
  reaches the target: visibly dimmed, never unreadable.
- The tests hold this: every built-in theme passes with no adjustment, a
  thousand random palettes pass after adjustment at both levels, random custom
  colours on every theme and random terminal palettes pass as painted — on
  true-colour and 256-colour terminals, at AA and AAA — and an audit walks the
  whole menu under every theme and measures every cell on screen, including on
  the Windows console and on Terminal.app's *Basic* profile when they keep their
  palette to themselves. The colours picked for a silent terminal are checked
  against the defaults of the table above, at AA and AAA.

## Not by colour alone

- The panel that has the keyboard has a **heavy** border, the others a rounded
  one (in ASCII, `*=|` against `+-|`): focus never depends on colour (WCAG
  1.4.1).
- Statuses carry a symbol as well as a colour: `✔` success, `✖` failure, `⚠`
  warning, `–` not available on this OS.
- Symbols that a font or console cannot draw switch to one-column ASCII
  stand-ins (`interface.glyphs`, automatic on the Linux console, `TERM=dumb`,
  `GUP_ASCII=1`, or without a UTF-8 locale); layouts do not move.

## Terminals with fewer colours, and NO_COLOR

| Terminal | What `gup` does |
|---|---|
| true colour | paints the theme as is |
| 256 colours (older macOS Terminal.app) | moves every colour to the nearest of the 240 standard xterm colours — not your 16 themed ones — and re-checks the contrast on those exact colours; with the `terminal` theme, one of your terminal's own colours that the move leaves short is moved too |
| 16 colours (Linux console) | RGB themes are not available; `gup` uses your terminal's ANSI colours with inverse-video selection |
| `NO_COLOR` set | monochrome, whatever the theme; console output loses its colours too |

conhost (the classic Windows console) does not draw "dim" text: where `gup`
relies on your terminal's colours, secondary text then looks like normal text,
and the symbols and labels carry the difference.

## The embedded terminal

When updates run inside `gup`'s screen, the installers' own output is shown in
an embedded terminal pane drawn on your terminal's own background, never on the
theme's: **subprocess output uses the host palette** — your terminal's own
colours, which `gup` neither changes nor checks. Its readability is your
terminal theme's; the contrast guarantee covers everything `gup` paints around
it.

**Known issue — light terminals.** Text an installer prints in the default
colour, and gup's own notes in the pane (the lines starting with `›`), are
drawn white rather than in your terminal's text colour: the embedded terminal
of OpenTUI 0.5.14 offers no default-foreground option. On a light terminal
(macOS Terminal.app's default *Basic* profile, *One Half Light*…) they are hard
or impossible to read. Coloured output and everything outside the pane are not
affected. Until it is fixed, use a dark terminal profile while updating, or
set `GUP_PTY=off` to run installers in your own terminal instead. The contrast
audit pins this as a known failure, so it turns red the day the pane follows
your terminal's foreground.
