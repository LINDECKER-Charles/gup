/** Centred max-width wrapper — the single layout seam for every section. */
export function Shell({ children, className = "" }) {
  return <div className={`shell ${className}`.trim()}>{children}</div>;
}
