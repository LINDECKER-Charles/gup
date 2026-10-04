/**
 * Child process of batch-lock.test.ts: takes the update batch as a scheduled
 * run would, says so on stdout, then idles until it is killed — so the test
 * can check that the operating system, not gup, releases the lock.
 * Usage: node --import tsx batch-lock-holder.ts <scheduler-dir>
 */
import { BatchLock, batchLockLocation } from "../../../src/core/update/batch-lock.js";

const [schedulerDir] = process.argv.slice(2);
if (!schedulerDir) throw new Error("usage: batch-lock-holder <scheduler-dir>");

const location = batchLockLocation({ env: { GUP_SCHEDULER_DIR: schedulerDir } });
if (!location) throw new Error("no lock location");
const lock = await BatchLock.tryAcquire(location, "scheduled");
process.stdout.write(lock instanceof BatchLock ? "held\n" : "busy\n");
// Keep the event loop busy: the lock's server is unref'd on purpose.
setInterval(() => {}, 60_000);
