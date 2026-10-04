/**
 * WCAG contrast of two oklch() colours: oklch → oklab → linear sRGB (Björn
 * Ottosson's matrices) → relative luminance. Out-of-gamut channels are
 * clamped, which slightly understates contrast for very saturated colours —
 * the safe direction for a test that enforces a floor.
 */
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

function linearSrgb(color) {
  const [, lightness, chroma, hue] = color.match(OKLCH) ?? [];
  if (lightness === undefined) throw new Error(`not an opaque oklch() colour: ${color}`);
  const radians = (Number(hue) * Math.PI) / 180;
  const a = Number(chroma) * Math.cos(radians);
  const b = Number(chroma) * Math.sin(radians);
  const L = Number(lightness);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

const luminance = (color) => {
  const [r, g, b] = linearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** @param {string} foreground @param {string} background */
export function contrastRatio(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
