/**
 * Copies the install command to the clipboard.
 *
 * The confirmation is announced through an `aria-live="polite"` region rather
 * than only swapping the label, so it reaches a screen reader that is not
 * focused on the button.
 */
import { useClipboard } from "../lib/hooks.jsx";
import { Copy } from "../lib/icons.jsx";
import { installCommand } from "../data/facts.js";

export function CopyButton({ className = "", label = "Copier", showState = false }) {
  const { copied, copy } = useClipboard();

  return (
    <button
      type="button"
      className={className}
      onClick={() => copy(installCommand)}
      aria-label={`Copier la commande d'installation : ${installCommand}`}
    >
      <span className="btn-sheen" aria-hidden="true" />
      <Copy />
      <span>{showState ? label : copied ? "Copié !" : label}</span>
      {showState ? (
        <span className="hero-copy-state">{copied ? "Copié !" : ""}</span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Commande copiée dans le presse-papiers" : ""}
      </span>
    </button>
  );
}
