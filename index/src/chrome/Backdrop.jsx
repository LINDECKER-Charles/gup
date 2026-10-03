/**
 * Two static decorative layers behind the page: the violet bloom and the
 * faded grid. Fixed, non-interactive, hidden from assistive tech, and cheap:
 * no pointer tracking, no animation.
 */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-bloom" />
      <div className="backdrop-grid" />
    </div>
  );
}
