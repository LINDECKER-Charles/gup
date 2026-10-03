import { countPackages } from "../../commands/menu-state.js";
import type { ViewContext, ViewDefinition } from "../app/view-definition.js";
import { PackageList } from "../panels/package-list.js";
import { PackagesPanel } from "../panels/packages-panel.js";
import { updateCountFact, VIEW_LABELS } from "../text/menu-labels.js";

/**
 * Paquets: the outdated packages of the last scan, to check and update. The
 * list is rebuilt whenever the scan results change; until the first results
 * arrive the panel says a scan is running. Other views' package actions and
 * marks show here; order and Note column follow the preferences live.
 */
export function packagesView(): ViewDefinition {
  return {
    id: "packages",
    label: VIEW_LABELS.packages,
    order: 20,
    group: 0,
    create: createPackagesPanel,
    badge(context) {
      const count = countPackages(context.state.scans);
      return count > 0 ? { text: String(count), tone: "warning" } : null;
    },
    facts: (context) => [updateCountFact(countPackages(context.state.scans))],
  };
}

function createPackagesPanel(context: ViewContext): PackagesPanel {
  const panel = new PackagesPanel(
    {
      onLaunch: (packages) => void context.updates.launch(packages),
      onRescan: () => context.rescan(),
    },
    {
      actions: context.packageActions,
      markers: context.packageMarkers,
      noteColumn: () => context.preferences().noteColumn,
    },
  );
  const sort = () => context.preferences().packageSort;
  const nameOf = (providerId: string) => context.displayName(providerId);
  context.onScansChanged(() =>
    panel.setList(new PackageList(context.state.scans, nameOf, { sort })),
  );
  return panel;
}
