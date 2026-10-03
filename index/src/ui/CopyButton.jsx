/**
 * Copies the install command. The outcome is announced through a polite
 * status region — "copied" only once the browser accepted the write, the
 * failure message otherwise — so it reaches a screen reader that is not on
 * the button. The command itself stays visible and selectable beside it.
 */
import { installCommand } from "../data/facts.js";
import { useI18n } from "../i18n/use-i18n.js";
import { useClipboard } from "../lib/use-clipboard.js";
import { Icon } from "./Icon.jsx";

const ANNOUNCEMENT = { idle: null, copied: "copyStatus", failed: "copyFailed" };

export function CopyButton() {
  const { common } = useI18n().messages;
  const { state, copy } = useClipboard();
  const announcement = ANNOUNCEMENT[state];

  return (
    <>
      <button
        type="button"
        className="btn btn--primary cmd-copy"
        aria-label={common.copyLabel}
        onClick={() => copy(installCommand)}
      >
        <Icon name={state === "copied" ? "check" : "copy"} />
        <span>{state === "copied" ? common.copied : common.copy}</span>
      </button>
      <span className="sr-only" role="status">
        {announcement ? common[announcement] : ""}
      </span>
    </>
  );
}
