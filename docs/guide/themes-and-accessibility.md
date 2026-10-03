# Themes and accessibility

`gup`'s screens are readable on any terminal theme, light or dark, with the
colours you choose: every piece of text reaches the WCAG 2.x **AA** contrast
ratio (4.5:1; 7:1 with the AAA option) against what it is drawn on, and every
border 3:1. This page lists the themes, explains how the default one follows
your terminal, and what `gup` guarantees.

- [Themes](#themes)
- [How the `terminal` theme follows your terminal](#how-the-terminal-theme-follows-your-terminal)
- [The contrast guarantee](#the-contrast-guarantee)
- [Not by colour alone](#not-by-colour-alone)
- [Terminals with fewer colours, and NO_COLOR](#terminals-with-fewer-colours-and-no_color)
- [The embedded terminal](#the-embedded-terminal)

The theme is set in the settings file (`theme.id`, see
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
- **The terminal does not answer.** `gup` cannot know your colours, so it does
  not invent any: text is your terminal's own text colour, the accents are your
  ANSI colours, and the selected row and the title bar are drawn in **inverse
  video** — their contrast is your terminal's own by construction. Contrast
  cannot be verified in this case; pick an RGB theme for a guaranteed one.

Whether a given terminal answers is recorded during the Windows verification
pass of 0.5.0 (conhost and Windows Terminal) and on macOS later.

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
  thousand random palettes pass after adjustment at both levels, and an audit
  walks the whole menu under every theme and measures every cell on screen.

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
| 256 colours (older macOS Terminal.app) | moves every colour to the nearest of the 240 standard xterm colours — not your 16 themed ones — and re-checks the contrast on those exact colours |
| 16 colours (Linux console) | RGB themes are not available; `gup` uses your terminal's ANSI colours with inverse-video selection |
| `NO_COLOR` set | monochrome, whatever the theme; console output loses its colours too |

conhost (the classic Windows console) does not draw "dim" text: where `gup`
relies on your terminal's colours, secondary text then looks like normal text,
and the symbols and labels carry the difference.

## The embedded terminal

When updates run inside `gup`'s screen, the installers' own output is shown in
an embedded terminal pane drawn on your terminal's own background, never on the
theme's: that output uses your terminal's colours, which `gup` does not check.
