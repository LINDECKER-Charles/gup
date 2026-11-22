/**
 * The service origin is one constant that the form's endpoint, the CSP and
 * the docs share; VITE_FEEDBACK_API overrides it. Each case imports links.js
 * in a fresh process so the environment is read at module load, as in a build.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../..", import.meta.url));

const READ = 'import("./src/data/links.js").then((m) => process.stdout.write(m.LINKS.feedbackApi))';

function feedbackApiWith(value) {
  const env = { ...process.env };
  delete env.VITE_FEEDBACK_API;
  if (value !== undefined) env.VITE_FEEDBACK_API = value;
  return execFileSync(process.execPath, ["-e", READ], { cwd: SITE, env, encoding: "utf8" });
}

test("the production service is the default", () => {
  assert.equal(feedbackApiWith(undefined), "https://gup.charles-lindecker.com");
});

test("VITE_FEEDBACK_API overrides it, reduced to an origin", () => {
  assert.equal(feedbackApiWith("http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
});

test("a malformed override fails the build instead of shipping a broken form", () => {
  assert.throws(() => feedbackApiWith("not a url"), /./);
});
