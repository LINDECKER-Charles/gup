/**
 * Every icon on the page, inline. No icon dependency, no sprite request.
 * All are decorative (`aria-hidden`) — each one sits next to a text label, so
 * announcing them would only duplicate it.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function Arrow({ size = 14, weight = 2.4 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth={weight}
      aria-hidden="true"
      {...stroke}
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function Copy({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="2"
      aria-hidden="true"
      {...stroke}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function GitHub({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1-.01-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12c0-6.35-5.15-11.5-11.5-11.5z" />
    </svg>
  );
}

export function Heart({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.6 5 6.2 5c2 0 3.4 1 4.3 2.2C11.4 5.9 13 5 14.8 5c3.6 0 5.5 3.6 4 6.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

/**
 * The three platform glyphs. Each path self-draws once via the `gDraw`
 * keyframe: `--len` carries the path length so one keyframe serves every
 * shape. `stroke-dasharray` is set to the same length so the line starts
 * fully retracted.
 */
function drawn(len, delay, duration = 1) {
  return {
    strokeDasharray: len,
    strokeDashoffset: len,
    "--len": len,
    animation: `gDraw ${duration}s ease ${delay}s forwards`,
  };
}

function PlatformFrame({ children }) {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 48 48"
      strokeWidth="1.6"
      aria-hidden="true"
      {...stroke}
    >
      {children}
    </svg>
  );
}

/** A desktop tower and monitor. */
export function WindowsGlyph() {
  return (
    <PlatformFrame>
      <rect x="9" y="8" width="30" height="22" rx="2.5" style={drawn(104, 0.1, 1.1)} />
      <path d="M15 14h18M15 19h12" style={drawn(30, 0.7, 0.9)} />
      <path d="M20 30v6M28 30v6M15 39h18" style={drawn(30, 1, 0.9)} />
    </PlatformFrame>
  );
}

/** A laptop with a shell prompt on screen. */
export function MacGlyph() {
  return (
    <PlatformFrame>
      <rect x="8" y="11" width="32" height="21" rx="2.5" style={drawn(106, 0.1, 1.1)} />
      <path d="M4 37h40" style={drawn(40, 0.9, 0.8)} />
      <path d="M8 32l-4 5M40 32l4 5" style={drawn(14, 1.1, 0.7)} />
      <path d="M14 18l4 3.5-4 3.5M22 25h8" style={drawn(24, 1.3, 0.9)} />
    </PlatformFrame>
  );
}

/** A three-unit server rack. */
export function LinuxGlyph() {
  return (
    <PlatformFrame>
      <rect x="9" y="7" width="30" height="10" rx="2" style={drawn(80, 0.1)} />
      <rect x="9" y="19" width="30" height="10" rx="2" style={drawn(80, 0.45)} />
      <rect x="9" y="31" width="30" height="10" rx="2" style={drawn(80, 0.8)} />
      <path
        d="M14 12h.01M14 24h.01M14 36h.01"
        strokeWidth="3"
        style={drawn(1, 1.5, 0.5)}
      />
      <path d="M28 12h6M28 24h6M28 36h6" style={drawn(18, 1.3, 0.8)} />
    </PlatformFrame>
  );
}

export const PLATFORM_GLYPHS = {
  windows: WindowsGlyph,
  macos: MacGlyph,
  linux: LinuxGlyph,
};
