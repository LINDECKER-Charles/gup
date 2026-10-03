import { adminBatchModule } from "../admin-batch.js";
import { doctorModule } from "../doctor.js";
import { listModule } from "../list.js";
import { menuModule } from "../menu.js";
import { updateModule } from "../update.js";
import type { CliModule } from "./cli-module.js";
import { embeddedTerminalModule } from "./embedded-terminal-module.js";
import { settingsModule } from "./settings-module.js";

/**
 * Every module of the command line, one line each, sorted by id. A feature
 * adds its module here and nowhere else: `cli.ts` registers them all and
 * runs their startup hooks in {@link CliModule.order}.
 */
export const CLI_MODULES: readonly CliModule[] = [
  adminBatchModule,
  doctorModule,
  embeddedTerminalModule,
  listModule,
  menuModule,
  settingsModule,
  updateModule,
];
