import { SharingControl } from "./sharing-control.js";

let instance: SharingControl | null = null;

/**
 * The process's one {@link SharingControl}: the menu and the feedback module
 * share it, so an erasure the Options row starts is one the module waits for
 * before the process exits.
 */
export function processSharing(): SharingControl {
  return (instance ??= new SharingControl());
}
