// Shell snippet with copy-to-clipboard button.
import { useClipboard } from "../lib/hooks.jsx";

export function CopyButton({ text }) {
  const { copied, copy } = useClipboard();
  return (
    <button onClick={() => copy(text)} title="copier">
      {copied ? "copié ✓" : "copier"}
    </button>
  );
}

export function Snippet({ cmd }) {
  return (
    <div className="install-snippet">
      <code>
        <span className="prompt">$</span>
        {cmd}
      </code>
      <CopyButton text={cmd} />
    </div>
  );
}
