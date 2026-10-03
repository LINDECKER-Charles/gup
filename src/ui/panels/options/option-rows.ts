import type { InterfaceSettings } from "../../settings/interface-section.js";
import { seg, type Line } from "../../tui/styled-lines.js";
import { SWITCH_VALUES } from "../../text/settings/options-labels.js";
import type { OptionRow, OptionsControls, OptionsHost } from "./option-row.js";

/**
 * The kind of setting row most sections are made of: a choice among a few
 * values — Entrée cycles forward, ← → step either way; an on/off switch is a
 * choice of two, so any of them flips it.
 */

export interface Choice<T> {
  readonly value: T;
  readonly label: string;
}

export interface ChoiceRowSpec<T> {
  readonly id: string;
  readonly label: string;
  readonly choices: readonly Choice<T>[];
  read(): T;
  write(value: T): void;
  /** Muted text after the value. */
  readonly hint: string;
}

/** Choices built from a value → label record, in the record's order. */
export function choicesOf<T extends string>(labels: Readonly<Record<T, string>>): Choice<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

/** `ON` / `OFF`, or the given words for true and false. */
export function switchChoices(
  labels: { readonly on: string; readonly off: string } = SWITCH_VALUES,
): Choice<boolean>[] {
  return [
    { value: true, label: labels.on },
    { value: false, label: labels.off },
  ];
}

export function choiceRow<T>(spec: ChoiceRowSpec<T>): OptionRow {
  const indexOf = (): number =>
    Math.max(
      0,
      spec.choices.findIndex((choice) => choice.value === spec.read()),
    );
  const step = (direction: -1 | 1): void => {
    const count = spec.choices.length;
    const next = spec.choices[(indexOf() + direction + count) % count];
    if (next) spec.write(next.value);
  };
  return {
    id: spec.id,
    label: spec.label,
    value: () => spec.choices[indexOf()]?.label ?? "",
    hint: (): Line => [seg(spec.hint, "muted")],
    isEnabled: () => true,
    activate: () => step(1),
    step,
  };
}

/** A row the section builds once it has the panel's controls and the host. */
export type RowBuilder = (controls: OptionsControls, host: OptionsHost) => OptionRow;

/** A choice row over one field of the `interface` settings. */
export interface InterfaceRowSpec<T> {
  readonly id: string;
  readonly label: string;
  readonly choices: readonly Choice<T>[];
  readonly hint: string;
  read(settings: InterfaceSettings): T;
  patch(value: T): Partial<InterfaceSettings>;
  /** What else changes at once (the mouse on this screen). */
  apply?(value: T, host: OptionsHost): void;
}

export function interfaceRow<T>(spec: InterfaceRowSpec<T>): RowBuilder {
  return (controls, host) =>
    choiceRow({
      id: spec.id,
      label: spec.label,
      choices: spec.choices,
      hint: spec.hint,
      read: () => spec.read(host.settings.get("interface")),
      write: (value) => {
        controls.save(() => host.settings.update("interface", spec.patch(value)));
        spec.apply?.(value, host);
      },
    });
}
