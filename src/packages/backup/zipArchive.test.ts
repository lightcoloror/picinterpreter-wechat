import JSZip from "jszip";
import { describe, expect, test, vi } from "vitest";

import {
  createZipArchive,
  readZipEntries,
  readZipText,
  scanZipArchive,
} from "./zipArchive";

describe("zipArchive", () => {
  test("writes ZIP files that remain readable by JSZip", async () => {
    const progress = vi.fn();
    const data = createZipArchive(
      [
        { path: "library.json", data: '{"name":"图语家"}' },
        {
          path: "images/sample.png",
          data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          compress: false,
        },
      ],
      progress,
    );

    const zip = await JSZip.loadAsync(data);
    expect(await zip.file("library.json")!.async("text")).toBe(
      '{"name":"图语家"}',
    );
    expect(await zip.file("images/sample.png")!.async("uint8array")).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  test("indexes first and only expands bounded requested entries", () => {
    const data = createZipArchive([
      { path: "library.json", data: '{"version":1}' },
      { path: "images/a.png", data: new Uint8Array([1, 2, 3]) },
    ]);
    const archive = scanZipArchive(data, 4);

    expect(readZipText(archive, "library.json", 100)).toBe('{"version":1}');
    expect(
      readZipEntries(archive, ["images/a.png"], {
        maxEntryBytes: 3,
        maxTotalBytes: 3,
      }).get("images/a.png"),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("rejects declared decompressed sizes before extracting data", () => {
    const data = createZipArchive([
      { path: "large.txt", data: "a".repeat(4096) },
    ]);
    const archive = scanZipArchive(data, 2);

    expect(() =>
      readZipEntries(archive, ["large.txt"], {
        maxEntryBytes: 100,
        maxTotalBytes: 100,
      }),
    ).toThrow("oversized");
  });

  test("rejects unsafe paths and excessive entry counts", () => {
    expect(() =>
      createZipArchive([{ path: "../outside.txt", data: "unsafe" }]),
    ).toThrow("Unsafe ZIP entry path");

    const data = createZipArchive([
      { path: "one.txt", data: "1" },
      { path: "two.txt", data: "2" },
    ]);
    expect(() => scanZipArchive(data, 1)).toThrow("too many entries");
  });
});
