import { generateKeyPairSync } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IDENTITY_FILE,
  loadInstallIdentity,
  readInstallIdentity,
} from "../../../src/core/feedback/install-identity.js";
import { installIdOf } from "../../support/feedback-signature.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RAW_KEY = /^[A-Za-z0-9_-]{43}$/;

describe("install identity", () => {
  const tempDir = useTempDirs();

  it("is created on first need, then the same on every later load", async () => {
    const dir = join(await tempDir("gup-identity-"), "feedback");

    expect(readInstallIdentity(dir)).toBeNull();
    const first = loadInstallIdentity(dir);
    const second = loadInstallIdentity(dir);

    expect(first?.installId).toMatch(UUID_V4);
    expect(first?.publicKey).toMatch(RAW_KEY);
    expect(second?.installId).toBe(first?.installId);
    expect(second?.publicKey).toBe(first?.publicKey);
    expect(readInstallIdentity(dir)?.installId).toBe(first?.installId);
  });

  it("derives the install ID from the public key, as the service does", async () => {
    const identity = loadInstallIdentity(await tempDir("gup-identity-"))!;

    expect(identity.installId).toBe(installIdOf(identity.publicKey));
  });

  it("keeps only the private key on disk, version 2, in a private file", async () => {
    const dir = await tempDir("gup-identity-");

    loadInstallIdentity(dir);

    expect(await readdir(dir)).toEqual([IDENTITY_FILE]);
    const stored = JSON.parse(await readFile(join(dir, IDENTITY_FILE), "utf8"));
    expect(Object.keys(stored).sort()).toEqual(["privateKey", "v"]);
    expect(stored.v).toBe(2);
    if (process.platform !== "win32") {
      expect((await stat(join(dir, IDENTITY_FILE))).mode & 0o777).toBe(0o600);
    }
  });

  it.each([
    ["an earlier format", { v: 1, installId: "3f2c8a4e-1b6d-4e2f-9a7c-5d8e0f1a2b3c" }],
    ["a key that is not one", { v: 2, privateKey: "AAAA" }],
    [
      "a key of another type",
      {
        v: 2,
        privateKey: generateKeyPairSync("ec", { namedCurve: "P-256" })
          .privateKey.export({ format: "der", type: "pkcs8" })
          .toString("base64url"),
      },
    ],
  ])("replaces a file holding %s", async (_case, content) => {
    const dir = await tempDir("gup-identity-");
    await writeFile(join(dir, IDENTITY_FILE), JSON.stringify(content));

    expect(readInstallIdentity(dir)).toBeNull();
    const identity = loadInstallIdentity(dir);

    expect(identity?.installId).toMatch(UUID_V4);
    expect(readInstallIdentity(dir)?.installId).toBe(identity?.installId);
  });

  it("throws, and replaces nothing, when the file exists but cannot be read", async () => {
    const dir = await tempDir("gup-identity-");
    await mkdir(join(dir, IDENTITY_FILE));

    expect(() => readInstallIdentity(dir)).toThrow();
    expect(() => loadInstallIdentity(dir)).toThrow();
    expect((await stat(join(dir, IDENTITY_FILE))).isDirectory()).toBe(true);
  });

  it("is null when the platform gives no state directory", () => {
    expect(loadInstallIdentity(null)).toBeNull();
  });
});
