/**
 * Contract of the inline JSON block that carries a page's resolved messages
 * from the prerender (build/html/render-page.mjs) to the client entry
 * (./read-bootstrap.js). Bump `version` whenever the payload shape changes.
 */
export const BOOTSTRAP = Object.freeze({ elementId: "gup-boot", version: 1 });
