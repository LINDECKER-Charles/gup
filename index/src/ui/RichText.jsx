/**
 * Renders a catalog string's inline markup as elements — never through
 * dangerouslySetInnerHTML. Code spans are LTR and marked `translate="no"`, so
 * neither the bidi algorithm nor a browser translator mangles a command.
 */
import { Fragment } from "react";
import { parseRich } from "../i18n/parse-rich.js";

const RENDER = {
  text: (value) => value,
  code: (value) => (
    <code dir="ltr" translate="no">
      {value}
    </code>
  ),
  strong: (value) => <strong>{value}</strong>,
  kbd: (value) => <kbd>{value}</kbd>,
};

/** @param {{ text: string }} props */
export function RichText({ text }) {
  return parseRich(text).map((token, index) => (
    <Fragment key={index}>{RENDER[token.kind](token.value)}</Fragment>
  ));
}
