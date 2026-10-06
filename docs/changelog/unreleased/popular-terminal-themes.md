# popular-terminal-themes

## Added

- **ui:** 17 terminal themes, picked by GitHub stars and kept only when they look like no other
  theme in gup's colour roles — dark: `ayu-dark`, `cobalt2`, `everforest`, `gruvbox-dark`,
  `kanagawa`, `monokai`, `nord`, `one-dark`, `rose-pine`, `solarized-dark`, `synthwave-84`;
  light: `catppuccin-latte`, `flexoki-light`, `gruvbox-light`, `papercolor-light`,
  `rose-pine-dawn`, `solarized-light`. Each starts from the theme's published colours and passes
  AA as written; the roles that had to move are named in the themes guide
  (`feat(ui): add 17 popular terminal themes`)

## Changed

- **ui:** the theme picker's list scrolls to keep the cursor in view and a click lands on the
  theme under it; on a narrow panel the list takes half the height, so the preview under it
  keeps its contrast verdict (`feat(ui): scroll the theme picker's list to keep the cursor in
  view`)
- **ui:** the picker lists gup's own themes, then the community themes on a dark ground, then
  those on a light ground, each group in alphabetical order
  (`feat(ui): add 17 popular terminal themes`)

## Documentation

- **docs:** the themes guide lists the 24 RGB themes with their lowest contrast and the roles
  adjusted for AA, says why look-alikes such as Tokyo Night were left out, and its gallery shows
  every theme (`docs: document the new themes and retake the screenshots`)
- **landing:** the themes card counts 27 themes in the eight languages, and `llms.txt` too
  (`docs(landing): count the 27 built-in themes`)

## Internal

- **ui:** the built-in palettes move to `src/ui/theme/palettes/` (gup's own, community dark,
  community light); `builtin-themes.ts` only assembles and parses them
  (`refactor(ui): split the built-in palettes by theme family`)
