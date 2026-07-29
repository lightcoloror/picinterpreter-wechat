import { createHash } from "node:crypto";

import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import {
  PRIVATE_DEVICE_DATA_CONTENT_TYPE,
  blobToBytes,
  decryptPrivateArchiveBlob,
  encryptPrivateArchiveBlob,
} from "../../../cboard/src/components/Settings/Export/PrivateArchiveEncryption.browser.js";
import {
  createPrivateDeviceDataCloudPort,
  createPrivatePictureLibraryCloudPort,
  type PrivatePictureLibraryCloudDependencies,
} from "../../src/platform/privatePictureLibraryCloudPort";
import {
  decryptPrivateArchiveData,
  encryptPrivateArchiveData,
} from "../../src/platform/taroPrivateArchiveEncryption";

vi.mock("@tarojs/taro", () => ({
  default: {
    getRandomValues: vi.fn(),
  },
}));

const RUN_CLOUD_INTEROP = process.env.PRIVATE_ARCHIVE_CLOUD_E2E === "1";
const API_BASE_URL = String(
  process.env.PRIVATE_ARCHIVE_CLOUD_API_URL || "http://127.0.0.1:19011",
).replace(/\/+$/, "");
const EMAIL =
  process.env.LOCAL_RUNTIME_USER_EMAIL || "local.runtime@example.com";
const PASSWORD =
  process.env.LOCAL_RUNTIME_USER_PASSWORD || "ChangeMe123!";
const PASSPHRASE = "correct-horse-battery-staple";

function createDeterministicRandomBytes(seed: number) {
  return (length: number) =>
    Uint8Array.from(
      { length },
      (_value, index) => (index * 43 + seed) % 256,
    );
}

const deterministicRandomBytes = createDeterministicRandomBytes(19);

function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

async function parseResponseData(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return text;
  }
}

function createFetchDependencies(
  authToken: string,
): PrivatePictureLibraryCloudDependencies {
  return {
    apiBaseUrl: API_BASE_URL,
    getAuthToken: () => authToken,
    async request(options) {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.header,
      });
      return {
        statusCode: response.status,
        data: await parseResponseData(response),
      };
    },
    async uploadArchive(options) {
      const formData = new FormData();
      formData.append(
        options.fieldName,
        new Blob([options.data], { type: "application/octet-stream" }),
        options.fileName,
      );
      const response = await fetch(options.url, {
        method: "POST",
        headers: options.header,
        body: formData,
      });
      return {
        statusCode: response.status,
        data: await parseResponseData(response),
      };
    },
    async downloadArchive(options) {
      const response = await fetch(options.url, {
        headers: options.header,
      });
      return {
        statusCode: response.status,
        data: response.ok ? await response.arrayBuffer() : undefined,
      };
    },
  };
}

async function login() {
  const response = await fetch(`${API_BASE_URL}/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = (await parseResponseData(response)) as {
    authToken?: string;
  } | null;
  if (!response.ok || !data?.authToken) {
    throw new Error(`Local runtime login failed with HTTP ${response.status}`);
  }
  return data.authToken;
}

const describeCloud = RUN_CLOUD_INTEROP ? describe : describe.skip;

describeCloud("private archive cloud interoperability", () => {
  let dependencies: PrivatePictureLibraryCloudDependencies;

  beforeAll(async () => {
    dependencies = createFetchDependencies(await login());
    await createPrivatePictureLibraryCloudPort(dependencies).delete();
    await createPrivateDeviceDataCloudPort(dependencies).delete();
  });

  afterAll(async () => {
    if (!dependencies) return;
    await createPrivatePictureLibraryCloudPort(dependencies).delete();
    await createPrivateDeviceDataCloudPort(dependencies).delete();
  });

  test("moves a Web private picture ciphertext through the API into WeChat", async () => {
    const archive = zipSync({
      "private-picture.txt": strToU8("Web family picture fixture"),
    });
    const encryptedBlob = await encryptPrivateArchiveBlob({
      archive: new Blob([archive], { type: "application/zip" }),
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes,
    });
    const encrypted = await blobToBytes(encryptedBlob);
    const port = createPrivatePictureLibraryCloudPort(dependencies);

    const uploaded = await port.upload(encrypted);
    expect(uploaded).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          format: "picinterpreter-private-picture-library-encrypted",
          contractVersion: 2,
          size: encrypted.byteLength,
          sha256: sha256(encrypted),
        }),
      }),
    );

    const rawMetadata = await dependencies.request({
      url: `${API_BASE_URL}/communication/private-library`,
      method: "GET",
      header: {
        Authorization: `Bearer ${dependencies.getAuthToken()}`,
      },
    });
    expect(rawMetadata.statusCode).toBe(200);
    expect(rawMetadata.data).not.toEqual(
      expect.objectContaining({
        blobUrl: expect.anything(),
        password: expect.anything(),
      }),
    );

    const plaintextAttempt = await dependencies.uploadArchive({
      url: `${API_BASE_URL}/communication/private-library`,
      data: archive,
      fileName: "plaintext.zip",
      fieldName: "file",
      header: {
        Authorization: `Bearer ${dependencies.getAuthToken()}`,
      },
    });
    expect(plaintextAttempt.statusCode).toBe(400);

    const downloaded = await port.download();
    expect(downloaded.ok).toBe(true);
    expect(downloaded.value?.data).toEqual(encrypted);
    expect(downloaded.value?.data.slice(0, 8)).toEqual(
      strToU8("PIE2EE01"),
    );
    expect(
      await decryptPrivateArchiveData(downloaded.value!.data, PASSPHRASE),
    ).toEqual(archive);
  });

  test("moves a WeChat private device ciphertext through the API into Web", async () => {
    const archive = zipSync({
      "private-device-data.txt": strToU8("WeChat private device fixture"),
    });
    const encrypted = await encryptPrivateArchiveData(
      archive,
      PASSPHRASE,
      deterministicRandomBytes,
    );
    const port = createPrivateDeviceDataCloudPort(dependencies);

    const uploaded = await port.upload(encrypted);
    expect(uploaded).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          format: "picinterpreter-private-device-data-encrypted",
          contractVersion: 2,
          size: encrypted.byteLength,
          sha256: sha256(encrypted),
        }),
      }),
    );

    const metadata = await port.getMetadata();
    expect(metadata.value).toEqual(uploaded.value);

    const downloaded = await port.download();
    expect(downloaded.ok).toBe(true);
    expect(downloaded.value?.data).toEqual(encrypted);
    const decrypted = await decryptPrivateArchiveBlob({
      archive: new Blob([downloaded.value!.data], {
        type: PRIVATE_DEVICE_DATA_CONTENT_TYPE,
      }),
      passphrase: PASSPHRASE,
    });
    expect(await blobToBytes(decrypted)).toEqual(archive);

    expect(await port.delete()).toEqual(
      expect.objectContaining({
        ok: true,
        value: { deleted: true },
      }),
    );
    expect((await port.getMetadata()).ok).toBe(false);
  });

  test("keeps one complete decryptable snapshot after concurrent replacements", async () => {
    const firstArchive = zipSync({
      "concurrent-a.txt": strToU8("first concurrent account snapshot"),
    });
    const secondArchive = zipSync({
      "concurrent-b.txt": strToU8("second concurrent account snapshot"),
    });
    const firstEncrypted = await encryptPrivateArchiveData(
      firstArchive,
      PASSPHRASE,
      createDeterministicRandomBytes(71),
    );
    const secondEncrypted = await encryptPrivateArchiveData(
      secondArchive,
      PASSPHRASE,
      createDeterministicRandomBytes(131),
    );
    const candidates = new Map([
      [
        sha256(firstEncrypted),
        { archive: firstArchive, encrypted: firstEncrypted },
      ],
      [
        sha256(secondEncrypted),
        { archive: secondArchive, encrypted: secondEncrypted },
      ],
    ]);
    const port = createPrivatePictureLibraryCloudPort(dependencies);

    const uploads = await Promise.all([
      port.upload(firstEncrypted),
      port.upload(secondEncrypted),
    ]);
    expect(uploads.every((result) => result.ok)).toBe(true);

    const metadata = await port.getMetadata();
    expect(metadata.ok).toBe(true);
    const winner = candidates.get(metadata.value!.sha256);
    expect(winner).toBeDefined();

    const downloaded = await port.download();
    expect(downloaded.ok).toBe(true);
    expect(downloaded.value?.data).toEqual(winner!.encrypted);
    expect(
      await decryptPrivateArchiveData(downloaded.value!.data, PASSPHRASE),
    ).toEqual(winner!.archive);
  });

  test("reconciles and safely retries after the server commits but the response is lost", async () => {
    const archive = zipSync({
      "response-loss.txt": strToU8("server committed before response loss"),
    });
    const encrypted = await encryptPrivateArchiveData(
      archive,
      PASSPHRASE,
      createDeterministicRandomBytes(197),
    );
    const reliablePort = createPrivateDeviceDataCloudPort(dependencies);
    let serverCompletedUpload = false;
    const uncertainPort = createPrivateDeviceDataCloudPort({
      ...dependencies,
      async uploadArchive(options) {
        await dependencies.uploadArchive(options);
        serverCompletedUpload = true;
        throw new TypeError("simulated response loss after server commit");
      },
    });

    const uncertain = await uncertainPort.upload(encrypted);
    expect(serverCompletedUpload).toBe(true);
    expect(uncertain).toEqual({
      ok: false,
      message:
        "上传响应未确认，本机数据没有改变；云端备份可能已经更新。请先使用“下载、复核并恢复”核对，再决定是否重试。",
    });

    const reconciled = await reliablePort.getMetadata();
    expect(reconciled).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          size: encrypted.byteLength,
          sha256: sha256(encrypted),
        }),
      }),
    );

    const retried = await reliablePort.upload(encrypted);
    expect(retried.ok).toBe(true);
    const downloaded = await reliablePort.download();
    expect(downloaded.ok).toBe(true);
    expect(downloaded.value?.data).toEqual(encrypted);
    expect(
      await decryptPrivateArchiveData(downloaded.value!.data, PASSPHRASE),
    ).toEqual(archive);
  });
});
