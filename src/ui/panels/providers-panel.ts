import type { KeyPress } from "../tui/screen-host.js";
import { fit, seg, type Line } from "../tui/styled-lines.js";
import { PAGE_STEP, placeholder, type Panel, type Viewport } from "./panel.js";

export interface ProviderInfo {
  readonly id: string;
  readonly displayName: string;
  readonly installHint?: string;
}

const NAME_WIDTH = 30;

/**
 * Which providers gup found on this machine, and how to get the others.
 * Detection is slow, so it starts the first time the panel is shown: `load`
 * fetches the data and hands it to {@link setData}.
 */
export class ProvidersPanel implements Panel {
  readonly title = "Providers";
  readonly isCapturingText = false;
  readonly #load: () => void;
  #isLoadRequested = false;
  #detected: readonly ProviderInfo[] | null = null;
  #missing: readonly ProviderInfo[] = [];
  #offset = 0;

  constructor(load: () => void) {
    this.#load = load;
  }

  onShow(): void {
    if (this.#isLoadRequested) return;
    this.#isLoadRequested = true;
    this.#load();
  }

  setData(detected: readonly ProviderInfo[], missing: readonly ProviderInfo[]): void {
    this.#detected = detected;
    this.#missing = missing;
    this.#offset = 0;
  }

  hints(): string {
    return "↑↓ défiler";
  }

  render(viewport: Viewport): readonly Line[] {
    if (!this.#detected) return placeholder("détection des providers…");
    return this.allLines().slice(this.#offset, this.#offset + viewport.height);
  }

  press(key: KeyPress): void {
    const steps: Record<string, number> = {
      up: -1,
      k: -1,
      down: 1,
      j: 1,
      pageup: -PAGE_STEP,
      pagedown: PAGE_STEP,
    };
    const step = steps[key.name];
    if (step !== undefined) this.scroll(step);
  }

  click(): void {}

  scroll(step: number): void {
    this.#offset = Math.max(0, Math.min(this.#offset + step, this.allLines().length - 1));
  }

  private allLines(): Line[] {
    const detected = this.#detected ?? [];
    return [
      [seg("● ", "success"), seg(`Détectés (${detected.length})`, "strong")],
      ...detected.map((p): Line => [
        seg("  ● ", "success"),
        seg(fit(p.displayName, NAME_WIDTH)),
        seg(p.id, "muted"),
      ]),
      [],
      [seg("○ ", "muted"), seg(`Non installés / hors PATH (${this.#missing.length})`, "strong")],
      ...this.#missing.flatMap((p): Line[] => [
        [seg("  ○ ", "muted"), seg(fit(p.displayName, NAME_WIDTH)), seg(p.id, "muted")],
        ...(p.installHint ? [[seg(`      → ${p.installHint}`, "muted")]] : []),
      ]),
    ];
  }
}
