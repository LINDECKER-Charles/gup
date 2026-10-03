import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  clip,
  isSecretName,
  redactArgv,
  redactSecrets,
  redactText,
  redactedHead,
  redactedTail,
  shortenHome,
} from "../../../src/core/log/redact.js";

const GITHUB_TOKEN = `ghp_${"a1B2".repeat(9)}`;
const NPM_TOKEN = `npm_${"x".repeat(36)}`;
const UUID = "4f8a1c2e-9b3d-4e5f-8a7b-1c2d3e4f5a6b";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("redactSecrets", () => {
  it.each([
    ["URL credentials", "fetch https://bob:hunter2@registry.example.com/x", "fetch https://***@registry.example.com/x"],
    ["a token in a query", "GET /api?access_token=abc123&page=2", "GET /api?access_token=***&page=2"],
    ["a signature in a query", "https://blob.example/x?sv=1&sig=Zm9vYmFy", "https://blob.example/x?sv=1&sig=***"],
    ["a bearer header", "Authorization: Bearer abcDEF0123456789", "Authorization: Bearer ***"],
    ["password=", "login failed: password=hunter2 user=bob", "login failed: password=*** user=bob"],
    ["token:", "token: s3cr3t-value", "token: ***"],
    ["api-key=", "using api-key=0123456789", "using api-key=***"],
    ["a GitHub token", `auth with ${GITHUB_TOKEN} done`, "auth with *** done"],
    ["a fine-grained GitHub token", `github_pat_${"A1_b".repeat(10)}`, "***"],
    ["an npm token", `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`, "//registry.npmjs.org/:_authToken=***"],
    ["a GitLab token", `glpat-${"Ab1_".repeat(6)}`, "***"],
    ["a Slack token", "xoxb-1234567890-abcdefghij", "***"],
    ["an AWS access key", "key AKIAIOSFODNN7EXAMPLE used", "key *** used"],
    ["a Google API key", `AIza${"B".repeat(35)}`, "***"],
    ["a JWT", `cookie ${JWT};`, "cookie ***;"],
  ])("masks %s", (_shape, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it.each([
    ["an npm token in an .npmrc line", `//registry.npmjs.org/:_authToken=${UUID}`, "//registry.npmjs.org/:_authToken=***"],
    ["npm basic auth in an .npmrc line", "//pkgs.dev.azure.com/o/_packaging/f/npm/registry/:_auth=dXNlcjpwdw==", "//pkgs.dev.azure.com/o/_packaging/f/npm/registry/:_auth=***"],
    ["an npm password in an .npmrc line", "//pkgs.dev.azure.com/:_password=c2VjcmV0", "//pkgs.dev.azure.com/:_password=***"],
    ["a token in an environment assignment", `NPM_TOKEN=${UUID} GH_TOKEN=abc123`, "NPM_TOKEN=*** GH_TOKEN=***"],
    ["a gho_ GitHub token", `gho_${"B1".repeat(18)}`, "***"],
    ["an AWS secret key", "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "AWS_SECRET_ACCESS_KEY=***"],
    ["an AWS credentials file line", "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG", "aws_secret_access_key = ***"],
    ["an AWS session key and token", "ASIAIOSFODNN7EXAMPLE aws_session_token=FwoGZXIvYXdz+cd==", "*** aws_session_token=***"],
    ["any Authorization scheme, whatever its case", "authorization: token 0123456789abcdef", "authorization: token ***"],
    ["a proxy Authorization header", "Proxy-Authorization: bearer lowercaseonly", "Proxy-Authorization: bearer ***"],
    ["an Authorization header in JSON", '{"Authorization":"Bearer abcDEF0123456789"}', '{"Authorization":"Bearer ***"}'],
    ["URL credentials with an empty user", "git clone https://:pat0123@dev.azure.com/o/p", "git clone https://***@dev.azure.com/o/p"],
    ["URL credentials whose password holds an @", "https://bob:p@ss@example.com/x", "https://***@example.com/x"],
    ["an Azure storage key", "AccountName=acct;AccountKey=Zm9vYmFy==;EndpointSuffix=core.windows.net", "AccountName=acct;AccountKey=***;EndpointSuffix=core.windows.net"],
    ["an Azure shared access key", "SharedAccessKeyName=Root;SharedAccessKey=Zm9vYmFy=", "SharedAccessKeyName=Root;SharedAccessKey=***"],
    ["a quoted password", `{"password": "hunter2"} password='x1'`, `{"password": "***"} password='***'`],
    ["a PyPI token", `pypi-AgEIcHlwaS5vcmc${"Cj".repeat(30)}`, "***"],
    ["a NuGet API key", `oy2${"a1".repeat(21)}b`, "***"],
    ["any secret-named query parameter", "/cb?client_secret=s3c&state=1&npm_token=t", "/cb?client_secret=***&state=1&npm_token=***"],
  ])("masks %s", (_shape, input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it("masks a private key from its header to its footer, and to the end when the footer is missing", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----";
    expect(redactSecrets(`before\n${key}\nafter`)).toBe("before\n-----PRIVATE KEY ***-----\nafter");
    expect(redactSecrets("x -----BEGIN PRIVATE KEY-----\nMIIBOgIBAAJBAKj3")).toBe("x -----PRIVATE KEY ***-----");
  });

  it.each([
    "npm i token-bucket@2.0.0",
    "gh auth status --token-file C:\\secrets\\gh.txt",
    "upgrade 1.2.3-rc.1 → 1.2.4",
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "Basic configuration applied",
    "pip install keyring==25.6.0",
    "the token was refused",
    "max_tokens: 1024",
    "- Token scopes: 'gist', 'read:org'",
    "KeyError: 'token'",
    "npm install --auth-type=web",
    "Requirement already satisfied: secretstorage>=3.2",
    "Bearer token required",
    "https://example.com:8080/path?page=2",
  ])("leaves %j alone", (text) => {
    expect(redactSecrets(text)).toBe(text);
  });

  it("keeps JSON text valid JSON", () => {
    const json = JSON.stringify({
      url: "https://bob:hunter2@example.com",
      line: `password=x ${GITHUB_TOKEN}`,
      header: "Bearer abcDEF0123456789",
    });
    const parsed = JSON.parse(redactSecrets(json)) as Record<string, string>;
    expect(parsed).toEqual({ url: "https://***@example.com", line: "password=*** ***", header: "Bearer ***" });
  });

  /**
   * Every pattern is bounded and starts only where its own class does not
   * precede: hostile text costs linear time. Best of three runs, to keep a
   * loaded CI machine from failing a fast implementation.
   */
  it.each([
    ["one long word", "a"],
    ["repeated JWT heads", "eyJ-"],
    ["repeated JWT segments", "eyJaaaaaaaa."],
    ["repeated schemes", "ab://u:"],
    ["repeated private key headers", "-----BEGIN PRIVATE KEY-----"],
    ["repeated bearer words", "Bearer abcdefg "],
    ["repeated header-like words", "Basic configurations "],
    ["repeated key names", "password: "],
    ["repeated assignments", "a=b:"],
    ["long name runs", `${"a_b-c.".repeat(12)}x `],
    ["names that almost end like secrets", "passpwtokesecreapi_ke "],
    ["repeated headers", "authorization: x "],
    ["repeated empty URL users", "ab://:@@"],
    ["repeated token prefixes", "ghp_glpat-xoxb-AIza-pypi-AgEoy2"],
    ["repeated queries", "?token="],
    ["repeated home-like paths", "C:\\Users\\"],
  ])("redacts a megabyte of %s in under 100 ms", (_name, unit) => {
    const megabyte = unit.repeat(Math.ceil(1_048_576 / unit.length));
    let best = Number.POSITIVE_INFINITY;
    for (let run = 0; run < 3; run++) {
      const startedAt = performance.now();
      redactText(megabyte);
      best = Math.min(best, performance.now() - startedAt);
    }
    expect(best).toBeLessThan(100);
  });
});

describe("shortenHome", () => {
  it("replaces a Windows home whatever its case and separators, JSON-escaped included", () => {
    const home = "C:\\Users\\User";
    expect(shortenHome("C:\\Users\\User\\AppData\\x", home, "win32")).toBe("~\\AppData\\x");
    expect(shortenHome("c:/users/USER/.npmrc", home, "win32")).toBe("~/.npmrc");
    expect(shortenHome('{"p":"C:\\\\Users\\\\User\\\\x"}', home, "win32")).toBe('{"p":"~\\\\x"}');
    expect(shortenHome("in C:\\Users\\User", home, "win32")).toBe("in ~");
  });

  it("never cuts a longer name that starts like the home", () => {
    expect(shortenHome("C:\\Users\\Charlotte\\x", "C:\\Users\\User", "win32")).toBe("C:\\Users\\Charlotte\\x");
    expect(shortenHome("/home/user-old/x", "/home/user", "linux")).toBe("/home/user-old/x");
  });

  it("matches case-sensitively on POSIX", () => {
    expect(shortenHome("/Users/user/.zshrc and /users/user", "/Users/user", "darwin")).toBe(
      "~/.zshrc and /users/user",
    );
  });

  it("leaves text alone for a home too short to mean anything", () => {
    expect(shortenHome("/etc/hosts", "/", "linux")).toBe("/etc/hosts");
    expect(shortenHome("C:\\x", "", "win32")).toBe("C:\\x");
  });

  it("is what redactText applies to the running user's home", () => {
    expect(redactText(`${homedir()}${process.platform === "win32" ? "\\" : "/"}x token=1`)).toMatch(
      /^~[\\/]x token=\*\*\*$/,
    );
  });
});

describe("redactArgv", () => {
  it("masks the value after a secret flag, or attached to it", () => {
    expect(redactArgv(["login", "--token", "abc", "--password=hunter2", "--api-key:k1", "-u", "bob"])).toEqual([
      "login",
      "--token",
      "***",
      "--password=***",
      "--api-key:***",
      "-u",
      "bob",
    ]);
  });

  it("keeps flags that only look like secret ones, and redacts each argument's text", () => {
    expect(redactArgv(["--token-file", "/run/secrets/x", `--header=Bearer ${"Z9".repeat(6)}`])).toEqual([
      "--token-file",
      "/run/secrets/x",
      "--header=Bearer ***",
    ]);
  });
});

describe("isSecretName", () => {
  it("knows secret names whatever their case and separators, and nothing that only contains one", () => {
    expect(["API_KEY", "client-secret", "Authorization", "accessToken", "pat"].every(isSecretName)).toBe(true);
    expect(["tokenizer", "token-file", "passport", "author", "key"].some(isSecretName)).toBe(false);
  });
});

describe("clip, redactedHead and redactedTail", () => {
  it("keep short text whole and mark what they cut", () => {
    expect(clip("abc", 5)).toBe("abc");
    expect(clip("abcdefgh", 3)).toBe("abc… (+5)");
    expect(redactedHead("abc", 5)).toBe("abc");
    expect(redactedTail("abc", 5)).toBe("abc");
    expect(redactedTail("abcdefgh", 3)).toBe("(…) fgh");
  });

  it("redact before cutting, so a cut never leaves half a secret readable", () => {
    const secret = `token=${"s".repeat(40)}`;
    expect(redactedHead(`${secret} then more`, 12)).toBe("token=*** th… (+7)");
    expect(redactedTail(`noise ${secret}`, 9)).toBe("(…) token=***");
  });
});
