/**
 * The frame every gup screen shares (src/ui/tui/chrome.ts), as structured
 * HTML rather than box-drawing art, so it reflows, scales and never
 * misaligns when a glyph falls back to another font: the title bar (version,
 * then the screen's facts), the body, and the key-hint bar.
 */
import { Fragment } from "react";
import { facts as site } from "../../data/facts.js";
import { classNames } from "../../lib/class-names.js";

/** Between two key hints, as the TUI's hint bar joins them. */
const HINT_SEPARATOR = " · ";

/**
 * @param {{ facts: readonly string[], hints: readonly string[], className?: string,
 *   children: import("react").ReactNode }} props
 */
export function TuiFrame({ facts, hints, className, children }) {
  return (
    <div className={classNames("tui", className)}>
      <p className="tui-top">
        <span>{`gup v${site.version}`}</span>
        {facts.map((fact) => (
          <span key={fact} className="tui-fact">
            <span className="tui-fact-sep" aria-hidden="true">
              │
            </span>
            {fact}
          </span>
        ))}
      </p>
      <div className="tui-body">{children}</div>
      <p className="tui-hints">
        {hints.map((hint, index) => (
          <Fragment key={hint}>
            {index > 0 ? HINT_SEPARATOR : null}
            <span className="tui-hint">{hint}</span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}
