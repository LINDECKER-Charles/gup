import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NewFeedback } from "../../../src/domain/feedback.js";
import { assetHref } from "../../../src/views/admin-assets.js";
import { inboxPage } from "../../../src/views/pages/inbox/inbox-page.js";
import {
  ADMIN_PASSWORD, ADMIN_USERNAME, createTestApp, PUBLIC_ORIGIN, type TestApp,
} from "../../support/test-app.js";

const COOKIE = "__Host-gup_admin";
const HOSTILE = `"'><script>alert(1)</script>`;
const BUG: NewFeedback = {
  kind: "bug", title: "Upgrade stalls at 100%", message: "The bar freezes.", email: null,
  installId: null, gupVersion: null, platform: null, locale: null,
};
const SUGGESTION: NewFeedback = {
  ...BUG, kind: "suggestion", title: "Dark theme", message: "Please add one.",
  email: "reporter@example.com",
};

let ctx: TestApp;
let token: string;

beforeEach(async () => {
  ctx = await createTestApp();
  await ctx.feedback.create(BUG);
  await ctx.feedback.create(SUGGESTION);
  const login = await ctx.app.inject({
    method: "POST",
    url: "/admin/login",
    payload: new URLSearchParams({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }).toString(),
    headers: { origin: PUBLIC_ORIGIN, "content-type": "application/x-www-form-urlencoded" },
  });
  token = login.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? "";
});

afterEach(async () => {
  await ctx.app.close();
});

function get(url: string, signedIn = true) {
  return ctx.app.inject({ method: "GET", url, cookies: signedIn ? { [COOKIE]: token } : {} });
}

describe("back-office assets", () => {
  it("serves the stylesheet and its fonts without a session, cached for good", async () => {
    const css = await get(assetHref("app.css"), false);
    expect(css.statusCode).toBe(200);
    expect(css.headers["content-type"]).toContain("text/css");
    expect(css.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(css.body).toContain(`url("${assetHref("geist.woff2")}")`);
    const font = await get(assetHref("geist.woff2"), false);
    expect(font.statusCode).toBe(200);
    expect(font.headers["content-type"]).toBe("font/woff2");
  });

  it("answers 404 for a file outside its table", async () => {
    expect((await get("/admin/assets/..%2Fpackage.json", false)).statusCode).toBe(404);
    expect((await get("/admin/assets/unknown.css", false)).statusCode).toBe(404);
  });

  it("lets the page load its own fonts and nothing else", async () => {
    const csp = (await get("/admin/login", false)).headers["content-security-policy"];
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("default-src 'none'");
  });
});

describe("inbox", () => {
  it("opens on new feedback, the new count standing out", async () => {
    const body = (await get("/admin")).body;
    expect(body).toContain("Nouveaux retours");
    expect(body).toMatch(/href="\/admin\?status=new"\s+aria-current="page"/);
  });

  it("finds a feedback by a word, ignoring case, and counts what it found", async () => {
    const body = (await get("/admin?status=all&q=DARK")).body;
    expect(body).toContain("Dark theme");
    expect(body).not.toContain("Upgrade stalls");
    expect(body).toContain("1 retour trouvé pour « DARK »");
  });

  it("finds a feedback by its number, with or without #", async () => {
    expect((await get("/admin?status=all&q=%231")).body).toContain("Upgrade stalls");
    expect((await get("/admin?status=all&q=2")).body).toContain("Dark theme");
  });

  it("keeps the search in the filter links, and offers a way out when nothing matches", async () => {
    const body = (await get("/admin?status=all&kind=bug&q=dark")).body;
    expect(body).toContain("Aucun retour ne correspond.");
    expect(body).toContain(`href="/admin?status=all"`);
    expect(body).toContain(`href="/admin?status=new&amp;kind=bug&amp;q=dark"`);
  });

  it("escapes the search it repeats", () => {
    const markup = inboxPage({
      csrfToken: "token", counts: { new: 0, in_progress: 0, resolved: 0, dismissed: 0 },
      status: null, kind: null, search: HOSTILE, notice: null,
      page: { items: [], total: 0, page: 1, pageSize: 20 },
    });
    expect(markup).not.toContain("<script");
    expect(markup).toContain("&lt;script&gt;");
  });
});

describe("feedback page", () => {
  it("presses the button of the current status only", async () => {
    const body = (await get("/admin/feedback/1")).body;
    expect(body.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(body).toMatch(/value="new"\s+aria-pressed="true"/);
  });
});
