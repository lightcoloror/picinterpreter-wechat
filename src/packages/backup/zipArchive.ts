import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  type UnzipFileInfo,
  type Zippable,
} from "fflate";

export interface ZipArchiveEntryInfo {
  name: string;
  compressedSize: number;
  originalSize: number;
  compression: number;
  directory: boolean;
}

export interface ZipArchiveIndex {
  data: Uint8Array;
  entries: Map<string, ZipArchiveEntryInfo>;
}

export interface ZipArchiveInput {
  path: string;
  data: Uint8Array | string;
  compress?: boolean;
}

interface ReadZipEntriesOptions {
  maxEntryBytes: number | ((entry: ZipArchiveEntryInfo) => number);
  maxTotalBytes: number;
}

const ZIP_EPOCH = new Date(1980, 0, 1);

function toEntryInfo(file: UnzipFileInfo): ZipArchiveEntryInfo {
  return {
    name: file.name,
    compressedSize: file.size,
    originalSize: file.originalSize,
    compression: file.compression,
    directory: file.name.endsWith("/"),
  };
}

function assertSafeArchivePath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new TypeError(`Unsafe ZIP entry path: ${path}`);
  }
}

export function scanZipArchive(
  data: Uint8Array,
  maxEntries: number,
): ZipArchiveIndex {
  if (!data.byteLength) throw new TypeError("ZIP archive is empty");
  const entries = new Map<string, ZipArchiveEntryInfo>();

  unzipSync(data, {
    filter(file) {
      const info = toEntryInfo(file);
      if (!info.directory) assertSafeArchivePath(info.name);
      if (entries.has(info.name)) {
        throw new TypeError(`Duplicate ZIP entry: ${info.name}`);
      }
      entries.set(info.name, info);
      if (entries.size > maxEntries) {
        throw new TypeError("ZIP archive has too many entries");
      }
      return false;
    },
  });

  return { data, entries };
}

export function readZipEntries(
  archive: ZipArchiveIndex,
  paths: string[],
  options: ReadZipEntriesOptions,
) {
  const requested = new Set(paths);
  let totalBytes = 0;
  for (const path of requested) {
    const entry = archive.entries.get(path);
    if (!entry || entry.directory) {
      throw new TypeError(`ZIP archive is missing ${path}`);
    }
    const maxEntryBytes =
      typeof options.maxEntryBytes === "function"
        ? options.maxEntryBytes(entry)
        : options.maxEntryBytes;
    if (
      !Number.isSafeInteger(entry.originalSize) ||
      entry.originalSize < 0 ||
      entry.originalSize > maxEntryBytes
    ) {
      throw new TypeError(`ZIP entry is oversized: ${path}`);
    }
    totalBytes += entry.originalSize;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > options.maxTotalBytes
    ) {
      throw new TypeError("ZIP entries exceed the extraction limit");
    }
  }

  const extracted = unzipSync(archive.data, {
    filter(file) {
      return requested.has(file.name);
    },
  });
  const result = new Map<string, Uint8Array>();
  for (const path of requested) {
    const data = extracted[path];
    const entry = archive.entries.get(path)!;
    if (!data || data.byteLength !== entry.originalSize) {
      throw new TypeError(`ZIP entry size changed while reading: ${path}`);
    }
    result.set(path, data);
  }
  return result;
}

export function readZipText(
  archive: ZipArchiveIndex,
  path: string,
  maxBytes: number,
) {
  const entries = readZipEntries(archive, [path], {
    maxEntryBytes: maxBytes,
    maxTotalBytes: maxBytes,
  });
  return strFromU8(entries.get(path)!);
}

export function createZipArchive(
  files: ZipArchiveInput[],
  onProgress?: (percent: number) => void,
) {
  const archive: Zippable = {};
  onProgress?.(0);
  files.forEach((file, index) => {
    assertSafeArchivePath(file.path);
    if (Object.prototype.hasOwnProperty.call(archive, file.path)) {
      throw new TypeError(`Duplicate ZIP entry: ${file.path}`);
    }
    const data = typeof file.data === "string" ? strToU8(file.data) : file.data;
    archive[file.path] = [
      data,
      {
        level: file.compress === false ? 0 : 6,
        mtime: ZIP_EPOCH,
      },
    ];
    onProgress?.(Math.round(((index + 1) / files.length) * 40));
  });
  const data = zipSync(archive, { level: 6, mtime: ZIP_EPOCH });
  onProgress?.(100);
  return data;
}
