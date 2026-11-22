/**
 * What is validated before sending and what goes into the JSON body: the
 * service's field rules, trimmed, optional fields left out when empty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../../src/feedback/build-payload.js";
import { LIMITS } from "../../src/feedback/rules.js";
import { validateFeedback } from "../../src/feedback/validate-feedback.js";

const VALID = Object.freeze({
  kind: "bug",
  title: "Crash on start",
  message: "It crashes right after the scan.",
  email: "",
  installId: "",
});

test("a minimal report is valid", () => {
  assert.deepEqual(validateFeedback(VALID), []);
});

test("title and message are measured after trimming", () => {
  assert.deepEqual(validateFeedback({ ...VALID, title: "  ab  " }), ["title"]);
  assert.deepEqual(validateFeedback({ ...VALID, message: " too short " }), ["message"]);
  assert.deepEqual(validateFeedback({ ...VALID, title: "a".repeat(LIMITS.title.max + 1) }), ["title"]);
});

test("email and install ID are optional but must be well-formed when given", () => {
  assert.deepEqual(validateFeedback({ ...VALID, email: "me@example.test" }), []);
  assert.deepEqual(validateFeedback({ ...VALID, email: "me@" }), ["email"]);
  assert.deepEqual(validateFeedback({ ...VALID, installId: "nope" }), ["installId"]);
  assert.deepEqual(
    validateFeedback({ ...VALID, installId: "123e4567-e89b-42d3-a456-426614174000" }),
    [],
  );
});

test("invalid fields come back in form order", () => {
  assert.deepEqual(validateFeedback({ ...VALID, kind: "x", title: "", email: "no" }), [
    "kind",
    "title",
    "email",
  ]);
});

test("the payload is trimmed and leaves empty optional fields out", () => {
  const payload = buildPayload({
    ...VALID,
    title: "  Crash on start ",
    locale: "fr",
    gupVersion: "",
    platform: undefined,
    startedAt: 1_700_000_000_000,
  });
  assert.deepEqual(payload, {
    kind: "bug",
    title: "Crash on start",
    message: "It crashes right after the scan.",
    locale: "fr",
    startedAt: 1_700_000_000_000,
  });
});

test("the payload carries the optional fields that are filled", () => {
  const payload = buildPayload({
    ...VALID,
    locale: "en",
    email: " me@example.test ",
    installId: "123e4567-e89b-42d3-a456-426614174000",
    gupVersion: "0.6.0",
    platform: "linux",
  });
  assert.equal(payload.email, "me@example.test");
  assert.equal(payload.gupVersion, "0.6.0");
  assert.equal(payload.platform, "linux");
  assert.equal(payload.installId, "123e4567-e89b-42d3-a456-426614174000");
});
