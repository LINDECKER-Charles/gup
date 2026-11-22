import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config/config-error.js";
import { loadConfig } from "../../src/config/load-config.js";
import { PasswordHash } from "../../src/security/password-hash.js";

const HASH = (await PasswordHash.create("a long enough password")).toString();
const MINIMAL = {
  DATABASE_URL: "postgres://gup:secret@db:5432/gup",
  FEEDBACK_PUBLIC_URL: "https://feedback.example.test/",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: HASH,
};

function problemsOf(env: Record<string, string>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("loadConfig accepted the environment");
}

describe("loadConfig", () => {
  it("builds a production configuration from the required variables", () => {
    const config = loadConfig(MINIMAL);
    expect(config).toMatchObject({
      env: "production",
      port: 8080,
      publicOrigin: "https://feedback.example.test",
      allowedOrigins: ["https://lindecker-charles.github.io"],
      trustProxy: ["loopback", "uniquelocal"],
      cookieSecure: true,
      mail: null,
    });
  });

  it("lists every missing variable at once", () => {
    const problems = problemsOf({}).join("\n");
    for (const name of ["DATABASE_URL", "FEEDBACK_PUBLIC_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH"]) {
      expect(problems).toContain(name);
    }
  });

  it("rejects a malformed password hash", () => {
    expect(problemsOf({ ...MINIMAL, ADMIN_PASSWORD_HASH: "scrypt$16384$8$1$abc$def" }).join())
      .toContain("ADMIN_PASSWORD_HASH");
  });

  it("requires the addresses once SMTP is configured", () => {
    const problems = problemsOf({ ...MINIMAL, SMTP_URL: "smtp://mail.example.test:587" }).join();
    expect(problems).toContain("MAIL_FROM");
    expect(problems).toContain("FEEDBACK_NOTIFY_TO");
  });

  it("refuses an insecure admin cookie in production", () => {
    expect(problemsOf({ ...MINIMAL, COOKIE_SECURE: "false" }).join()).toContain("COOKIE_SECURE");
    expect(loadConfig({ ...MINIMAL, COOKIE_SECURE: "false", FEEDBACK_ENV: "development" }))
      .toMatchObject({ cookieSecure: false });
  });

  it("refuses a plain-http public URL in production only", () => {
    const local = { ...MINIMAL, FEEDBACK_PUBLIC_URL: "http://127.0.0.1:8787" };
    expect(problemsOf(local).join()).toContain("FEEDBACK_PUBLIC_URL must be https");
    expect(loadConfig({ ...local, FEEDBACK_ENV: "development" }))
      .toMatchObject({ publicOrigin: "http://127.0.0.1:8787" });
  });

  it.each([
    ["true", true],
    ["false", false],
    ["10.0.0.0/8, loopback, ::1, fd00::/8", ["10.0.0.0/8", "loopback", "::1", "fd00::/8"]],
  ])("reads TRUST_PROXY=%s", (raw, expected) => {
    expect(loadConfig({ ...MINIMAL, TRUST_PROXY: raw }).trustProxy).toEqual(expected);
  });

  it.each(["yes please", "10.0.0.0/33", "10.0.0/8", "localhost", "1", ","])(
    "rejects TRUST_PROXY=%s with the other problems", (raw) => {
      const problems = problemsOf({ ...MINIMAL, TRUST_PROXY: raw, PORT: "0" }).join("\n");
      expect(problems).toContain("TRUST_PROXY");
      expect(problems).toContain("PORT");
    });
});

describe("PasswordHash", () => {
  it("encodes without `$`, which Compose would interpolate in an env file", async () => {
    expect(HASH).toMatch(/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/);
    const parsed = PasswordHash.parse(HASH);
    expect(await parsed.matches("a long enough password")).toBe(true);
    expect(await parsed.matches("another password")).toBe(false);
  });

  it.each([
    ["N below 2^14", "scrypt:8192:8:1"],
    ["N above 2^17", "scrypt:262144:8:1"],
    ["N not a power of two", "scrypt:20000:8:1"],
    ["r below 8", "scrypt:16384:4:1"],
    ["r above 16", "scrypt:16384:32:1"],
    ["p above 4", "scrypt:16384:8:5"],
    ["more than 64 MiB per hash", "scrypt:131072:16:1"],
  ])("refuses %s", (_name, cost) => {
    const [, , , , salt, key] = HASH.split(":");
    expect(() => PasswordHash.parse(`${cost}:${salt}:${key}`))
      .toThrow("unsupported scrypt cost parameters");
  });

  it("accepts the bounds and derives once at startup", async () => {
    const [, , , , salt, key] = HASH.split(":");
    const atMemoryCeiling = PasswordHash.parse(`scrypt:65536:8:1:${salt}:${key}`);
    await expect(atMemoryCeiling.checkDerivable()).resolves.toBeUndefined();
  });
});
