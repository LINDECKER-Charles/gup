import { targetKey } from "../../core/scheduler/model/schedule-target.js";
import { unseenRuns } from "../../core/scheduler/run-summary.js";
import type {
  PackageAction,
  PackageMarker,
  SidebarBadge,
  ViewDefinition,
} from "../app/view-definition.js";
import { EditorFlows } from "../panels/schedules/editor-flows.js";
import { FlowContext } from "../panels/schedules/flow-context.js";
import { PackageScheduling } from "../panels/schedules/package-flow.js";
import { ScheduleFlows } from "../panels/schedules/schedule-flows.js";
import { SchedulesPanel } from "../panels/schedules/schedules-panel.js";
import type { SchedulesPort, SchedulesSnapshot } from "../panels/schedules/schedules-port.js";
import { STATUS_GLYPHS } from "../theme/glyphs.js";
import {
  SCHEDULE_ACTION,
  SCHEDULE_MENU_LABELS,
  UNSEEN_FAILURE_BADGE,
  unseenRunsFact,
} from "../text/schedule/schedule-menu-labels.js";

/**
 * Schedules: the schedules of this machine — create them from Packages
 * (`p` on the checked packages), edit, switch on and off, delete, run now,
 * repair the OS trigger. Packages marks the packages an enabled schedule
 * covers (`∞`); the sidebar counts the enabled schedules, or shows `!` when
 * a scheduled run failed since the view was last opened, and the title bar
 * counts the runs not seen yet.
 */
export function schedulesView(port: SchedulesPort): ViewDefinition {
  let packages: PackageScheduling | null = null;
  const marker = scheduledMarker(port);
  return {
    id: "schedules",
    get label() {
      return SCHEDULE_MENU_LABELS.schedulesLabel;
    },
    order: 30,
    group: 0,
    create(context) {
      const kit = new FlowContext(context, port);
      const panel = new SchedulesPanel(port, {
        list: new ScheduleFlows(kit),
        editor: new EditorFlows(kit),
      });
      kit.attach(panel);
      packages = new PackageScheduling(kit);
      // A scan may come long after the last read: pick up runs made meanwhile.
      context.onScansChanged(() => port.reload());
      return panel;
    },
    badge: () => badgeOf(port.snapshot()),
    facts: () => factsOf(port.snapshot()),
    packageActions: () => (packages ? [scheduleAction(packages)] : []),
    packageMarkers: () => [marker],
  };
}

function scheduleAction(packages: PackageScheduling): PackageAction {
  return {
    ...SCHEDULE_ACTION,
    run: (selection) => void packages.schedule(selection),
  };
}

function badgeOf(snapshot: SchedulesSnapshot): SidebarBadge | null {
  if (unseenRuns(snapshot).failures > 0) return { text: UNSEEN_FAILURE_BADGE, tone: "warning" };
  const enabled = snapshot.schedules.filter((schedule) => schedule.enabled).length;
  return enabled > 0 ? { text: String(enabled), tone: "muted" } : null;
}

function factsOf(snapshot: SchedulesSnapshot): readonly string[] {
  const { runs, failures } = unseenRuns(snapshot);
  return runs > 0 ? [unseenRunsFact(runs, failures)] : [];
}

/**
 * `∞` on the packages an enabled schedule names — matched like a run
 * matches them, case aside. The keys are worked out once per read of the
 * schedules: Packages asks for every row at every frame.
 */
function scheduledMarker(port: SchedulesPort): PackageMarker {
  let known: { snapshot: SchedulesSnapshot; keys: ReadonlySet<string> } | null = null;
  const keys = (): ReadonlySet<string> => {
    const snapshot = port.snapshot();
    if (known?.snapshot !== snapshot) known = { snapshot, keys: scheduledKeys(snapshot) };
    return known.keys;
  };
  return {
    glyphFor(providerId, pkg) {
      const key = targetKey({ providerId, packageId: pkg.id }).toLowerCase();
      return keys().has(key) ? STATUS_GLYPHS.scheduled : null;
    },
  };
}

function scheduledKeys(snapshot: SchedulesSnapshot): ReadonlySet<string> {
  const enabled = snapshot.schedules.filter((schedule) => schedule.enabled);
  return new Set(
    enabled.flatMap((schedule) => schedule.targets.map((t) => targetKey(t).toLowerCase())),
  );
}
