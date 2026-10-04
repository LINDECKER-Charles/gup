/**
 * The marks the TUI mocks draw, as gup draws them in a Unicode terminal:
 * `STATUS_GLYPHS` (src/ui/theme/glyphs.ts) and the package checkboxes and
 * cursor of Packages (src/ui/panels/packages-panel.ts). Held to those sources
 * by tests/rules/scenes-truth.test.mjs.
 */
export const TUI_GLYPHS = Object.freeze({
  /** Keyed like STATUS_GLYPHS; `running` is a slanted frame of the spinner, turning in a still. */
  status: Object.freeze({
    success: "√",
    failed: "×",
    skipped: "→",
    cancelled: "▪",
    pending: "·",
    running: "╱",
    scheduled: "∞",
  }),
  /** A package's box, and a provider row's box for all, some or none of its packages. */
  box: Object.freeze({ checked: "[■]", partial: "[–]", unchecked: "[ ]" }),
  cursor: "›",
  /** The view on screen, in the sidebar. */
  current: "▌",
});
