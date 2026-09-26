import { describe, expect, test } from "vitest";

import { resolvePrivateArchiveCloudE2EConfig } from "./privateArchiveCloudE2EConfig";

const validEnvironment = {
  PRIVATE_ARCHIVE_CLOUD_API_URL: "http://127.0.0.1:19011/",
  PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_EMAIL: "fixture@example.test",
  PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_PASSWORD: "fixture-secret",
  PRIVATE_ARCHIVE_CLOUD_E2E_CONFIRM: "I_CONFIRM_ISOLATED_DESTRUCTIVE_FIXTURE",
};

describe("private archive cloud E2E configuration", () => {
  test("accepts explicit synthetic credentials and an isolated loopback fixture", () => {
    expect(resolvePrivateArchiveCloudE2EConfig(validEnvironment)).toEqual({
      apiBaseUrl: "http://127.0.0.1:19011",
      email: "fixture@example.test",
      password: "fixture-secret",
    });
  });

  test("accepts IPv4 and IPv6 loopback hosts", () => {
    for (const apiUrl of ["http://127.0.0.2:19011", "http://[::1]:19011"]) {
      expect(
        resolvePrivateArchiveCloudE2EConfig({
          ...validEnvironment,
          PRIVATE_ARCHIVE_CLOUD_API_URL: apiUrl,
        }).apiBaseUrl,
      ).toBe(apiUrl);
    }
  });

  test("requires explicit settings and the destructive fixture confirmation", () => {
    for (const key of Object.keys(validEnvironment)) {
      const incomplete = { ...validEnvironment };
      delete incomplete[key as keyof typeof incomplete];
      expect(() => resolvePrivateArchiveCloudE2EConfig(incomplete)).toThrow(
        "Missing required setting",
      );
    }

    expect(() =>
      resolvePrivateArchiveCloudE2EConfig({
        ...validEnvironment,
        PRIVATE_ARCHIVE_CLOUD_E2E_CONFIRM: "yes",
      }),
    ).toThrow("isolated destructive fixture");
  });

  test("rejects non-loopback URLs, credential URLs, and non-HTTP protocols", () => {
    for (const apiUrl of [
      "https://api.example.test",
      "http://user:secret@127.0.0.1:19011",
      "ftp://127.0.0.1:19011",
      "http://127.0.0.1.evil.test",
      "http://127.0.0.1:19011?route=/user/login",
      "http://127.0.0.1:19011/#/user/login",
    ]) {
      expect(() =>
        resolvePrivateArchiveCloudE2EConfig({
          ...validEnvironment,
          PRIVATE_ARCHIVE_CLOUD_API_URL: apiUrl,
        }),
      ).toThrow();
    }
  });

  test("does not include secret values in validation errors", () => {
    const secret = "do-not-print-this-password";
    let errorMessage = "";
    try {
      resolvePrivateArchiveCloudE2EConfig({
        ...validEnvironment,
        PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_PASSWORD: secret,
        PRIVATE_ARCHIVE_CLOUD_E2E_CONFIRM: "wrong-secret-value",
      });
    } catch (error) {
      errorMessage = String(error);
    }
    expect(errorMessage).not.toContain(secret);
    expect(errorMessage).not.toContain("wrong-secret-value");
  });
});
