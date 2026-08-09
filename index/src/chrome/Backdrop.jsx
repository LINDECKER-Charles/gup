/**
 * The five fixed decorative layers behind the page: pointer spotlight,
 * drifting grid, colour bloom, vignette and film grain.
 *
 * All five are `pointer-events: none` and hidden from assistive tech. The grid
 * and grain are the two most expensive to composite and are dropped below
 * 720px in CSS. The spotlight is driven by lib/motion.jsx through
 * --spot-x / --spot-y, so no React state changes on pointer move.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true">
      <div className="backdrop backdrop--spot" data-spotlight="1" />
      <div className="backdrop backdrop--grid" />
      <div className="backdrop backdrop--bloom" />
      <div className="backdrop backdrop--vignette" />
      <div className="backdrop backdrop--grain" />
    </div>
  );
}
