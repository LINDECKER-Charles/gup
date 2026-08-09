/**
 * The install bar that slides up once the hero is behind you, and retracts
 * again over the install section so it never covers its own target.
 * Visibility is driven by lib/motion.jsx via `data-shown`.
 */
import { CopyButton } from "../ui/CopyButton.jsx";
import { installCommand } from "../data/facts.js";
import { stickyCta } from "../data/content.js";

export function StickyCta() {
  return (
    <aside
      className="sticky-cta"
      data-sticky-cta="1"
      data-shown="0"
      aria-label="Installer gup"
    >
      <div className="sticky-cta-inner">
        <span className="sticky-cta-title">{stickyCta.title}</span>
        <div className="sticky-cta-cmd">
          <span className="cmd-prompt" aria-hidden="true">
            $
          </span>
          <code>{installCommand}</code>
        </div>
        <CopyButton className="btn btn--primary" />
      </div>
    </aside>
  );
}
