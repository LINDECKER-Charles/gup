import type { SelectedPackage } from "../types.js";
import type { PlannedUpdate, UpdatePlan, UpdateRequest } from "./update-ports.js";

/** One request per picked package, carrying its scan entry (and the schedule, if any). */
export function requestsFrom(
  selection: readonly SelectedPackage[],
  options: { readonly scheduleId?: string } = {},
): UpdateRequest[] {
  return selection.map(({ providerId, pkg }) => ({
    providerId,
    packageId: pkg.id,
    pkg,
    ...(options.scheduleId !== undefined && { scheduleId: options.scheduleId }),
  }));
}

/** A package's identity across a run, its retries and the UI: `providerId:packageId`. */
export function updateKeyOf(providerId: string, packageId: string): string {
  return `${providerId}:${packageId}`;
}

/**
 * Order the work: packages that need administrator rights go to one elevated
 * batch (a single UAC or sudo prompt) after the others; the others are
 * grouped by provider, providers in the order they first appear, packages in
 * request order. Pure.
 */
export function planUpdates(
  requests: readonly UpdateRequest[],
  nameOf: (providerId: string) => string,
): UpdatePlan {
  const planned = requests.map((request): PlannedUpdate => ({
    ...request,
    key: updateKeyOf(request.providerId, request.packageId),
    providerName: nameOf(request.providerId),
  }));
  const isElevated = (item: PlannedUpdate): boolean => item.pkg?.requiresAdmin === true;
  return {
    direct: groupByProvider(planned.filter((item) => !isElevated(item))),
    elevated: planned.filter(isElevated),
  };
}

/** Items of one provider together, providers in first-appearance order, stable within. */
export function groupByProvider(items: readonly PlannedUpdate[]): PlannedUpdate[] {
  const groups = new Map<string, PlannedUpdate[]>();
  for (const item of items) {
    groups.set(item.providerId, [...(groups.get(item.providerId) ?? []), item]);
  }
  return [...groups.values()].flat();
}
