import type { InputRenderable, TextRenderable } from "@opentui/core";
import { printAnswer } from "../tui/prompt-frame.js";
import { screenHost, type PromptHost, type PromptScreen } from "../tui/prompt-host.js";
import { seg, toStyledText, type Line } from "../tui/styled-lines.js";

export interface InputOptions {
  readonly message: string;
  readonly default?: string;
  /** `true` to accept, or the message explaining why the value is refused. */
  readonly validate?: (value: string) => true | string;
}

const HINT = "entrée valider";

/**
 * Free text. Editing, cursor movement and paste come from OpenTUI's input
 * field; the value is trimmed and must pass `validate` before it resolves —
 * a refusal is shown in place and the field stays open.
 */
export async function input(options: InputOptions, host: PromptHost = screenHost): Promise<string> {
  const value = await host.run((screen) => mountInput(screen, options));
  printAnswer(options.message, value);
  return value;
}

function mountInput(screen: PromptScreen, options: InputOptions): Promise<string> {
  const { tui } = screen;
  screen.show([]);
  const { field, footer } = buildLayout(screen, options);
  field.focus();
  return new Promise<string>((resolve) => {
    field.on(tui.InputRenderableEvents.ENTER, () => {
      const value = field.value.trim();
      const verdict = options.validate?.(value) ?? true;
      if (verdict === true) resolve(value);
      else footer.content = toStyledText(tui, [[seg("└  ", "accent"), seg(verdict, "danger")]]);
    });
  });
}

/** `◆ message` / `│ [field]` / `└ hint`, the same frame as the list prompts. */
function buildLayout(
  { renderer, tui }: PromptScreen,
  options: InputOptions,
): { field: InputRenderable; footer: TextRenderable } {
  const text = (id: string, line: Line, width?: number): TextRenderable =>
    new tui.TextRenderable(renderer, {
      id,
      content: toStyledText(tui, [line]),
      ...(width !== undefined && { width }),
    });

  const field = new tui.InputRenderable(renderer, {
    id: "gup-input-field",
    value: options.default ?? "",
    flexGrow: 1,
  });
  const row = new tui.BoxRenderable(renderer, { id: "gup-input-row", flexDirection: "row" });
  row.add(text("gup-input-rail", [seg("│  ", "accent")], 3));
  row.add(field);

  const footer = text("gup-input-footer", [seg("└  ", "accent"), seg(HINT, "muted")]);
  const column = new tui.BoxRenderable(renderer, { id: "gup-input", flexDirection: "column" });
  column.add(text("gup-input-header", [seg("◆", "accent"), seg(`  ${options.message}`, "strong")]));
  column.add(row);
  column.add(footer);
  renderer.root.add(column);
  return { field, footer };
}
