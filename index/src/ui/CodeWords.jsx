/**
 * A command's words, each kept whole. A command too long for its line wraps
 * between its words, never after the hyphen of a flag (`--allow-` then
 * `scripts=node-pty`) nor inside a package name. The spaces stay real text,
 * so a selection copies the command as written.
 */
import { Fragment } from "react";

/** @param {{ text: string }} props */
export function CodeWords({ text }) {
  return text.split(" ").map((word, index) => (
    <Fragment key={index}>
      {index > 0 ? " " : null}
      <span className="code-word">{word}</span>
    </Fragment>
  ));
}
