import type { InstallSummary } from "../../../ports/install-reader.js";
import { ToolFailure } from "../tool-failure.js";
import type { ToolContext } from "../tool-spec.js";

/** The install (IDs are stored lower case), or the tool error a model can act on. */
export async function findInstall(
  context: ToolContext,
  installId: string,
): Promise<InstallSummary> {
  const id = installId.toLowerCase();
  const install = await context.journals.find(id);
  if (install === null) {
    throw new ToolFailure(`No shared journals for install ${id}: it never uploaded, `
      + "withdrew its consent, or everything it sent was purged.");
  }
  return install;
}
