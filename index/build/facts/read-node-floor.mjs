/**
 * The Node floor the site states, read from src/core/node-floor.ts: the
 * `MIN_NODE` gup checks at start, and stops below with where to get a newer
 * Node.
 *
 * Not the root package.json's `engines.node`: that range says which Node npm
 * installs gup on, a different question gup answers differently on purpose
 * (the constant's comment says why).
 */
const MIN_NODE = /^export const MIN_NODE = "(?<version>\d+\.\d+\.\d+)";$/m;

/**
 * @param {string} source  The text of src/core/node-floor.ts.
 * @returns {string}       The exact minimum, e.g. `26.9.0`.
 */
export function readNodeFloor(source) {
  const version = MIN_NODE.exec(source)?.groups.version;
  if (!version) {
    throw new Error('read-node-floor: no `export const MIN_NODE = "x.y.z";` line');
  }
  return version;
}
