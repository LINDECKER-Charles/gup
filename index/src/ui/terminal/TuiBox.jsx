/**
 * A titled panel, as the TUI frames its panels: the title sits on the top
 * border, and the focused panel gets the heavy border (src/ui/tui).
 */
import { classNames } from "../../lib/class-names.js";

/**
 * @param {{ title: string, isFocused?: boolean, className?: string,
 *   children: import("react").ReactNode }} props
 */
export function TuiBox({ title, isFocused = false, className, children }) {
  return (
    <div className={classNames("tui-box", isFocused && "is-focused", className)}>
      <p className="tui-box-title">{title}</p>
      {children}
    </div>
  );
}
