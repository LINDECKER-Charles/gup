/**
 * One labelled form control with its hint, its optional character counter and
 * its error, all tied to the control by `aria-describedby` / `aria-invalid`.
 * The ids are derived from the field name (`feedback-field-<name>`), which is also
 * how the form moves focus to the first invalid field.
 */
import { RichText } from "../ui/RichText.jsx";

const describedBy = (...ids) => ids.filter(Boolean).join(" ") || undefined;

/**
 * @param {{ name: string, label: string, optionalLabel?: string, hint?: string,
 *   error?: string, count?: { length: number, max: number, unit: string },
 *   as?: "input" | "textarea" }} props  Anything else goes to the control.
 */
export function Field({
  name,
  label,
  optionalLabel,
  hint,
  error,
  count,
  as: Control = "input",
  ...controlProps
}) {
  const id = `feedback-field-${name}`;
  const ids = {
    hint: hint ? `${id}-hint` : null,
    count: count ? `${id}-count` : null,
    error: error ? `${id}-error` : null,
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optionalLabel ? <span className="field-optional">{optionalLabel}</span> : null}
      </label>
      <Control
        id={id}
        name={name}
        className="field-control"
        aria-describedby={describedBy(ids.hint, ids.count, ids.error)}
        aria-invalid={error ? "true" : undefined}
        {...controlProps}
      />
      {hint ? (
        <p className="field-note" id={ids.hint}>
          <RichText text={hint} />
        </p>
      ) : null}
      {count ? (
        <p className="field-note field-count" id={ids.count}>
          <span dir="ltr">
            {count.length} / {count.max}
          </span>
          <span className="sr-only"> {count.unit}</span>
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={ids.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
