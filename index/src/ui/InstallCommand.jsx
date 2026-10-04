/**
 * The `$ npm install -g …` box with its copy button, shared by the hero and
 * the install section. The command stays left-to-right in every locale and on
 * one line wherever it fits; a narrower box wraps it between its words, so
 * every flag stays in sight without scrolling.
 */
import { installCommand } from "../data/facts.js";
import { CodeWords } from "./CodeWords.jsx";
import { CopyButton } from "./CopyButton.jsx";

export function InstallCommand() {
  return (
    <div className="cmd">
      <p className="cmd-line">
        <span className="cmd-prompt" aria-hidden="true">
          $
        </span>
        <code dir="ltr" translate="no">
          <CodeWords text={installCommand} />
        </code>
      </p>
      <CopyButton />
    </div>
  );
}
