import { ADAPTIVE_CSS } from "./adaptive.js";
import { BASE_CSS } from "./base.js";
import { COMPONENTS_CSS } from "./components.js";
import { themeCss } from "./theme-tokens.js";

/** The report's stylesheet: themes, frame, components, then the adaptive rules (CSP-hashed). */
export const REPORT_CSS = [themeCss(), BASE_CSS, COMPONENTS_CSS, ADAPTIVE_CSS]
  .map((part) => part.trim())
  .join("\n");
