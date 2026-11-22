/**
 * The fields the reader never types: page context for the service and the
 * honeypot. Context inputs are `disabled` while empty, which keeps them out
 * of a plain form post (an empty `startedAt` would read as a malformed
 * value); the honeypot is hidden from sight and from assistive technology and
 * left out of the tab order, so only a bot fills it.
 */

/**
 * @param {{ locale: string, returnTo: string, startedAt: number | null,
 *   context: { gupVersion?: string, platform?: string } }} props
 */
export function HiddenFields({ locale, returnTo, startedAt, context }) {
  const { gupVersion = "", platform = "" } = context;

  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="startedAt" value={startedAt ?? ""} disabled={startedAt === null} />
      <input type="hidden" name="gupVersion" value={gupVersion} disabled={!gupVersion} />
      <input type="hidden" name="platform" value={platform} disabled={!platform} />
      <div className="feedback-trap" aria-hidden="true">
        <label translate="no">
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
    </>
  );
}
