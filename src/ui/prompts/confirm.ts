import { framePrompt, printAnswer } from "../tui/prompt-frame.js";
import {
  screenHost,
  type InteractiveView,
  type KeyPress,
  type PromptHost,
} from "../tui/prompt-host.js";
import { seg, type Line } from "../tui/styled-lines.js";

export interface ConfirmOptions {
  readonly message: string;
  readonly default?: boolean;
}

const HINT = "o / n · ←→ changer · entrée valider";
const YES_KEYS = new Set(["o", "y"]);
const NO_KEYS = new Set(["n"]);
const SWITCH_KEYS = new Set(["left", "right", "tab", "h", "l"]);

/** Yes/no question. `o`/`y` and `n` answer at once; Enter takes the highlighted side. */
export async function confirm(
  options: ConfirmOptions,
  host: PromptHost = screenHost,
): Promise<boolean> {
  const view = new ConfirmView(options);
  const answer = await host.run((screen) => screen.interact(view));
  printAnswer(options.message, answer ? "oui" : "non");
  return answer;
}

class ConfirmView implements InteractiveView<boolean> {
  readonly #message: string;
  #isYes: boolean;
  #answer: { value: boolean } | undefined;

  constructor(options: ConfirmOptions) {
    this.#message = options.message;
    this.#isYes = options.default ?? true;
  }

  get answer(): { value: boolean } | undefined {
    return this.#answer;
  }

  press(key: KeyPress): void {
    if (key.ctrl) return;
    if (YES_KEYS.has(key.name)) this.#answer = { value: true };
    else if (NO_KEYS.has(key.name)) this.#answer = { value: false };
    else if (SWITCH_KEYS.has(key.name)) this.#isYes = !this.#isYes;
    else if (key.name === "return" || key.name === "enter") this.#answer = { value: this.#isYes };
  }

  render(): readonly Line[] {
    const option = (label: string, isOn: boolean): Line =>
      isOn ? [seg("● ", "success"), seg(label, "strong")] : [seg(`○ ${label}`, "muted")];
    const body: Line = [...option("Oui", this.#isYes), seg("   "), ...option("Non", !this.#isYes)];
    return framePrompt(this.#message, [body], HINT);
  }
}
