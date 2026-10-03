/**
 * Every icon on the page, inline: no icon dependency, no sprite request.
 * All are decorative (`aria-hidden`) — each sits next to a text label or
 * inside a control whose accessible name is set elsewhere.
 *
 * Icons that point somewhere (arrows) carry `icon--directional` and are
 * mirrored in right-to-left pages by styles/foundation/direction.css.
 */

const STROKED = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const FILLED = { fill: "currentColor" };

/** Path data split across source lines. */
const d = (...parts) => parts.join("");

const ICONS = {
  arrow: { isDirectional: true, shape: <path d="M5 12h14M13 5l7 7-7 7" /> },
  external: { isDirectional: true, shape: <path d="M7 17 17 7M9 7h8v8" /> },
  chevron: { shape: <path d="m6 9 6 6 6-6" /> },
  check: { shape: <path d="m5 12.5 4.5 4.5L19 7" /> },
  copy: {
    shape: (
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
  },
  globe: {
    shape: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </>
    ),
  },
  pane: {
    shape: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M7 13l3 2-3 2M12 17h4" />
      </>
    ),
  },
  clock: {
    shape: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  chart: { shape: <path d="M5 19v-6M10 19V8M15 19v-9M20 19v-4M3 21h18" /> },
  browser: {
    shape: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h10M7 16h6" />
      </>
    ),
  },
  contrast: {
    shape: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
      </>
    ),
  },
  os: { shape: <path d="M4 5h16v11H4zM8 20h8M12 16v4M8 9h.01M8 12h.01" /> },
  terminal: { shape: <path d="m4 17 6-5-6-5M12 19h8" /> },
  windows: { shape: <path d="M3 4h18v12H3zM7 8h10M7 11h6M10 16v3M14 16v3M7 20h10" /> },
  macos: {
    shape: (
      <path d={d("M5 5h14v10H5zM2 19h20M5 15l-3 4M19 15l3 4", "M8 8.5l2 1.5-2 1.5M12 12h3")} />
    ),
  },
  linux: {
    shape: (
      <path
        d={d(
          "M4 3h16v5H4zM4 10h16v5H4zM4 17h16v4H4z",
          "M7 5.5h.01M7 12.5h.01M7 19h.01M13 5.5h4M13 12.5h4M13 19h4",
        )}
      />
    ),
  },
  github: {
    isFilled: true,
    shape: (
      <path
        d={d(
          "M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27",
          "-.01-1-.01-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05",
          "-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4",
          "-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52",
          "-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 5.8 0c2.21-1.49 3.18-1.18",
          " 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41",
          "-5.25 5.69.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56C20.21",
          " 21.39 23.5 17.08 23.5 12c0-6.35-5.15-11.5-11.5-11.5z",
        )}
      />
    ),
  },
  heart: {
    isFilled: true,
    shape: (
      <path
        d={d(
          "M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.6 5 6.2 5c2 0 3.4 1 4.3 2.2",
          "C11.4 5.9 13 5 14.8 5c3.6 0 5.5 3.6 4 6.8C19.5 16.4 12 21 12 21z",
        )}
      />
    ),
  },
  star: {
    isFilled: true,
    shape: (
      <path
        d={d("m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6", "L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z")}
      />
    ),
  },
};

/**
 * @param {{ name: keyof typeof ICONS, size?: number, className?: string }} props
 */
export function Icon({ name, size = 16, className = "" }) {
  const icon = ICONS[name];
  if (!icon) throw new Error(`Icon: unknown icon "${name}"`);
  const classes = ["icon", icon.isDirectional ? "icon--directional" : "", className];
  return (
    <svg
      className={classes.filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...(icon.isFilled ? FILLED : STROKED)}
    >
      {icon.shape}
    </svg>
  );
}
