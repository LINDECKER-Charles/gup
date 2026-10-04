/**
 * The OS of the fixture machine, whatever OS renders the screenshots:
 * views that depend on it read it from the fixtures, never from
 * `process.platform` (OpenTUI resolves its native library from that).
 */
export const FIXTURE_PLATFORM: NodeJS.Platform = "win32";
