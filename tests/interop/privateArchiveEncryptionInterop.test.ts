import { describe, expect, test, vi } from "vitest";

import {
  PRIVATE_DEVICE_DATA_CONTENT_TYPE,
  blobToBytes,
  decryptPrivateArchiveBlob,
  encryptPrivateArchiveBlob,
} from "../../../cboard/src/components/Settings/Export/PrivateArchiveEncryption.browser.js";
import {
  decryptPrivateArchiveData,
  encryptPrivateArchiveData,
} from "../../src/platform/taroPrivateArchiveEncryption";

vi.mock("@tarojs/taro", () => ({
  default: {
    getRandomValues: vi.fn(),
  },
}));

const PASSPHRASE = "correct-horse-battery-staple";
const PLAINTEXT_ARCHIVE = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04, 0x05,
]);
const ENVELOPE_MAGIC = new TextEncoder().encode("PIE2EE01");

function deterministicRandomBytes(length: number) {
  return Uint8Array.from(
    { length },
    (_value, index) => (index * 37 + 11) % 256,
  );
}

describe("PIE2EE01 Web/WeChat adapter interoperability", () => {
  test("decrypts a Web Blob envelope with the WeChat byte adapter", async () => {
    const encryptedBlob = await encryptPrivateArchiveBlob({
      archive: new Blob([PLAINTEXT_ARCHIVE], { type: "application/zip" }),
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes,
    });
    const encryptedBytes = await blobToBytes(encryptedBlob);

    expect(encryptedBlob.type).toBe(PRIVATE_DEVICE_DATA_CONTENT_TYPE);
    expect(encryptedBytes.slice(0, ENVELOPE_MAGIC.byteLength)).toEqual(
      ENVELOPE_MAGIC,
    );
    expect(encryptedBytes.slice(0, 4)).not.toEqual(
      PLAINTEXT_ARCHIVE.slice(0, 4),
    );
    await expect(
      decryptPrivateArchiveData(encryptedBytes, PASSPHRASE),
    ).resolves.toEqual(PLAINTEXT_ARCHIVE);
  });

  test("decrypts a WeChat byte envelope with the Web Blob adapter", async () => {
    const encryptedBytes = await encryptPrivateArchiveData(
      PLAINTEXT_ARCHIVE,
      PASSPHRASE,
      deterministicRandomBytes,
    );
    const restoredBlob = await decryptPrivateArchiveBlob({
      archive: new Blob([encryptedBytes], {
        type: PRIVATE_DEVICE_DATA_CONTENT_TYPE,
      }),
      passphrase: PASSPHRASE,
    });

    expect(encryptedBytes.slice(0, ENVELOPE_MAGIC.byteLength)).toEqual(
      ENVELOPE_MAGIC,
    );
    expect(restoredBlob.type).toBe("application/zip");
    expect(await blobToBytes(restoredBlob)).toEqual(PLAINTEXT_ARCHIVE);
  });

  test("keeps authenticated wrong-password failure across adapters", async () => {
    const encryptedBlob = await encryptPrivateArchiveBlob({
      archive: new Blob([PLAINTEXT_ARCHIVE], { type: "application/zip" }),
      passphrase: PASSPHRASE,
      randomBytes: deterministicRandomBytes,
    });

    await expect(
      decryptPrivateArchiveData(
        await blobToBytes(encryptedBlob),
        "another-safe-password",
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "PRIVATE_ARCHIVE_DECRYPTION_FAILED" }),
    );
  });
});
