/**
 * Bug / suggestion as a segmented control: native radios (arrow keys, form
 * post and screen-reader semantics for free) dressed as two joined buttons.
 */
import { FEEDBACK_KINDS } from "./rules.js";

/**
 * @param {{ kinds: Record<string, string>, value: string,
 *   onChange: (kind: string) => void }} props
 */
export function KindField({ kinds, value, onChange }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{kinds.legend}</legend>
      <div className="seg">
        {FEEDBACK_KINDS.map((kind) => (
          <label key={kind} className="seg-option">
            <input
              type="radio"
              name="kind"
              value={kind}
              checked={value === kind}
              onChange={() => onChange(kind)}
              required
            />
            <span>{kinds[kind]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
