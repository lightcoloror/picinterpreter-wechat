import { toByteArray } from "base64-js";
import { strFromU8 } from "fflate";
import type { BoardDTO } from "@cboard-communication-core/dto";
import {
  importOpenBoardDocuments,
  normalizeOpenBoardArchivePath,
} from "@cboard-communication-core/openBoardFormat";
import { convertAstericsGridToOpenBoardDocuments } from "@cboard-communication-core/astericsGrid";
import { convertGridsetToOpenBoardDocuments } from "@cboard-communication-core/gridset";
import {
  PICTURE_LIBRARY_PROGRESS_PHASES,
  createPictureLibraryProgress,
  type PictureLibraryConflictStrategy,
  type PictureLibraryProgress,
} from "@cboard-communication-core/pictureLibraryArchive";

import {
  detectPictureLibraryImageExtension,
  type PictureLibraryArchivePort,
  type PictureLibraryRestoreSession,
} from "../../platform/pictureLibraryArchivePort";
import type { CommunicationAacImportPort } from "../../platform/communicationAacImportPort";
import { detectSoundExtension } from "../backup/mediaFileFormat";
import {
  readZipEntries,
  scanZipArchive,
  type ZipArchiveIndex,
} from "../backup/zipArchive";
import { createFflateGridsetZipAdapter } from "./fflateGridsetZipAdapter";

interface OpenBoardImportBoardStore {
  load(): BoardDTO[];
  save(value: BoardDTO[]): BoardDTO[];
}

interface OpenBoardImportDependencies {
  boardStore: OpenBoardImportBoardStore;
  archivePort: PictureLibraryArchivePort;
  aacImportPort?: CommunicationAacImportPort;
}

export interface OpenBoardImportResult {
  ok: boolean;
  message: string;
}

const OPEN_BOARD_FILE_EXTENSIONS = [
  "obf",
  "obz",
  "grd",
  "gridset",
  "gridsetx",
  "sps",
  "spb",
  "ce",
];
const MAX_OPEN_BOARD_ARCHIVE_SIZE = 20 * 1024 * 1024;
const MAX_OPEN_BOARD_DOCUMENT_SIZE = 1024 * 1024;
const MAX_OPEN_BOARD_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_OPEN_BOARD_TOTAL_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_OPEN_BOARD_SOUND_SIZE = 5 * 1024 * 1024;
const MAX_OPEN_BOARD_TOTAL_SOUND_SIZE = 20 * 1024 * 1024;
const MAX_OPEN_BOARD_TOTAL_DOCUMENT_SIZE = 32 * 1024 * 1024;
const MAX_OPEN_BOARD_ZIP_ENTRIES = 1200;
const MAX_OPEN_BOARD_DOCUMENTS = 500;

function fileExtension(value: string) {
  const match = String(value || "")
    .trim()
    .toLocaleLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function stableImportHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function decodeUtf8(data: Uint8Array) {
  return strFromU8(data);
}

function decodeBase64(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length % 4 === 1) {
    throw new TypeError("Invalid base64 data");
  }
  return toByteArray(compact.padEnd(Math.ceil(compact.length / 4) * 4, "="));
}

async function decodeInlineImage(value: string) {
  const match = String(value || "").match(
    /^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=\r\n]+)$/i,
  );
  if (!match || match[2].length > MAX_OPEN_BOARD_IMAGE_SIZE * 2) {
    return null;
  }
  try {
    const data = decodeBase64(match[2]);
    return data.byteLength && data.byteLength <= MAX_OPEN_BOARD_IMAGE_SIZE
      ? data
      : null;
  } catch (error) {
    return null;
  }
}

async function decodeInlineSound(value: string) {
  const match = String(value || "").match(
    /^data:(audio\/(?:aac|mp4|mpeg|mp3|ogg|wav|webm|x-m4a|x-wav));base64,([a-z0-9+/=\r\n]+)$/i,
  );
  if (!match || match[2].length > MAX_OPEN_BOARD_SOUND_SIZE * 2) {
    return null;
  }
  try {
    const data = decodeBase64(match[2]);
    return data.byteLength && data.byteLength <= MAX_OPEN_BOARD_SOUND_SIZE
      ? { data, contentType: match[1].toLocaleLowerCase() }
      : null;
  } catch (error) {
    return null;
  }
}

function selectBoundedZipPaths(
  archive: ZipArchiveIndex,
  predicate: (path: string) => boolean,
  maxEntrySize: number,
  maxTotalSize: number,
) {
  const paths: string[] = [];
  let totalSize = 0;
  for (const entry of archive.entries.values()) {
    if (
      entry.directory ||
      !predicate(entry.name) ||
      entry.originalSize > maxEntrySize ||
      totalSize + entry.originalSize > maxTotalSize
    )
      continue;
    paths.push(entry.name);
    totalSize += entry.originalSize;
  }
  return paths;
}

function mergeImportedBoards(
  existingBoards: BoardDTO[],
  importedBoards: BoardDTO[],
  conflictStrategy: PictureLibraryConflictStrategy,
) {
  const importedIds = new Set(importedBoards.map((board) => board.id));
  return conflictStrategy === "merge"
    ? [
        ...existingBoards.filter((board) => !importedIds.has(board.id)),
        ...importedBoards,
      ]
    : [...existingBoards, ...importedBoards];
}

function reportProgress(
  onProgress: ((value: PictureLibraryProgress) => void) | undefined,
  phase: PictureLibraryProgress["phase"],
  completed: number,
  total: number,
  detail: string,
) {
  if (onProgress) {
    onProgress(createPictureLibraryProgress(phase, completed, total, detail));
  }
}

async function cleanupRestoreSession(
  session: PictureLibraryRestoreSession | null,
) {
  if (!session) return;
  try {
    await session.cleanup();
  } catch (error) {
    // Cleanup must not hide the original import failure.
  }
}

export function createOpenBoardImportService(
  dependencies: OpenBoardImportDependencies,
) {
  return {
    async importOpenBoard(
      conflictStrategy: PictureLibraryConflictStrategy,
      onProgress?: (value: PictureLibraryProgress) => void,
    ): Promise<OpenBoardImportResult> {
      const selected = await dependencies.archivePort.chooseArchive(
        OPEN_BOARD_FILE_EXTENSIONS,
      );
      if (!selected.ok || !selected.value) return selected;
      if (selected.value.data.byteLength > MAX_OPEN_BOARD_ARCHIVE_SIZE) {
        return {
          ok: false,
          message:
            "OBF/OBZ/GRD/Gridset/Snap/TouchChat 文件超过 20 MiB，未导入任何沟通板。",
        };
      }

      let restoreSession: PictureLibraryRestoreSession | null = null;
      try {
        const extension = fileExtension(selected.value.name);
        if (!OPEN_BOARD_FILE_EXTENSIONS.includes(extension)) {
          return {
            ok: false,
            message:
              "请选择 .obf、.obz、AsTeRICS .grd、Gridset .gridset、Snap .sps/.spb 或 TouchChat .ce 文件。",
          };
        }
        reportProgress(
          onProgress,
          PICTURE_LIBRARY_PROGRESS_PHASES.reading,
          0,
          1,
          "正在读取标准沟通板",
        );

        let zipFiles: Map<string, Uint8Array> | null = null;
        let documents: Array<{ path: string; board: unknown }> = [];
        let sourceWarnings: string[] = [];
        if (extension === "sps" || extension === "spb" || extension === "ce") {
          if (!dependencies.aacImportPort) {
            return {
              ok: false,
              message: "当前版本未配置 Snap/TouchChat 转换服务，原图库未改变。",
            };
          }
          const converted = await dependencies.aacImportPort.convert({
            name: selected.value.name,
            data: selected.value.data,
            locale: "zh-CN",
          });
          if (!converted.ok || !converted.value) return converted;
          documents = converted.value.documents;
          sourceWarnings = converted.value.warnings;
        } else if (extension === "gridset" || extension === "gridsetx") {
          documents = await convertGridsetToOpenBoardDocuments({
            data: selected.value.data,
            fileName: selected.value.name,
            locale: "zh-CN",
            zipAdapter: createFflateGridsetZipAdapter,
          });
        } else if (extension === "grd") {
          documents = await convertAstericsGridToOpenBoardDocuments({
            text: await decodeUtf8(selected.value.data),
            fileName: selected.value.name,
            locale: "zh-CN",
          });
        } else if (extension === "obf") {
          if (selected.value.data.byteLength > MAX_OPEN_BOARD_DOCUMENT_SIZE) {
            return {
              ok: false,
              message: "OBF 文档超过 1 MiB，未导入任何沟通板。",
            };
          }
          const fileName =
            normalizeOpenBoardArchivePath(`boards/${selected.value.name}`) ||
            "boards/imported.obf";
          documents = [
            {
              path: fileName,
              board: JSON.parse(await decodeUtf8(selected.value.data)),
            },
          ];
        } else {
          const archive = scanZipArchive(
            selected.value.data,
            MAX_OPEN_BOARD_ZIP_ENTRIES,
          );
          const boardEntries = [...archive.entries.values()]
            .filter((entry) => {
              const normalized = normalizeOpenBoardArchivePath(entry.name);
              return Boolean(
                normalized &&
                  normalized.toLocaleLowerCase().endsWith(".obf") &&
                  !entry.directory,
              );
            })
            .map((entry) => entry.name);
          if (boardEntries.length > MAX_OPEN_BOARD_DOCUMENTS) {
            throw new TypeError("Open Board archive has too many boards");
          }
          const readableBoardPaths = selectBoundedZipPaths(
            archive,
            (path) => boardEntries.includes(path),
            MAX_OPEN_BOARD_DOCUMENT_SIZE,
            MAX_OPEN_BOARD_TOTAL_DOCUMENT_SIZE,
          );
          const boardFiles = readZipEntries(archive, readableBoardPaths, {
            maxEntryBytes: MAX_OPEN_BOARD_DOCUMENT_SIZE,
            maxTotalBytes: MAX_OPEN_BOARD_TOTAL_DOCUMENT_SIZE,
          });
          documents = boardEntries.map((path) => {
            const data = boardFiles.get(path);
            if (!data) return { path, board: null };
            try {
              return { path, board: JSON.parse(strFromU8(data)) };
            } catch (error) {
              return { path, board: null };
            }
          });

          const imagePaths = selectBoundedZipPaths(
            archive,
            (path) => {
              const normalized = normalizeOpenBoardArchivePath(path);
              return Boolean(normalized && normalized.startsWith("images/"));
            },
            MAX_OPEN_BOARD_IMAGE_SIZE,
            MAX_OPEN_BOARD_TOTAL_IMAGE_SIZE,
          );
          const soundPaths = selectBoundedZipPaths(
            archive,
            (path) => {
              const normalized = normalizeOpenBoardArchivePath(path);
              return Boolean(normalized && normalized.startsWith("sounds/"));
            },
            MAX_OPEN_BOARD_SOUND_SIZE,
            MAX_OPEN_BOARD_TOTAL_SOUND_SIZE,
          );
          const imageFiles = imagePaths.length
            ? readZipEntries(archive, imagePaths, {
                maxEntryBytes: MAX_OPEN_BOARD_IMAGE_SIZE,
                maxTotalBytes: MAX_OPEN_BOARD_TOTAL_IMAGE_SIZE,
              })
            : new Map<string, Uint8Array>();
          const soundFiles = soundPaths.length
            ? readZipEntries(archive, soundPaths, {
                maxEntryBytes: MAX_OPEN_BOARD_SOUND_SIZE,
                maxTotalBytes: MAX_OPEN_BOARD_TOTAL_SOUND_SIZE,
              })
            : new Map<string, Uint8Array>();
          zipFiles = new Map([...imageFiles, ...soundFiles]);
        }

        const stagedAssets = new Map<string, Promise<string>>();
        let totalImageSize = 0;
        let totalSoundSize = 0;
        const getRestoreSession = async () => {
          if (!restoreSession) {
            restoreSession =
              await dependencies.archivePort.createRestoreSession();
          }
          return restoreSession;
        };
        const stageImage = async (
          key: string,
          path: string,
          data: Uint8Array,
        ) => {
          if (stagedAssets.has(key)) return stagedAssets.get(key)!;
          const extensionName = detectPictureLibraryImageExtension(data);
          if (
            !extensionName ||
            !data.byteLength ||
            data.byteLength > MAX_OPEN_BOARD_IMAGE_SIZE ||
            totalImageSize + data.byteLength > MAX_OPEN_BOARD_TOTAL_IMAGE_SIZE
          )
            return "";
          totalImageSize += data.byteLength;
          const safePath =
            normalizeOpenBoardArchivePath(path) ||
            `images/open-board/${stableImportHash(key)}.${extensionName}`;
          if (!safePath.startsWith("images/")) return "";
          const finalPath = /\.[a-z0-9]+$/i.test(safePath)
            ? safePath.replace(/\.[a-z0-9]+$/i, `.${extensionName}`)
            : `${safePath}.${extensionName}`;
          const promise = getRestoreSession().then((session) =>
            session.writeAsset(finalPath, data),
          );
          stagedAssets.set(key, promise);
          return promise;
        };
        const stageSound = async (
          key: string,
          path: string,
          data: Uint8Array,
          contentType = "",
        ) => {
          const stagedKey = `sound:${key}`;
          if (stagedAssets.has(stagedKey)) {
            return stagedAssets.get(stagedKey)!;
          }
          const extensionName = detectSoundExtension(data, contentType);
          if (
            !extensionName ||
            !data.byteLength ||
            data.byteLength > MAX_OPEN_BOARD_SOUND_SIZE ||
            totalSoundSize + data.byteLength > MAX_OPEN_BOARD_TOTAL_SOUND_SIZE
          )
            return "";
          totalSoundSize += data.byteLength;
          const safePath =
            normalizeOpenBoardArchivePath(path) ||
            `sounds/open-board/${stableImportHash(key)}.${extensionName}`;
          if (!safePath.startsWith("sounds/")) return "";
          const finalPath = /\.[a-z0-9]+$/i.test(safePath)
            ? safePath.replace(/\.[a-z0-9]+$/i, `.${extensionName}`)
            : `${safePath}.${extensionName}`;
          const promise = getRestoreSession().then((session) =>
            session.writeAsset(finalPath, data),
          );
          stagedAssets.set(stagedKey, promise);
          return promise;
        };

        const existingBoards = dependencies.boardStore.load();
        const imported = await importOpenBoardDocuments({
          documents,
          existingBoards,
          conflictStrategy,
          resolveImage: async (
            image: { path?: string; data?: string; url?: string },
            context: { boardId: string; tileId: string },
          ) => {
            const path = normalizeOpenBoardArchivePath(image.path);
            if (zipFiles && path && path.startsWith("images/")) {
              const data = zipFiles.get(path);
              if (data) {
                const staged = await stageImage(path, path, data);
                if (staged) return staged;
              }
            }
            const inlineImage =
              image.data ||
              (/^data:image\//i.test(String(image.url || ""))
                ? String(image.url)
                : "");
            if (inlineImage) {
              const data = await decodeInlineImage(inlineImage);
              if (data) {
                const key = `${context.boardId}:${context.tileId}`;
                const staged = await stageImage(
                  key,
                  `images/open-board/${stableImportHash(key)}.png`,
                  data,
                );
                if (staged) return staged;
              }
            }
            return /^https:\/\//i.test(String(image.url || "").trim())
              ? String(image.url).trim()
              : "";
          },
          resolveSound: async (
            sound: {
              path?: string;
              data?: string;
              url?: string;
              content_type?: string;
            },
            context: { boardId: string; tileId: string },
          ) => {
            const path = normalizeOpenBoardArchivePath(sound.path);
            if (zipFiles && path && path.startsWith("sounds/")) {
              const data = zipFiles.get(path);
              if (data) {
                const staged = await stageSound(
                  path,
                  path,
                  data,
                  sound.content_type,
                );
                if (staged) return staged;
              }
            }
            const inlineSound =
              sound.data ||
              (/^data:audio\//i.test(String(sound.url || ""))
                ? String(sound.url)
                : "");
            if (inlineSound) {
              const decoded = await decodeInlineSound(inlineSound);
              if (decoded) {
                const key = `${context.boardId}:${context.tileId}`;
                const staged = await stageSound(
                  key,
                  `sounds/open-board/${stableImportHash(key)}.mp3`,
                  decoded.data,
                  decoded.contentType,
                );
                if (staged) return staged;
              }
            }
            return /^https:\/\//i.test(String(sound.url || "").trim())
              ? String(sound.url).trim()
              : "";
          },
        });
        if (!imported.boards.length) {
          await cleanupRestoreSession(restoreSession);
          return {
            ok: false,
            message: "没有找到可导入的 Open Board 沟通板，原图库未改变。",
          };
        }

        reportProgress(
          onProgress,
          PICTURE_LIBRARY_PROGRESS_PHASES.restoring,
          0,
          1,
          "正在合并标准沟通板",
        );
        dependencies.boardStore.save(
          mergeImportedBoards(
            existingBoards,
            imported.boards,
            conflictStrategy,
          ),
        );
        reportProgress(
          onProgress,
          PICTURE_LIBRARY_PROGRESS_PHASES.complete,
          1,
          1,
          "标准沟通板导入完成",
        );
        const unresolved = imported.diagnostics.unresolvedImageCount;
        const unresolvedSounds = imported.diagnostics.unresolvedSoundCount;
        return {
          ok: true,
          message:
            `已导入 ${imported.diagnostics.importedBoardCount} 个 OBF 沟通板、` +
            `${imported.diagnostics.importedTileCount} 张图卡。` +
            (unresolved
              ? `有 ${unresolved} 张不受支持或缺失的图片，将显示文字占位。`
              : "") +
            (unresolvedSounds
              ? `有 ${unresolvedSounds} 条不受支持或缺失的录音，将回退文字朗读。`
              : "") +
            (sourceWarnings.length
              ? `格式限制：${sourceWarnings.join("；")}。`
              : "") +
            "可到“板块管理”把导入板加入首页。",
        };
      } catch (error) {
        await cleanupRestoreSession(restoreSession);
        return {
          ok: false,
          message:
            error instanceof Error &&
            error.message === "Encrypted Gridset files are not supported"
              ? "暂不支持加密的 Gridset .gridsetx 文件，原有图库未被替换。"
              : "OBF/OBZ/GRD/Gridset/Snap/TouchChat 导入失败，原有图库未被替换。",
        };
      }
    },
  };
}
