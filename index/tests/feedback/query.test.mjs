/**
 * What the page reads from its URL: the CLI's prefill (validated with the
 * service's rules — a link can fill nothing the service would refuse) and the
 * outcome a plain form post is redirected back with.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { prefillFromQuery } from "../../src/feedback/prefill-from-query.js";
import { statusFromQuery, withoutStatus } from "../../src/feedback/status-from-query.js";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

test("prefill takes a valid install ID, version and platform", () => {
  const search = `?install=${UUID.toUpperCase()}&version=0.6.0-beta.1%2Bbuild&platform=win32`;
  assert.deepEqual(prefillFromQuery(search), {
    installId: UUID,
    gupVersion: "0.6.0-beta.1+build",
    platform: "win32",
  });
});

test("prefill drops every value the service would refuse", () => {
  const search = `?install=not-a-uuid&version=${"1".repeat(33)}&platform=beos`;
  assert.deepEqual(prefillFromQuery(search), {});
  assert.deepEqual(prefillFromQuery("?version=1.0%20%3Cscript%3E&install=123e4567-e89b-12d3-a456-426614174000"), {});
});

test("prefill keeps the valid parameters when others are bad", () => {
  assert.deepEqual(prefillFromQuery(`?install=${UUID}&platform=nope&version=0.6.0`), {
    installId: UUID,
    gupVersion: "0.6.0",
  });
});

test("prefill of an empty or foreign query is empty", () => {
  assert.deepEqual(prefillFromQuery(""), {});
  assert.deepEqual(prefillFromQuery("?utm_source=x"), {});
});

test("status is read from the redirect's feedback parameter", () => {
  for (const status of ["sent", "invalid", "limited"]) {
    assert.equal(statusFromQuery(`?feedback=${status}`), status);
  }
  assert.equal(statusFromQuery("?feedback=hacked"), null);
  assert.equal(statusFromQuery(""), null);
});

test("the status parameter is removed, the rest of the URL kept", () => {
  const href = `https://example.test/gup/fr/?install=${UUID}&feedback=sent#feedback`;
  assert.equal(withoutStatus(href), `https://example.test/gup/fr/?install=${UUID}#feedback`);
});
