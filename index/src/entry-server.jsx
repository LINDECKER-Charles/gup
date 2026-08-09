/**
 * Prerender entry, consumed by scripts/prerender.mjs.
 *
 * WHY PRERENDER: this is a client-rendered Vite app on GitHub Pages, so
 * without this step the shipped HTML is an empty <div id="root">. Google does
 * render JavaScript, but it does so on a second pass with no guaranteed
 * budget, and the AI answer engines this project explicitly courts through
 * llms.txt (ChatGPT, Perplexity, Claude) largely do not render at all. The
 * previous workaround was a hand-written static skeleton inside #root that
 * drifted out of sync with the real page — different H1, stale counts, links
 * the rendered footer no longer had. Rendering the actual component tree
 * removes the class of bug rather than the instance.
 */
import { renderToString } from "react-dom/server";
import { Page } from "./Page.jsx";

export function render() {
  return renderToString(<Page />);
}
