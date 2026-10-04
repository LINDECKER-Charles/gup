/**
 * The `$ npm install -g …` box with its copy button, shared by the hero and
 * the install section. The command scrolls inside its own box on narrow
 * screens — never the page — and stays left-to-right in every locale.
 */
import { installCommand } from "../data/facts.js";
import { CopyButton } from "./CopyButton.jsx";

export function InstallCommand() {
  return (
    <div className="cmd">
      <p className="cmd-line">
        <span className="cmd-prompt" aria-hidden="true">
          $
        </span>
        <code dir="ltr" translate="no">
          {installCommand}
        </code>
      </p>
      <CopyButton />
    </div>
  );
}
