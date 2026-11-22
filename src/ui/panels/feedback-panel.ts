import { FEEDBACK_MENU_LABELS as LABELS } from "../text/feedback/feedback-menu-labels.js";
import type { KeyPress } from "../tui/screen-host.js";
import { seg, wrap, wrapLine, type Line, type Tone } from "../tui/styled-lines.js";
import type { Panel, Viewport } from "./panel.js";

/** What the Feedback view reaches outside the menu. */
export interface FeedbackPanelPort {
  /** The install ID when it exists; never creates it (drawing reads only). */
  installId(): string | null;
  /** The install ID, created when there is none; null when it can be neither read nor made. */
  createInstallId(): string | null;
  /** The prefilled form, in the interface's language; null when its override is refused. */
  formUrl(installId: string): string | null;
  /** Never rejects: false when the browser could not be opened. */
  openForm(url: string): Promise<boolean>;
  /** Copy to the terminal's clipboard; false when it cannot. */
  copy(text: string): boolean;
  /** Draw again once the browser answered. */
  redraw(): void;
}

interface Notice {
  readonly text: string;
  readonly tone: Tone;
}

const INDENT = "  ";

/**
 * Feedback: the way to the form where a bug or an idea goes, and the install
 * ID a report should quote. Enter opens the form, `c` copies the ID — either
 * creates the ID when it does not exist yet; drawing the view never does.
 * What either did shows on the last line.
 */
export class FeedbackPanel implements Panel {
  readonly isCapturingText = false;
  readonly #port: FeedbackPanelPort;
  #notice: Notice | null = null;

  constructor(port: FeedbackPanelPort) {
    this.#port = port;
  }

  get title(): string {
    return LABELS.view;
  }

  hints(): string {
    return LABELS.hints;
  }

  render(viewport: Viewport): readonly Line[] {
    const width = Math.max(1, viewport.width - INDENT.length);
    const intro = paragraph(LABELS.intro, width);
    const lines: Line[] = [[], ...intro, [], ...this.#identity(viewport.width), []];
    lines.push(...paragraph(LABELS.idIntro, width));
    if (this.#notice) lines.push([], [seg(`${INDENT}${this.#notice.text}`, this.#notice.tone)]);
    return lines;
  }

  press(key: KeyPress): void {
    if (key.name === "return" || key.name === "enter") this.#openForm();
    else if (key.name === "c") this.#copyId();
  }

  click(): void {
    this.#openForm();
  }

  scroll(): void {
    // A few lines: nothing to scroll.
  }

  /** The ID and the form's address once the ID exists; a word on how it gets created before. */
  #identity(width: number): Line[] {
    const installId = this.#port.installId();
    if (installId === null) return [[seg(`${INDENT}${LABELS.idPending}`, "muted")]];
    const idLine: Line = [seg(`${INDENT}${LABELS.installId(installId)}`, "strong")];
    const url = this.#port.formUrl(installId);
    if (url === null) return [idLine];
    return [idLine, ...wrapLine([seg(`${INDENT}${LABELS.form(url)}`, "muted")], width)];
  }

  #openForm(): void {
    const installId = this.#port.createInstallId();
    if (installId === null) return this.#warn(LABELS.noIdentity);
    const url = this.#port.formUrl(installId);
    if (url === null) return this.#warn(LABELS.formRefused);
    void this.#port.openForm(url).then((isOpened) => {
      this.#notice = isOpened
        ? { text: LABELS.opened, tone: "success" }
        : { text: LABELS.openFailed, tone: "warning" };
      this.#port.redraw();
    });
  }

  #copyId(): void {
    const installId = this.#port.createInstallId();
    if (installId === null) return this.#warn(LABELS.noIdentity);
    this.#notice = this.#port.copy(installId)
      ? { text: LABELS.copied, tone: "success" }
      : { text: LABELS.copyFailed, tone: "warning" };
  }

  #warn(text: string): void {
    this.#notice = { text, tone: "warning" };
  }
}

function paragraph(text: string, width: number): Line[] {
  return wrap(text, width).map((line) => [seg(`${INDENT}${line}`)]);
}
