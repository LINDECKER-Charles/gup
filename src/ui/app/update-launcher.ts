import type { SelectedPackage } from "../../core/types.js";
import type { UpdateReport } from "../../core/update/update-report.js";

/** How the menu updates packages a view hands it. */
export interface UpdateLauncher {
  /** True while an update runs inside the screen. */
  readonly isRunning: boolean;
  /**
   * Update `packages`. Never rejects. Resolves with the report of an update
   * that ran inside the screen, or null when the user declined or the update
   * runs outside it (the session then ends).
   */
  launch(packages: readonly SelectedPackage[]): Promise<UpdateReport | null>;
}
