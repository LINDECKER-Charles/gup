import { adminBatchModule } from "../admin-batch.js";
import { doctorModule } from "../doctor.js";
import { journalModule } from "../journal/journal-module.js";
import { listModule } from "../list.js";
import { menuModule } from "../menu.js";
import { updateModule } from "../update.js";
import type { CliModule } from "./cli-module.js";

/**
 * Every module of the command line, one line each, sorted by id. A feature
 * adds its module here and nowhere else: `cli.ts` registers them all and
 * runs their startup hooks in {@link CliModule.order}.
 */
export const CLI_MODULES: readonly CliModule[] = [
  adminBatchModule,
  doctorModule,
  journalModule,
  listModule,
  menuModule,
  updateModule,
];
