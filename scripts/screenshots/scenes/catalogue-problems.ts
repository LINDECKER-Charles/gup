import { SCENE_ID, type Scene } from "./scene.js";

/** Alt text GitHub and screen readers handle well. */
const MAX_ALT_LENGTH = 250;
/** Sizes a docs page can show without scaling the text below readable. */
const COLS = { min: 80, max: 140 } as const;
const ROWS = { min: 20, max: 40 } as const;

function isWithin(value: number, range: { readonly min: number; readonly max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function problemsOf(scene: Scene, isDuplicate: boolean): string[] {
  const { cols, rows } = scene.size;
  const alt = scene.alt.trim();
  return [
    ...(SCENE_ID.test(scene.id) ? [] : ["the id is not kebab-case"]),
    ...(isDuplicate ? ["the id is used twice"] : []),
    ...(alt === "" || alt.length > MAX_ALT_LENGTH
      ? [`the alt text must hold 1 to ${MAX_ALT_LENGTH} characters`]
      : []),
    ...(isWithin(cols, COLS) && isWithin(rows, ROWS)
      ? []
      : [`${cols} × ${rows} is outside ${COLS.min}–${COLS.max} × ${ROWS.min}–${ROWS.max}`]),
  ];
}

/**
 * What is wrong with the catalogue, one line per problem: ids must be unique
 * kebab-case file stems (checked before any path is built from them), alt
 * texts present and short, sizes readable on a docs page.
 */
export function catalogueProblems(scenes: readonly Scene[]): string[] {
  const seen = new Set<string>();
  return scenes.flatMap((scene) => {
    const problems = problemsOf(scene, seen.has(scene.id));
    seen.add(scene.id);
    return problems.map((problem) => `${scene.id}: ${problem}`);
  });
}
