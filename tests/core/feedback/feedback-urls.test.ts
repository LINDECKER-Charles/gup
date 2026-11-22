import { describe, expect, it } from "vitest";
import { currentClientInfo } from "../../../src/core/feedback/client-info.js";
import { FeedbackUrls, type FormContext } from "../../../src/core/feedback/feedback-urls.js";

const INSTALL_ID = "3f2c8a4e-1b6d-4e2f-9a7c-5d8e0f1a2b3c";
const PRODUCTION = "https://gup.charles-lindecker.com";

function context(client: Partial<FormContext["client"]> = {}): FormContext {
  return {
    installId: INSTALL_ID,
    client: { locale: "en", gupVersion: "0.6.0", platform: "win32", ...client },
  };
}

describe("FeedbackUrls.formUrl", () => {
  it("opens the English form at the landing's root, prefilled, on its feedback section", () => {
    expect(new FeedbackUrls({}).formUrl(context())).toBe(
      `https://lindecker-charles.github.io/gup/?install=${INSTALL_ID}` +
        "&version=0.6.0&platform=win32#feedback",
    );
  });

  it("opens the French form under fr/", () => {
    const url = new URL(new FeedbackUrls({}).formUrl(context({ locale: "fr" }))!);

    expect(url.pathname).toBe("/gup/fr/");
    expect(url.hash).toBe("#feedback");
  });

  it("encodes the query", () => {
    const url = new URL(new FeedbackUrls({}).formUrl(context({ gupVersion: "1.0.0-rc.1+b&x" }))!);

    expect(url.searchParams.get("version")).toBe("1.0.0-rc.1+b&x");
    expect(url.searchParams.get("install")).toBe(INSTALL_ID);
  });

  it("follows GUP_FEEDBACK_FORM, a dev server on this machine included", () => {
    const urls = new FeedbackUrls({ GUP_FEEDBACK_FORM: "http://127.0.0.1:5173" });

    expect(urls.formUrl(context({ locale: "fr" }))).toMatch(
      /^http:\/\/127\.0\.0\.1:5173\/fr\/\?install=/,
    );
  });

  it("has no form when GUP_FEEDBACK_FORM is refused, rather than the default", () => {
    const urls = new FeedbackUrls({ GUP_FEEDBACK_FORM: "http://landing.example.test" });

    expect(urls.formUrl(context())).toBeNull();
    expect(urls.rejected()).toEqual(["GUP_FEEDBACK_FORM"]);
  });
});

describe("FeedbackUrls service routes", () => {
  it("are the production service's by default, the install named in the path", () => {
    const urls = new FeedbackUrls({});

    expect(urls.installUrl(INSTALL_ID)).toBe(`${PRODUCTION}/api/installs/${INSTALL_ID}`);
    expect(urls.installLogsUrl(INSTALL_ID)).toBe(`${PRODUCTION}/api/installs/${INSTALL_ID}/logs`);
    expect(urls.rejected()).toEqual([]);
  });

  it("follow GUP_FEEDBACK_API when it is https, or http on this machine", () => {
    expect(
      new FeedbackUrls({ GUP_FEEDBACK_API: "https://staging.example.test/x" }).installUrl("i"),
    ).toBe("https://staging.example.test/api/installs/i");
    expect(new FeedbackUrls({ GUP_FEEDBACK_API: "http://127.0.0.1:8787" }).installUrl("i")).toBe(
      "http://127.0.0.1:8787/api/installs/i",
    );
  });

  it("treat an empty override as unset", () => {
    expect(new FeedbackUrls({ GUP_FEEDBACK_API: " " }).installUrl("i")).toBe(
      `${PRODUCTION}/api/installs/i`,
    );
  });

  it.each([
    ["clear text to another machine", "http://evil.example.test"],
    ["credentials", "https://user:secret@example.test"],
    ["another scheme", "ftp://example.test"],
    ["garbage", "not a url"],
  ])("are off with an override carrying %s: never production instead", (_case, value) => {
    const urls = new FeedbackUrls({ GUP_FEEDBACK_API: value });

    expect(urls.installUrl(INSTALL_ID)).toBeNull();
    expect(urls.installLogsUrl(INSTALL_ID)).toBeNull();
    expect(urls.rejected()).toEqual(["GUP_FEEDBACK_API"]);
  });
});

describe("currentClientInfo", () => {
  it("folds a platform the service does not know into other", () => {
    expect(currentClientInfo("en", "aix").platform).toBe("other");
    expect(currentClientInfo("fr", "darwin")).toMatchObject({ platform: "darwin", locale: "fr" });
  });
});
