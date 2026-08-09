/**
 * The numbered rule that opens every section ("01 / POURQUOI ————").
 * `flag` renders the amber "NOUVEAU" pill; `trailing` is used by the
 * architecture stage for its beat counter.
 */
export function SectionLabel({ children, flag, trailing, reveal }) {
  return (
    <div className="sec-label" data-reveal={reveal}>
      <span className="mono-label">{children}</span>
      <span className="sec-label-rule" aria-hidden="true" />
      {flag ? <span className="sec-label-flag">{flag}</span> : null}
      {trailing}
    </div>
  );
}
