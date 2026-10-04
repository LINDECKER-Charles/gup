/**
 * The report's colours, light and dark, as CSS custom properties. Each theme
 * is chosen for its own surface (dark is not an inversion of light), and held
 * to WCAG AA by a test: text at least 4.5:1 on the grounds it sits on, marks
 * (chart fills, heat levels, control borders, the focus ring) at least 3:1.
 *
 * The dark values apply under `prefers-color-scheme: dark` unless the reader
 * picked "Clair", and whenever they picked "Sombre"; print always uses light.
 */

export const THEME_TOKENS = {
  light: {
    bg: "#f5f6f8",
    surface: "#ffffff",
    "surface-2": "#f0f2f5",
    "surface-hover": "#e9edf2",
    text: "#1b1f24",
    muted: "#57606a",
    border: "#dde2e8",
    "border-strong": "#868e98",
    grid: "#e6e9ee",
    accent: "#0a5fc2",
    "on-accent": "#ffffff",
    "accent-weak": "#e7f0fc",
    ok: "#17733a",
    "ok-weak": "#e6f4ea",
    "ok-ink": "#0f5129",
    fail: "#c4232b",
    "fail-weak": "#fcebec",
    "fail-ink": "#8e171d",
    skip: "#8f5f00",
    "skip-weak": "#f9f0dd",
    "skip-ink": "#644200",
    "heat-0": "#868e98",
    "heat-1": "#519c62",
    "heat-2": "#35864a",
    "heat-3": "#1f6a34",
    "heat-4": "#0d4a20",
    overlay: "rgba(15, 20, 26, 0.38)",
    shadow: "0 1px 2px rgba(15, 20, 26, 0.05), 0 2px 8px rgba(15, 20, 26, 0.05)",
  },
  dark: {
    bg: "#0d1117",
    surface: "#161b22",
    "surface-2": "#1d232c",
    "surface-hover": "#252c36",
    text: "#e6edf3",
    muted: "#9ba5b0",
    border: "#2b323c",
    "border-strong": "#6f7883",
    grid: "#262d36",
    accent: "#5ca6ff",
    "on-accent": "#0d1117",
    "accent-weak": "#132a45",
    ok: "#3fb950",
    "ok-weak": "#12301c",
    "ok-ink": "#8ee49b",
    fail: "#ff6b63",
    "fail-weak": "#3a1719",
    "fail-ink": "#ffb3ad",
    skip: "#d29922",
    "skip-weak": "#33270d",
    "skip-ink": "#f2cf7a",
    "heat-0": "#6f7883",
    "heat-1": "#2b7a3d",
    "heat-2": "#3a9b50",
    "heat-3": "#56c26a",
    "heat-4": "#8ce59b",
    overlay: "rgba(0, 0, 0, 0.6)",
    shadow: "none",
  },
} as const;

type ThemeName = keyof typeof THEME_TOKENS;

function declarations(theme: ThemeName): string {
  const tokens = Object.entries(THEME_TOKENS[theme]).map(([name, value]) => `--${name}:${value};`);
  return `color-scheme:${theme};${tokens.join("")}`;
}

/** The custom properties of both themes, with the selection rules described above. */
export function themeCss(): string {
  return [
    `:root{${declarations("light")}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${declarations("dark")}}}`,
    `:root[data-theme="dark"]{${declarations("dark")}}`,
    `@media print{:root,:root[data-theme]{${declarations("light")}}}`,
  ].join("\n");
}
