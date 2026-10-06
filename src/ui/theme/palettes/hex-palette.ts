import type { BasePalette } from "../palette.js";

/** A theme's hand-written colours as `#RRGGBB`: every role but the derived ones. */
export type HexPalette = Readonly<Record<keyof BasePalette, string>>;
