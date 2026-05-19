// Layout primitive — centered max-width wrapper.
export function Container({ children, className = "" }) {
  return <div className={`container ${className}`.trim()}>{children}</div>;
}
