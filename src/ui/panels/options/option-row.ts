import type { MenuState } from "../../../commands/menu-state.js";
import type { SettingsService } from "../../settings/settings-service.js";
import type { ThemeSettings } from "../../settings/theme-section.js";
import type { Density } from "../../theme/appearance.js";
import type { ResolvedTheme, ThemeAvailability } from "../../theme/resolve-theme.js";
import type { DialogLayer } from "../../tui/dialog.js";
import type { KeyPress } from "../../tui/screen-host.js";
import type { Line } from "../../tui/styled-lines.js";
import type { Viewport } from "../panel.js";

/**
 * The building blocks of the Options view. The view is a list of sections
 * (APPEARANCE, BEHAVIOR…), each a list of rows; a row may open a sub-view in
 * place of the list (theme picker, colour editor, provider filter). Sections
 * are built by factories, so another feature adds its own (journal settings)
 * without editing the panel: `optionsView({ extraSections })`.
 */

/** One setting: `Label   [value]   hint`. */
export interface OptionRow {
  /** Stable within the view: the cursor follows it. */
  readonly id: string;
  readonly label: string;
  /** Shown as `[value]`; empty for an action row ("Reset…"). */
  value(): string;
  /**
   * After the value: an explanation, a status, or why the row is disabled.
   * Given `room` — the columns left for it on its row, or the width of the
   * line under the list — a hint that can say the same in fewer (a path cut
   * in its middle) fits them; any other is cut at its end on its row and
   * wrapped under the list.
   */
  hint(room?: number): Line;
  isEnabled(): boolean;
  /** Enter, Space or a click: toggle, cycle forward, open a sub-view or a dialog. */
  activate(): void;
  /** ← → ; absent, the row does not step and the arrows keep their menu meaning. */
  step?(direction: -1 | 1): void;
}

/** A key a section answers in the main list wherever the cursor is (`c` copies the path). */
export interface OptionShortcut {
  readonly key: string;
  /** Shown in the key-hint bar: "c copy path". */
  readonly hint: string;
  run(): void;
}

export interface OptionSection {
  readonly id: string;
  /** "APPEARANCE", read when the panel is built. */
  readonly title: string;
  rows(): readonly OptionRow[];
  shortcuts?(): readonly OptionShortcut[];
}

/** A screen shown in place of the list until it closes itself. */
export interface OptionsView {
  /** Appended to the panel's: "Options › Theme". */
  readonly title: string;
  hints(): string;
  render(viewport: Viewport): readonly Line[];
  press(key: KeyPress): void;
  click(row: number, viewport: Viewport): void;
}

/** What the panel offers its sections. */
export interface OptionsControls {
  open(view: OptionsView): void;
  close(): void;
  /**
   * Run a settings write. A failure to persist (locked file, read-only
   * section) becomes the notice line above the list — the value stays in
   * effect for the session; any other error propagates. True when saved.
   */
  save(write: () => void): boolean;
  /** A line above the list until the next save. */
  notify(notice: Line): void;
  /** A setting that changes what a scan finds was changed: offer `r`. */
  scanSettingsChanged(): void;
}

/** The theme engine, as the Options view drives it. */
export interface AppearanceControl {
  /** The theme painted now: the preview while one is shown. */
  resolved(): ResolvedTheme;
  /** Paint the whole app with `theme` until `endPreview`; nothing is saved. */
  preview(theme: ThemeSettings): void;
  endPreview(): void;
  /** Every theme as it would resolve on this terminal with the saved settings. */
  availability(): readonly ThemeAvailability[];
}

export type OptionsDialogs = Pick<DialogLayer, "ask" | "choose" | "confirm">;

/** The rest of gup, as the Options view sees it. Built once per menu session. */
export interface OptionsHost {
  readonly settings: SettingsService;
  readonly appearance: AppearanceControl;
  /** The session's scan settings and detected providers. */
  readonly state: MenuState;
  readonly dialogs: OptionsDialogs;
  /** Read for `GUP_INSTALL_TIMEOUT`, which wins over the file. */
  readonly env: NodeJS.ProcessEnv;
  /** The screen's density now: compact lists drop the blank rows between sections. */
  density(): Density;
  rescan(): void;
  /** Copy to the terminal's clipboard (OSC 52); false when the terminal cannot. */
  copyToClipboard(text: string): boolean;
  /** Mouse on or off on this screen now; the next screens read the setting. */
  setMouse(isOn: boolean): void;
  /** Draw again after something asynchronous (a dialog's answer). */
  redraw(): void;
}

export type SectionFactory = (controls: OptionsControls, host: OptionsHost) => OptionSection;
