/**
 * The gup logo, served as WebP with a PNG fallback and explicit intrinsic
 * dimensions so it reserves its box before decoding (no layout shift).
 *
 * Paths go through Vite's BASE_URL rather than a relative "public/..." string:
 * the site is deployed under the /gup/ sub-path, and a relative URL would
 * break under any path other than the exact root.
 */
const BASE = import.meta.env.BASE_URL;

export function BrandMark({ size, className, loading = "lazy" }) {
  return (
    <picture>
      <source
        type="image/webp"
        srcSet={`${BASE}public/logo-32.webp 1x, ${BASE}public/logo-64.webp 2x`}
      />
      <img
        className={className}
        src={`${BASE}public/logo-64.png`}
        srcSet={`${BASE}public/logo-32.png 1x, ${BASE}public/logo-64.png 2x`}
        alt=""
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        // Decorative: every instance sits beside the word "gup", so alt text
        // would only make a screen reader say the name twice.
        aria-hidden="true"
      />
    </picture>
  );
}
