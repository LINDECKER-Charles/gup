/**
 * `process.platform` switching for any suite (the fake machine of the
 * providers project builds on it). Replaces the per-file copies of
 * `Object.defineProperty(process, "platform", …)`.
 */

const HOST_SLOT = Symbol.for("gup.tests.hostPlatform");

type HostSlot = { [HOST_SLOT]?: PropertyDescriptor };

/**
 * The real `process.platform` descriptor, captured the first time this module
 * is evaluated in a worker and kept on `globalThis`: modules are re-evaluated
 * for every test file, and a file that forgot to restore must not turn a
 * simulated platform into the next file's "original".
 */
const HOST_DESCRIPTOR: PropertyDescriptor = ((globalThis as HostSlot)[HOST_SLOT] ??=
  Object.getOwnPropertyDescriptor(process, "platform") ?? {
    value: process.platform,
    configurable: true,
    enumerable: true,
    writable: false,
  });

/** The platform the worker really runs on. */
export const HOST_PLATFORM = HOST_DESCRIPTOR.value as NodeJS.Platform;

/** Make `process.platform` report `platform` until {@link restorePlatform}. */
export function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { ...HOST_DESCRIPTOR, value: platform });
}

/** Put the real `process.platform` back. Safe to call when nothing was changed. */
export function restorePlatform(): void {
  Object.defineProperty(process, "platform", HOST_DESCRIPTOR);
}
