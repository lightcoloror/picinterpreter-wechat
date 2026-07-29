import {
  readZipEntries,
  scanZipArchive,
} from "../backup/zipArchive";

const MAX_GRIDSET_ZIP_ENTRIES = 5000;
const MAX_GRIDSET_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_GRIDSET_TOTAL_BYTES = 64 * 1024 * 1024;

export async function createFflateGridsetZipAdapter(data: Uint8Array) {
  const archive = scanZipArchive(data, MAX_GRIDSET_ZIP_ENTRIES);
  const fileNames = [...archive.entries.values()]
    .filter((entry) => !entry.directory)
    .map((entry) => entry.name);
  const files = readZipEntries(archive, fileNames, {
    maxEntryBytes: MAX_GRIDSET_ENTRY_BYTES,
    maxTotalBytes: MAX_GRIDSET_TOTAL_BYTES,
  });

  return {
    listFiles: () => fileNames.slice(),
    readFile: async (name: string) => {
      const file = files.get(name);
      if (!file) throw new TypeError(`Gridset entry not found: ${name}`);
      return file;
    },
  };
}
