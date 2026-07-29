import type { BoardDTO } from "@cboard-communication-core/dto";
import type { PictogramOrderingState } from "@cboard-communication-core/pictogramOrdering";
import {
  PICTURE_LIBRARY_ARCHIVE_MANIFEST,
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
  PICTURE_LIBRARY_PROGRESS_PHASES,
  createPictureLibraryArchivePlan,
  createPictureLibraryProgress,
  normalizePictureLibraryArchiveManifest,
  restorePictureLibraryArchive,
  updatePictureLibraryArchiveAssetMetadata,
  type PictureLibraryArchiveAsset,
  type PictureLibraryArchiveScope,
  type PictureLibraryConflictStrategy,
  type PictureLibraryProgress,
} from "@cboard-communication-core/pictureLibraryArchive";
import type { CommunicationRepository } from "@cboard-communication-core/repository";
import {
  LOCAL_DEVICE_DATA_CATEGORIES,
  LOCAL_DEVICE_DATA_EXPRESSIONS,
  LOCAL_DEVICE_DATA_MANIFEST,
  LOCAL_DEVICE_DATA_PICTOGRAMS,
  LOCAL_DEVICE_DATA_PURPOSES,
  buildLocalDeviceDataFiles,
  buildPrivatePictogramClearPlan,
  mergeLocalDeviceDataRestore,
  normalizeLocalDeviceDataArchiveFiles,
} from "@cboard-communication-core/localDeviceData";

import {
  type PictureLibraryArchivePort,
  type PictureLibraryRestoreSession,
} from "../../platform/pictureLibraryArchivePort";
import type { LocalDeviceDataPort } from "../../platform/localDeviceDataPort";
import { detectSoundExtension, detectVideoExtension } from "./mediaFileFormat";
import {
  createZipArchive,
  readZipEntries,
  readZipText,
  scanZipArchive,
  type ZipArchiveIndex,
  type ZipArchiveInput,
} from "./zipArchive";

type PictureLibraryRepository = Pick<
  CommunicationRepository,
  | "loadCommunicationIdentity"
  | "loadPersonalImagePreferences"
  | "loadAllPersonalImagePreferences"
  | "overwritePersonalImagePreferences"
  | "overwriteAllPersonalImagePreferences"
  | "loadMissingTokens"
  | "overwriteMissingTokens"
  | "loadCommunicationSavedPhrases"
  | "loadCommunicationSavedPhraseTombstones"
  | "loadCommunicationHistory"
  | "loadReceiverRecords"
  | "loadReceiverCorrections"
  | "loadExpressionCandidateFeedbackDrafts"
  | "overwriteCommunicationSavedPhrases"
  | "overwriteCommunicationSavedPhraseTombstones"
  | "overwriteCommunicationHistory"
  | "overwriteReceiverRecords"
  | "overwriteReceiverCorrections"
  | "overwriteExpressionCandidateFeedbackDrafts"
>;

interface PictureLibraryBoardStore {
  load(): BoardDTO[];
  save(value: BoardDTO[]): BoardDTO[];
  reset(): BoardDTO[];
}

interface PictureLibraryOrderingStore {
  load(): PictogramOrderingState;
  save(value: PictogramOrderingState): PictogramOrderingState;
}

interface PictureLibraryBackupDependencies {
  repository: PictureLibraryRepository;
  boardStore: PictureLibraryBoardStore;
  orderingStore: PictureLibraryOrderingStore;
  archivePort: PictureLibraryArchivePort;
  localDeviceDataPort: LocalDeviceDataPort;
  now?: () => number;
}

const MAX_OPEN_BOARD_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_PRIVATE_BACKUP_SOUND_SIZE = 5 * 1024 * 1024;
const MAX_PRIVATE_BACKUP_TOTAL_SOUND_SIZE = 20 * 1024 * 1024;
const MAX_PRIVATE_BACKUP_VIDEO_SIZE = 8 * 1024 * 1024;
const MAX_PRIVATE_BACKUP_TOTAL_VIDEO_SIZE = 40 * 1024 * 1024;
const MAX_PICTURE_LIBRARY_ZIP_ENTRIES = 20050;
const MAX_PICTURE_LIBRARY_MANIFEST_SIZE = 32 * 1024 * 1024;
const MAX_LOCAL_DEVICE_DATA_FILE_SIZE = 16 * 1024 * 1024;
const MAX_RESTORE_BATCH_SIZE = 16 * 1024 * 1024;
const MAX_RESTORE_BATCH_ENTRIES = 250;

function createRestoreAssetBatches(
  archive: ZipArchiveIndex,
  assets: PictureLibraryArchiveAsset[],
) {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchSize = 0;
  for (const asset of assets) {
    const entry = archive.entries.get(asset.path);
    const maxSize = asset.path.startsWith("sounds/")
      ? MAX_PRIVATE_BACKUP_SOUND_SIZE
      : asset.path.startsWith("videos/")
        ? MAX_PRIVATE_BACKUP_VIDEO_SIZE
        : MAX_OPEN_BOARD_IMAGE_SIZE;
    if (
      !entry ||
      entry.directory ||
      entry.originalSize <= 0 ||
      entry.originalSize > maxSize ||
      (asset.size && asset.size !== entry.originalSize)
    ) {
      throw new TypeError(`Invalid picture library asset: ${asset.path}`);
    }
    if (
      batch.length &&
      (batch.length >= MAX_RESTORE_BATCH_ENTRIES ||
        batchSize + entry.originalSize > MAX_RESTORE_BATCH_SIZE)
    ) {
      batches.push(batch);
      batch = [];
      batchSize = 0;
    }
    batch.push(asset.path);
    batchSize += entry.originalSize;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

interface ArchivedBoardMediaReference {
  path?: string;
}

interface ArchivedBoardTileReference {
  id?: string;
  image?: ArchivedBoardMediaReference | null;
  sound?: ArchivedBoardMediaReference | null;
  video?: ArchivedBoardMediaReference | null;
}

interface ArchivedBoardReference {
  id?: string;
  tiles?: ArchivedBoardTileReference[];
}

function createReusableBoardAssetSources(
  manifest: { boards: unknown[] },
  currentBoards: BoardDTO[],
) {
  const result = new Map<string, string>();
  const currentBoardById = new Map(
    currentBoards.map((board) => [board.id, board]),
  );
  (manifest.boards as ArchivedBoardReference[]).forEach((archivedBoard) => {
    const currentBoard = currentBoardById.get(String(archivedBoard.id || ""));
    if (!currentBoard) return;
    const currentTileById = new Map(
      currentBoard.tiles.map((tile) => [tile.id, tile]),
    );
    (Array.isArray(archivedBoard.tiles) ? archivedBoard.tiles : []).forEach(
      (archivedTile) => {
        const currentTile = currentTileById.get(
          String(archivedTile.id || ""),
        );
        if (!currentTile) return;
        const imagePath = String(archivedTile.image?.path || "").trim();
        const imageSource = String(currentTile.image || "").trim();
        if (imagePath && imageSource) result.set(imagePath, imageSource);
        const soundPath = String(archivedTile.sound?.path || "").trim();
        const soundSource = String(currentTile.sound || "").trim();
        if (soundPath && soundSource) result.set(soundPath, soundSource);
        const videoPath = String(archivedTile.video?.path || "").trim();
        const videoSource = String(currentTile.video || "").trim();
        if (videoPath && videoSource) result.set(videoPath, videoSource);
      },
    );
  });
  return result;
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export interface PictureLibraryBackupResult {
  ok: boolean;
  message: string;
  summary?: {
    scope: PictureLibraryArchiveScope;
    boardCount: number;
    tileCount: number;
    customPictureCount: number;
    assetCount: number;
    pictureAssetCount: number;
    soundAssetCount: number;
    videoAssetCount: number;
    conflictStrategy?: PictureLibraryConflictStrategy;
    deviceDataStats?: {
      pictogramCount: number;
      categoryCount: number;
      expressionCount: number;
      savedPhraseCount: number;
      savedPhraseTombstoneCount?: number;
      correctionCount: number;
      draftCount: number;
    };
  };
}

export interface PictureLibraryArchiveArtifact {
  fileName: string;
  data: Uint8Array;
}

export interface PictureLibraryArchiveBuildResult extends PictureLibraryBackupResult {
  archive?: PictureLibraryArchiveArtifact;
}

interface PictureLibraryArchiveBuildOptions {
  includeDeviceData?: boolean;
  deviceDataPurpose?:
    | "complete-device-backup"
    | "account-private-snapshot";
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

function archiveFileName(scope: PictureLibraryArchiveScope, timestamp: number) {
  const date = new Date(timestamp);
  const part = (value: number) => String(value).padStart(2, "0");
  const time = [
    date.getFullYear(),
    part(date.getMonth() + 1),
    part(date.getDate()),
    "-",
    part(date.getHours()),
    part(date.getMinutes()),
    part(date.getSeconds()),
  ].join("");
  return `picinterpreter-picture-library-${scope}-${time}.zip`;
}

function localDeviceDataArchiveFileName(timestamp: number) {
  return archiveFileName(
    PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    timestamp,
  ).replace("picture-library-full", "local-device-data");
}

function privateDeviceDataArchiveFileName(timestamp: number) {
  return archiveFileName(
    PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
    timestamp,
  ).replace("picture-library-custom", "private-device-data");
}

async function cleanupRestoreSession(
  session: PictureLibraryRestoreSession | null,
) {
  if (!session) return;
  try {
    await session.cleanup();
  } catch (error) {
    // Cleanup must not hide the original restore failure.
  }
}

type LocalDeviceDataArchive = ReturnType<
  typeof normalizeLocalDeviceDataArchiveFiles
>;

function readLocalDeviceDataArchive(
  archive: ZipArchiveIndex,
  libraryManifest: ReturnType<
    typeof normalizePictureLibraryArchiveManifest
  >,
): LocalDeviceDataArchive | null {
  if (!archive.entries.has(LOCAL_DEVICE_DATA_MANIFEST)) return null;

  return normalizeLocalDeviceDataArchiveFiles({
    manifest: JSON.parse(
      readZipText(
        archive,
        LOCAL_DEVICE_DATA_MANIFEST,
        MAX_LOCAL_DEVICE_DATA_FILE_SIZE,
      ),
    ),
    pictograms: JSON.parse(
      readZipText(
        archive,
        LOCAL_DEVICE_DATA_PICTOGRAMS,
        MAX_LOCAL_DEVICE_DATA_FILE_SIZE,
      ),
    ),
    categories: JSON.parse(
      readZipText(
        archive,
        LOCAL_DEVICE_DATA_CATEGORIES,
        MAX_LOCAL_DEVICE_DATA_FILE_SIZE,
      ),
    ),
    expressions: JSON.parse(
      readZipText(
        archive,
        LOCAL_DEVICE_DATA_EXPRESSIONS,
        MAX_LOCAL_DEVICE_DATA_FILE_SIZE,
      ),
    ),
    libraryManifest,
  });
}

export function createPictureLibraryBackupService(
  dependencies: PictureLibraryBackupDependencies,
) {
  const now = dependencies.now || Date.now;

  const service = {
    async buildArchive(
      scope: PictureLibraryArchiveScope,
      onProgress?: (value: PictureLibraryProgress) => void,
      options: PictureLibraryArchiveBuildOptions = {},
    ): Promise<PictureLibraryArchiveBuildResult> {
      try {
        const createdAt = now();
        const plan = createPictureLibraryArchivePlan({
          scope,
          boards: dependencies.boardStore.load(),
          personalImagePreferences: options.includeDeviceData
            ? dependencies.repository.loadAllPersonalImagePreferences()
            : dependencies.repository.loadPersonalImagePreferences(),
          missingTokens: dependencies.repository.loadMissingTokens(),
          orderingState: dependencies.orderingStore.load(),
          sourcePlatform: "wechat-miniprogram",
          createdAt,
        });
        const zipFiles: ZipArchiveInput[] = [];
        const metadata: PictureLibraryArchiveAsset[] = [];
        const total = plan.assets.length;
        let totalSoundSize = 0;
        let totalVideoSize = 0;

        for (let index = 0; index < total; index += 1) {
          const asset = plan.assets[index];
          reportProgress(
            onProgress,
            PICTURE_LIBRARY_PROGRESS_PHASES.collecting,
            index,
            total,
            `正在读取媒体 ${index + 1}/${total}`,
          );
          const media = await dependencies.archivePort.readAsset(
            asset.source,
            asset.mediaKind,
          );
          if (asset.mediaKind === "sound") {
            if (
              media.size > MAX_PRIVATE_BACKUP_SOUND_SIZE ||
              !detectSoundExtension(media.data, media.mediaType)
            ) {
              throw new TypeError("Unsupported or oversized tile recording");
            }
            totalSoundSize += media.size;
            if (totalSoundSize > MAX_PRIVATE_BACKUP_TOTAL_SOUND_SIZE) {
              throw new TypeError("Tile recordings exceed the backup limit");
            }
          } else if (asset.mediaKind === "video") {
            if (
              media.size > MAX_PRIVATE_BACKUP_VIDEO_SIZE ||
              !detectVideoExtension(media.data, media.mediaType)
            ) {
              throw new TypeError("Unsupported or oversized tile video");
            }
            totalVideoSize += media.size;
            if (totalVideoSize > MAX_PRIVATE_BACKUP_TOTAL_VIDEO_SIZE) {
              throw new TypeError("Tile videos exceed the backup limit");
            }
          }
          zipFiles.push({
            path: asset.path,
            data: media.data,
            compress: false,
          });
          metadata.push({
            path: asset.path,
            mediaType: media.mediaType,
            size: media.size,
          });
          reportProgress(
            onProgress,
            PICTURE_LIBRARY_PROGRESS_PHASES.collecting,
            index + 1,
            total,
            `已读取媒体 ${index + 1}/${total}`,
          );
        }

        const manifest = updatePictureLibraryArchiveAssetMetadata(
          plan.manifest,
          metadata,
        );
        zipFiles.push({
          path: PICTURE_LIBRARY_ARCHIVE_MANIFEST,
          data: JSON.stringify(manifest, null, 2),
        });
        const deviceData = options.includeDeviceData
          ? buildLocalDeviceDataFiles({
              libraryManifest: manifest,
              savedPhrases:
                dependencies.repository.loadCommunicationSavedPhrases(),
              savedPhraseTombstones:
                dependencies.repository.loadCommunicationSavedPhraseTombstones(),
              history: dependencies.repository.loadCommunicationHistory(),
              receiverRecords: dependencies.repository.loadReceiverRecords(),
              receiverCorrections:
                dependencies.repository.loadReceiverCorrections(),
              expressionCandidateFeedbackDrafts:
                dependencies.repository.loadExpressionCandidateFeedbackDrafts(),
              purpose: options.deviceDataPurpose,
              sourcePlatform: "wechat-miniprogram",
              createdAt,
            })
          : null;
        if (deviceData) {
          Object.entries(deviceData.files).forEach(([path, value]) => {
            zipFiles.push({
              path,
              data: JSON.stringify(value, null, 2),
            });
          });
        }
        reportProgress(
          onProgress,
          PICTURE_LIBRARY_PROGRESS_PHASES.compressing,
          0,
          100,
          "正在压缩图库",
        );
        const data = createZipArchive(zipFiles, (percent) => {
          reportProgress(
            onProgress,
            PICTURE_LIBRARY_PROGRESS_PHASES.compressing,
            percent,
            100,
            `正在压缩 ${percent}%`,
          );
        });
        return {
          ok: true,
          message: options.includeDeviceData
            ? "完整本机数据 ZIP 已生成。"
            : "图库 ZIP 已生成。",
          archive: {
            fileName:
              options.deviceDataPurpose ===
              LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot
                ? privateDeviceDataArchiveFileName(createdAt)
                : options.includeDeviceData
                  ? localDeviceDataArchiveFileName(createdAt)
                  : archiveFileName(scope, createdAt),
            data,
          },
          summary: {
            scope,
            ...manifest.stats,
            deviceDataStats: deviceData ? deviceData.manifest.stats : undefined,
          },
        };
      } catch (error) {
        return {
          ok: false,
          message: "图库备份失败：有图片或录音无法读取，请检查后重试。",
        };
      }
    },

    async exportArchive(
      scope: PictureLibraryArchiveScope,
      onProgress?: (value: PictureLibraryProgress) => void,
      options: PictureLibraryArchiveBuildOptions = {},
    ): Promise<PictureLibraryBackupResult> {
      const built = await service.buildArchive(scope, onProgress, options);
      if (!built.ok || !built.archive) return built;

      const shared = await dependencies.archivePort.shareArchive(
        built.archive.fileName,
        built.archive.data,
      );
      if (!shared.ok) return shared;
      reportProgress(
        onProgress,
        PICTURE_LIBRARY_PROGRESS_PHASES.complete,
        1,
        1,
        "图库备份已生成",
      );
      return {
        ok: true,
        message: options.includeDeviceData
          ? "完整本机数据 ZIP 已生成，可转发或保存到其他位置。"
          : shared.message,
        summary: built.summary,
      };
    },

    async exportDeviceDataArchive(
      onProgress?: (value: PictureLibraryProgress) => void,
    ) {
      return service.exportArchive(
        PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
        onProgress,
        { includeDeviceData: true },
      );
    },

    async buildPrivateDeviceDataArchive(
      onProgress?: (value: PictureLibraryProgress) => void,
    ) {
      return service.buildArchive(
        PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
        onProgress,
        {
          includeDeviceData: true,
          deviceDataPurpose:
            LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot,
        },
      );
    },

    async inspectArchiveData(
      data: Uint8Array,
    ): Promise<PictureLibraryBackupResult> {
      try {
        const archive = scanZipArchive(data, MAX_PICTURE_LIBRARY_ZIP_ENTRIES);
        if (!archive.entries.has(PICTURE_LIBRARY_ARCHIVE_MANIFEST)) {
          return {
            ok: false,
            message: "该 ZIP 不是图语家完整图库备份。",
          };
        }
        const manifest = normalizePictureLibraryArchiveManifest(
          JSON.parse(
            readZipText(
              archive,
              PICTURE_LIBRARY_ARCHIVE_MANIFEST,
              MAX_PICTURE_LIBRARY_MANIFEST_SIZE,
            ),
          ),
        );
        const localDeviceData = readLocalDeviceDataArchive(
          archive,
          manifest,
        );
        if (
          manifest.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full &&
          !manifest.boards.length
        ) {
          return {
            ok: false,
            message: "完整图库备份中没有可恢复的沟通板。",
          };
        }
        return {
          ok: true,
          message: localDeviceData
            ? `完整本机备份包含 ${manifest.stats.boardCount} 个沟通板、` +
              `${localDeviceData.expressions.savedPhrases.length} 条常用语、` +
              `${localDeviceData.expressions.history.length} 条沟通历史和 ` +
              `${localDeviceData.expressions.receiverRecords.length} 条接收记录。`
            : `备份包含 ${manifest.stats.customPictureCount} 张个人图片、` +
              `${manifest.stats.soundAssetCount} 段图卡录音、` +
              `${manifest.stats.videoAssetCount} 段短视频、` +
              `${manifest.stats.boardCount} 个沟通板。`,
          summary: {
            scope: manifest.scope,
            ...manifest.stats,
            deviceDataStats: localDeviceData
              ? localDeviceData.manifest.stats
              : undefined,
          },
        };
      } catch (error) {
        return {
          ok: false,
          message: "云端文件不是可识别的图语家图库备份。",
        };
      }
    },

    async restoreArchiveData(
      archiveData: Uint8Array,
      conflictStrategy: PictureLibraryConflictStrategy,
      onProgress?: (value: PictureLibraryProgress) => void,
    ): Promise<PictureLibraryBackupResult> {
      let restoreSession: PictureLibraryRestoreSession | null = null;
      try {
        const archive = scanZipArchive(
          archiveData,
          MAX_PICTURE_LIBRARY_ZIP_ENTRIES,
        );
        if (!archive.entries.has(PICTURE_LIBRARY_ARCHIVE_MANIFEST)) {
          return {
            ok: false,
            message: "该 ZIP 不是图语家完整图库备份。",
          };
        }
        const manifest = normalizePictureLibraryArchiveManifest(
          JSON.parse(
            readZipText(
              archive,
              PICTURE_LIBRARY_ARCHIVE_MANIFEST,
              MAX_PICTURE_LIBRARY_MANIFEST_SIZE,
            ),
          ),
        );
        const localDeviceData = readLocalDeviceDataArchive(
          archive,
          manifest,
        );
        if (
          manifest.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full &&
          !manifest.boards.length
        ) {
          return {
            ok: false,
            message: "完整图库备份中没有可恢复的沟通板。",
          };
        }

        const existingBoards = dependencies.boardStore.load();
        const reusableBoardAssetSources = createReusableBoardAssetSources(
          manifest,
          existingBoards,
        );
        restoreSession = await dependencies.archivePort.createRestoreSession();
        const assetLocations: Record<string, string> = {};
        const total = manifest.assets.length;
        let totalSoundSize = 0;
        let totalVideoSize = 0;
        const assetByPath = new Map(
          manifest.assets.map((asset) => [asset.path, asset]),
        );
        const batches = createRestoreAssetBatches(archive, manifest.assets);
        let completed = 0;
        for (const paths of batches) {
          const files = readZipEntries(archive, paths, {
            maxEntryBytes: (entry) =>
              entry.name.startsWith("sounds/")
                ? MAX_PRIVATE_BACKUP_SOUND_SIZE
                : entry.name.startsWith("videos/")
                  ? MAX_PRIVATE_BACKUP_VIDEO_SIZE
                  : MAX_OPEN_BOARD_IMAGE_SIZE,
            maxTotalBytes: MAX_RESTORE_BATCH_SIZE,
          });
          for (const path of paths) {
            const asset = assetByPath.get(path)!;
            const data = files.get(path)!;
            reportProgress(
              onProgress,
              PICTURE_LIBRARY_PROGRESS_PHASES.reading,
              completed,
              total,
              `正在恢复媒体 ${completed + 1}/${total}`,
            );
            if (asset.path.startsWith("sounds/")) {
              if (!detectSoundExtension(data, asset.mediaType)) {
                throw new TypeError(
                  `Picture library sound is unsupported: ${asset.path}`,
                );
              }
              totalSoundSize += data.byteLength;
              if (totalSoundSize > MAX_PRIVATE_BACKUP_TOTAL_SOUND_SIZE) {
                throw new TypeError(
                  "Picture library sounds exceed the restore limit",
                );
              }
            } else if (asset.path.startsWith("videos/")) {
              if (!detectVideoExtension(data, asset.mediaType)) {
                throw new TypeError(
                  `Picture library video is unsupported: ${asset.path}`,
                );
              }
              totalVideoSize += data.byteLength;
              if (totalVideoSize > MAX_PRIVATE_BACKUP_TOTAL_VIDEO_SIZE) {
                throw new TypeError(
                  "Picture library videos exceed the restore limit",
                );
              }
            }
            const reusableSource = reusableBoardAssetSources.get(asset.path);
            let reused = false;
            if (reusableSource) {
              try {
                const currentAsset = await dependencies.archivePort.readAsset(
                  reusableSource,
                  asset.path.startsWith("sounds/")
                    ? "sound"
                    : asset.path.startsWith("videos/")
                      ? "video"
                      : "image",
                );
                if (bytesEqual(currentAsset.data, data)) {
                  assetLocations[asset.path] = reusableSource;
                  reused = true;
                }
              } catch (error) {
                // An unreadable current source falls back to the ZIP copy.
              }
            }
            if (!reused) {
              assetLocations[asset.path] = await restoreSession.writeAsset(
                asset.path,
                data,
              );
            }
            completed += 1;
            reportProgress(
              onProgress,
              PICTURE_LIBRARY_PROGRESS_PHASES.reading,
              completed,
              total,
              `${reused ? "已复用" : "已恢复"}媒体 ${completed}/${total}`,
            );
          }
        }

        const existingPreferences =
          dependencies.repository.loadPersonalImagePreferences();
        const existingMissingTokens =
          dependencies.repository.loadMissingTokens();
        const existingOrdering = dependencies.orderingStore.load();
        const identity = dependencies.repository.loadCommunicationIdentity();
        const existingSavedPhrases = localDeviceData
          ? dependencies.repository.loadCommunicationSavedPhrases()
          : [];
        const existingSavedPhraseTombstones = localDeviceData
          ? dependencies.repository.loadCommunicationSavedPhraseTombstones()
          : [];
        const existingHistory = localDeviceData
          ? dependencies.repository.loadCommunicationHistory()
          : [];
        const existingReceiverRecords = localDeviceData
          ? dependencies.repository.loadReceiverRecords()
          : [];
        const existingReceiverCorrections = localDeviceData
          ? dependencies.repository.loadReceiverCorrections()
          : [];
        const existingFeedbackDrafts = localDeviceData
          ? dependencies.repository.loadExpressionCandidateFeedbackDrafts()
          : [];
        reportProgress(
          onProgress,
          PICTURE_LIBRARY_PROGRESS_PHASES.restoring,
          0,
          1,
          localDeviceData ? "正在合并完整本机数据" : "正在合并图库",
        );
        const restored = restorePictureLibraryArchive({
          manifest,
          assetLocations,
          existingBoards,
          existingPersonalImagePreferences: existingPreferences,
          existingMissingTokens,
          existingOrderingState: existingOrdering,
          identity,
          conflictStrategy,
        });
        const restoredDeviceData = localDeviceData
          ? (() => {
              return mergeLocalDeviceDataRestore({
                current: {
                  savedPhrases: existingSavedPhrases,
                  savedPhraseTombstones: existingSavedPhraseTombstones,
                  history: existingHistory,
                  receiverRecords: existingReceiverRecords,
                  receiverCorrections: existingReceiverCorrections,
                  expressionCandidateFeedbackDrafts:
                    existingFeedbackDrafts,
                },
                imported: localDeviceData,
                identity,
                conflictStrategy,
              });
            })()
          : null;

        try {
          dependencies.repository.overwritePersonalImagePreferences(
            restored.personalImagePreferences,
          );
          dependencies.repository.overwriteMissingTokens(
            restored.missingTokens,
          );
          dependencies.orderingStore.save(restored.orderingState);
          if (manifest.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full) {
            dependencies.boardStore.save(restored.boards);
          }
          if (restoredDeviceData) {
            dependencies.repository.overwriteCommunicationSavedPhraseTombstones(
              restoredDeviceData.savedPhraseTombstones,
            );
            dependencies.repository.overwriteCommunicationSavedPhrases(
              restoredDeviceData.savedPhrases,
            );
            dependencies.repository.overwriteCommunicationHistory(
              restoredDeviceData.history,
            );
            dependencies.repository.overwriteReceiverRecords(
              restoredDeviceData.receiverRecords,
            );
            dependencies.repository.overwriteReceiverCorrections(
              restoredDeviceData.receiverCorrections,
            );
            dependencies.repository.overwriteExpressionCandidateFeedbackDrafts(
              restoredDeviceData.expressionCandidateFeedbackDrafts,
            );
          }
        } catch (error) {
          dependencies.repository.overwritePersonalImagePreferences(
            existingPreferences,
          );
          dependencies.repository.overwriteMissingTokens(existingMissingTokens);
          dependencies.orderingStore.save(existingOrdering);
          if (manifest.scope === PICTURE_LIBRARY_ARCHIVE_SCOPES.full) {
            dependencies.boardStore.save(existingBoards);
          }
          if (localDeviceData) {
            dependencies.repository.overwriteCommunicationSavedPhraseTombstones(
              existingSavedPhraseTombstones,
            );
            dependencies.repository.overwriteCommunicationSavedPhrases(
              existingSavedPhrases,
            );
            dependencies.repository.overwriteCommunicationHistory(
              existingHistory,
            );
            dependencies.repository.overwriteReceiverRecords(
              existingReceiverRecords,
            );
            dependencies.repository.overwriteReceiverCorrections(
              existingReceiverCorrections,
            );
            dependencies.repository.overwriteExpressionCandidateFeedbackDrafts(
              existingFeedbackDrafts,
            );
          }
          throw error;
        }

        reportProgress(
          onProgress,
          PICTURE_LIBRARY_PROGRESS_PHASES.complete,
          1,
          1,
          localDeviceData ? "完整本机数据恢复完成" : "图库恢复完成",
        );
        return {
          ok: true,
          message: localDeviceData
            ? `完整本机数据恢复完成：${restored.summary.boardCount} 个沟通板、` +
              `${restoredDeviceData!.savedPhrases.length} 条常用语、` +
              `${restoredDeviceData!.history.length} 条沟通历史和 ` +
              `${restoredDeviceData!.receiverRecords.length} 条接收记录。`
            : `图库恢复完成：${restored.summary.pictureAssetCount} 张图片、` +
              `${restored.summary.soundAssetCount} 段图卡录音，` +
              `${restored.summary.videoAssetCount} 段短视频，` +
              `${restored.summary.boardCount} 个沟通板。`,
          summary: {
            ...restored.summary,
            deviceDataStats: localDeviceData
              ? localDeviceData.manifest.stats
              : undefined,
          },
        };
      } catch (error) {
        await cleanupRestoreSession(restoreSession);
        return {
          ok: false,
          message: "图库恢复失败，原有图库未被替换。",
        };
      }
    },

    async importArchive(
      conflictStrategy: PictureLibraryConflictStrategy,
      onProgress?: (value: PictureLibraryProgress) => void,
    ): Promise<PictureLibraryBackupResult> {
      const selected = await dependencies.archivePort.chooseArchive();
      if (!selected.ok || !selected.value) return selected;
      return service.restoreArchiveData(
        selected.value.data,
        conflictStrategy,
        onProgress,
      );
    },

    resetToDefaults(): PictureLibraryBackupResult {
      try {
        const boards = dependencies.boardStore.reset();
        return {
          ok: true,
          message:
            `已恢复默认 CBoard 图库：${boards.length} 个沟通板。` +
            "个人图片和沟通记录均已保留。",
        };
      } catch (error) {
        return {
          ok: false,
          message: "恢复默认图库失败，当前图库未被替换。",
        };
      }
    },

    async clearPrivatePictograms(): Promise<PictureLibraryBackupResult> {
      const plan = buildPrivatePictogramClearPlan({
        personalImagePreferences:
          dependencies.repository.loadAllPersonalImagePreferences(),
        missingTokens: dependencies.repository.loadMissingTokens(),
        now: now(),
      });
      for (const imageSource of plan.imageSources) {
        if (
          !(await dependencies.localDeviceDataPort.removePrivateFile(
            imageSource,
          ))
        ) {
          return {
            ok: false,
            message: "私人图片文件未能完整删除，清除结果未写入，请重试。",
          };
        }
      }
      try {
        dependencies.repository.overwriteAllPersonalImagePreferences(
          plan.personalImagePreferences,
        );
        dependencies.repository.overwriteMissingTokens(plan.missingTokens);
        return {
          ok: true,
          message:
            "已清除 " +
            plan.removedPreferenceCount +
            " 项个人换图和 " +
            plan.removedRuntimePictogramCount +
            " 项本机补图；公开图库、沟通历史及云端数据均已保留。",
        };
      } catch (error) {
        return {
          ok: false,
          message: "私人图片记录未能完整清除，请重试。",
        };
      }
    },

    clearAllLocalData() {
      return dependencies.localDeviceDataPort.clearAllLocalData();
    },
  };
  return service;
}
