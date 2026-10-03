import {
  NONE,
  STATUS_CODES,
  UPDATE_FLAGS,
  UPDATE_ROW,
} from "../../core/export/report-types.js";
import { REPORT_IDS } from "../report-dom.js";
import { ACTIVITY_JS } from "./app-activity.js";
import { CALENDAR_JS } from "./app-calendar.js";
import { CHARTS_JS } from "./app-charts.js";
import { CORE_JS } from "./app-core.js";
import { DRAWER_JS } from "./app-drawer.js";
import { MAIN_JS } from "./app-main.js";
import { OVERVIEW_JS } from "./app-overview.js";
import { PACKAGES_JS } from "./app-packages.js";
import { UI_JS } from "./app-ui.js";

/**
 * The report's script, assembled: one strict IIFE holding the constants it
 * shares with the server (ids, tuple positions, status codes and flags —
 * declared once, in TypeScript), then the modules in dependency order, then
 * `boot()`. The page's CSP hashes this exact text.
 */

function statusNames(): string[] {
  return Object.entries(STATUS_CODES)
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name);
}

const PRELUDE = [
  '"use strict";',
  `const NONE = ${NONE};`,
  `const IDS = ${JSON.stringify(REPORT_IDS)};`,
  `const ROW = ${JSON.stringify(UPDATE_ROW)};`,
  `const FLAGS = ${JSON.stringify(UPDATE_FLAGS)};`,
  `const STATUS = ${JSON.stringify(STATUS_CODES)};`,
  `const STATUS_NAMES = ${JSON.stringify(statusNames())};`,
].join("\n");

const MODULES = [
  CORE_JS,
  UI_JS,
  CHARTS_JS,
  OVERVIEW_JS,
  CALENDAR_JS,
  PACKAGES_JS,
  DRAWER_JS,
  ACTIVITY_JS,
  MAIN_JS,
];

export const REPORT_JS = ["(function () {", PRELUDE, ...MODULES, "boot();", "})();"].join("\n");
