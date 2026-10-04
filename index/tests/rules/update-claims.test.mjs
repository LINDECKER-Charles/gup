/**
 * Where updates run, as the page's headline copy says it. They run in a
 * terminal embedded in gup's interface, with two exceptions the copy must not
 * deny: on Windows the administrator batch installs in its own UAC window,
 * and without an embedded terminal gup updates in the user's own terminal.
 * The English catalog is every translation's source, so it is the one held
 * to this; the translations follow it through the back-translation pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGS } from "../../build/i18n/load-catalogs.mjs";

const { meta, hero } = CATALOGS.en;
const HEADLINES = { "meta.ogDescription": meta.ogDescription, "hero.lead": hero.lead };

test("the headline copy says where updates run, with no \"without ever leaving\"", () => {
  for (const [path, text] of Object.entries(HEADLINES)) {
    assert.match(text, /terminal embedded in its interface/, path);
    assert.doesNotMatch(text, /without (ever )?leaving/i, path);
  }
});
