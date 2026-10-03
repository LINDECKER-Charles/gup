import { DEFAULT_TIME } from "../../../core/scheduler/model/recurrence.js";
import { targetKey } from "../../../core/scheduler/model/schedule-target.js";
import type { ScheduleDraft, ScheduleTarget } from "../../../core/scheduler/model/types.js";
import {
  defaultScheduleName,
  type ValidationIssue,
} from "../../../core/scheduler/model/validate-schedule.js";
import type { SelectedPackage } from "../../../core/types.js";
import { recurrenceLabel } from "../../text/schedule/schedule-labels.js";
import {
  EDITOR_TEXT,
  LEAVE_DIALOG,
  SCHEDULE_PACKAGES,
} from "../../text/schedule/schedule-menu-labels.js";
import type { DialogChoice } from "../../tui/dialog.js";
import { seg, type Line } from "../../tui/styled-lines.js";
import type { FlowContext } from "./flow-context.js";
import { seedOf } from "./schedule-editor.js";

/**
 * `p` in Paquets: schedule the checked packages — in a new schedule (the
 * editor opens on them in Planification) or added to an existing one. A
 * row that stands for a whole provider is never scheduled, nor a package of
 * a provider that needs an administrator for every update: they are left
 * out with the reason, the second place the "packages, never a provider"
 * rule is enforced (after the model, before the run).
 */

/** How a target's problem is filed: `target:<index in the draft>`. */
const TARGET_FIELD = "target:";

type Destination = { readonly kind: "new" } | { readonly kind: "add"; readonly id: string };

interface Sorted {
  readonly targets: readonly ScheduleTarget[];
  /** A warning per target key, from the scan. */
  readonly notes: ReadonlyMap<string, string>;
  /** Why each refused package cannot be scheduled. */
  readonly refusals: readonly string[];
}

export class PackageScheduling {
  readonly #kit: FlowContext;

  constructor(kit: FlowContext) {
    this.#kit = kit;
  }

  async schedule(selection: readonly SelectedPackage[]): Promise<void> {
    const sorted = this.#sort(selection);
    if (sorted.targets.length === 0) return this.#explain(sorted.refusals, selection.length);
    const destination = await this.#destination(sorted);
    if (!destination) return this.#kit.view.redraw();
    if (destination.kind === "new") return this.#create(sorted);
    await this.#addTo(destination.id, sorted);
  }

  /** The packages that may be scheduled, their warnings, and why the others may not. */
  #sort(selection: readonly SelectedPackage[]): Sorted {
    const rows = selection.filter(({ pkg }) => pkg.aggregate !== true);
    const wholeProviders = selection
      .filter(({ pkg }) => pkg.aggregate === true)
      .map(({ pkg }) => SCHEDULE_PACKAGES.wholeProvider(pkg.name ?? pkg.id));
    const candidates = rows.map(({ providerId, pkg }) => targetOf(providerId, pkg));
    const refused = refusalsByIndex(this.#kit.port.validate(draftOf(candidates)));
    const refusals = [...refused].map(([index, reason]) =>
      SCHEDULE_PACKAGES.refused(labelOf(candidates[index]), reason),
    );
    return {
      targets: candidates.filter((_, index) => !refused.has(index)),
      notes: adminNotes(rows),
      refusals: [...wholeProviders, ...refusals],
    };
  }

  /** Nothing can be scheduled: say why, nothing else happens. */
  async #explain(refusals: readonly string[], count: number): Promise<void> {
    await this.#kit.view.dialogs.choose({
      title: SCHEDULE_PACKAGES.title(count),
      text: [SCHEDULE_PACKAGES.nothing, ...refusals],
      choices: [{ label: SCHEDULE_PACKAGES.close, value: true }],
    });
    this.#kit.view.redraw();
  }

  /** A new schedule, or one to add to — asked only when schedules exist. */
  async #destination(sorted: Sorted): Promise<Destination | undefined> {
    const { schedules } = this.#kit.port.snapshot();
    const create: Destination = { kind: "new" };
    if (schedules.length === 0) return create;
    const choices: DialogChoice<Destination>[] = [
      { label: SCHEDULE_PACKAGES.create, value: create },
      ...schedules.map((schedule) => ({
        label: SCHEDULE_PACKAGES.addTo(schedule.name, recurrenceLabel(schedule.recurrence)),
        value: { kind: "add", id: schedule.id } as const,
      })),
    ];
    return this.#kit.view.dialogs.choose({
      title: SCHEDULE_PACKAGES.title(sorted.targets.length),
      text: sorted.refusals,
      choices,
    });
  }

  /** The editor on a new daily schedule of these packages, in Planification. */
  async #create(sorted: Sorted): Promise<void> {
    if (!(await this.#mayReplaceEditor())) return this.#kit.view.redraw();
    this.#kit.panel.openEditor({ draft: draftOf(sorted.targets), notes: sorted.notes });
    this.#show(sorted.refusals.map((refusal): Line => [seg(refusal, "warning")]));
  }

  /** The packages added to `id`; the editor opens instead when the result needs fixing. */
  async #addTo(id: string, sorted: Sorted): Promise<void> {
    const kit = this.#kit;
    const schedule = kit.port.snapshot().schedules.find((candidate) => candidate.id === id);
    if (!schedule) return this.#show([]);
    const fresh = sorted.targets.filter((target) => !includes(schedule.targets, target));
    if (fresh.length === 0) {
      return this.#show([[seg(SCHEDULE_PACKAGES.alreadyThere(schedule.name), "muted")]]);
    }
    const draft = { ...seedOf(schedule).draft, targets: [...schedule.targets, ...fresh] };
    if (kit.port.validate(draft, id).length > 0) {
      kit.panel.openEditor({ id, draft, notes: sorted.notes });
      return this.#show([[seg(EDITOR_TEXT.fixFirst, "danger")]]);
    }
    if (schedule.enabled && !(await kit.consent())) return kit.view.redraw();
    kit.panel.select(id);
    this.#kit.view.show("schedules");
    await kit.change(
      () => kit.port.replace(id, draft),
      (saved) => [seg(SCHEDULE_PACKAGES.added(fresh.length, saved.name), "success")],
    );
  }

  /** An editor already open with changes is only replaced once the user agrees. */
  async #mayReplaceEditor(): Promise<boolean> {
    if (!this.#kit.panel.editor?.isDirty) return true;
    return this.#kit.view.dialogs.confirm({
      title: LEAVE_DIALOG.title,
      text: [LEAVE_DIALOG.text],
      default: false,
    });
  }

  /** Planification in front, with `notice` above it. */
  #show(notice: readonly Line[]): void {
    this.#kit.view.show("schedules");
    this.#kit.notify(notice);
  }
}

/** The validation problems of single packages, by their index in the draft. */
function refusalsByIndex(issues: readonly ValidationIssue[]): Map<number, string> {
  const refused = new Map<number, string>();
  for (const issue of issues) {
    if (issue.field.startsWith(TARGET_FIELD)) {
      refused.set(Number(issue.field.slice(TARGET_FIELD.length)), issue.message);
    }
  }
  return refused;
}

/** Packages the scan says need an administrator: kept, with a warning (they will be skipped). */
function adminNotes(rows: readonly SelectedPackage[]): Map<string, string> {
  const notes = new Map<string, string>();
  for (const { providerId, pkg } of rows) {
    if (!pkg.requiresAdmin) continue;
    notes.set(targetKey({ providerId, packageId: pkg.id }), EDITOR_TEXT.adminNote);
  }
  return notes;
}

function targetOf(providerId: string, pkg: SelectedPackage["pkg"]): ScheduleTarget {
  const label = pkg.name !== undefined && pkg.name !== pkg.id ? { label: pkg.name } : {};
  return { providerId, packageId: pkg.id, ...label };
}

function labelOf(target: ScheduleTarget | undefined): string {
  return target ? (target.label ?? target.packageId) : "";
}

/** A new schedule's defaults: daily at 09:00, enabled, catching up, named after its packages. */
function draftOf(targets: readonly ScheduleTarget[]): ScheduleDraft {
  return {
    name: defaultScheduleName(targets),
    recurrence: { kind: "daily", at: DEFAULT_TIME },
    targets,
    enabled: true,
    options: { catchUp: true },
  };
}

function includes(targets: readonly ScheduleTarget[], target: ScheduleTarget): boolean {
  const key = targetKey(target).toLowerCase();
  return targets.some((existing) => targetKey(existing).toLowerCase() === key);
}
