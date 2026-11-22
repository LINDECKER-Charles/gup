import { describe, expect, it, vi } from "vitest";
import { callFeedbackService, type FetchLike } from "../../../src/core/feedback/feedback-client.js";
import { loadInstallIdentity } from "../../../src/core/feedback/install-identity.js";
import { signatureHeader } from "../../../src/core/feedback/request-signature.js";
import { isSignedBy, parseSignatureHeader } from "../../support/feedback-signature.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const SIGNED_AT = Date.parse("2026-11-20T12:00:00.000Z");
const URL_PATH = "/api/installs/3f2c8a4e-1b6d-4e2f-9a7c-5d8e0f1a2b3c/logs";

describe("request signature", () => {
  const tempDir = useTempDirs();

  async function identity() {
    return loadInstallIdentity(await tempDir("gup-signature-"))!;
  }

  it("signs the method, the origin and path, the time and the body's hash", async () => {
    const id = await identity();
    const url = `https://svc.example.test${URL_PATH}?ignored=1`;
    const body = '{"schema":1,"history":[],"logs":["é"]}';

    const authorization = signatureHeader({
      method: "POST",
      url,
      body,
      identity: id,
      signedAt: SIGNED_AT,
    });

    expect(parseSignatureHeader(authorization)).toMatchObject({
      publicKey: id.publicKey,
      ts: String(SIGNED_AT),
    });
    expect(isSignedBy({ authorization, method: "POST", url, body })).toBe(true);
    expect(isSignedBy({ authorization, method: "DELETE", url, body })).toBe(false);
    expect(isSignedBy({ authorization, method: "POST", url, body: `${body} ` })).toBe(false);
  });

  it("binds the signature to the service's origin", async () => {
    const id = await identity();
    const request = { method: "DELETE", body: "", identity: id, signedAt: SIGNED_AT };
    const real = `https://gup.example.test${URL_PATH}`;
    const elsewhere = `https://evil.example.test${URL_PATH}`;

    const forElsewhere = signatureHeader({ ...request, url: elsewhere });

    expect(forElsewhere).not.toBe(signatureHeader({ ...request, url: real }));
    expect(isSignedBy({ authorization: forElsewhere, method: "DELETE", url: real, body: "" })).toBe(
      false,
    );
  });

  it("sends the signed body as it is, with no secret anywhere in the request", async () => {
    const id = await identity();
    const fetch = vi.fn<FetchLike>(async () => ({ status: 202 }));
    const url = `https://svc.example.test${URL_PATH}`;
    const body = '{"schema":1}';

    await callFeedbackService(
      { method: "POST", url, identity: id, body, timeoutMs: 1_000, signedAt: SIGNED_AT },
      fetch,
    );

    const init = fetch.mock.calls[0]![1];
    const headers = init.headers as Record<string, string>;
    expect(init.body).toBe(body);
    expect(isSignedBy({ authorization: headers["authorization"]!, method: "POST", url, body })).toBe(
      true,
    );
    const der = id.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
    expect(JSON.stringify(init)).not.toContain(der);
  });
});
