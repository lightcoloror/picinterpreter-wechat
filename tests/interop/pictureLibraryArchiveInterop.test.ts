import type { BoardDTO } from "@cboard-communication-core/dto";
import { LOCAL_DEVICE_DATA_PURPOSES } from "@cboard-communication-core/localDeviceData";
import { PICTURE_LIBRARY_ARCHIVE_SCOPES } from "@cboard-communication-core/pictureLibraryArchive";
import { describe, expect, test, vi } from "vitest";

import {
  buildPictureLibraryArchive as buildWebPictureLibraryArchive,
  readPictureLibraryArchive as readWebPictureLibraryArchive,
} from "../../../cboard/src/components/Settings/Export/PictureLibraryArchive.helpers.js";
import {
  PRIVATE_DEVICE_DATA_CONTENT_TYPE,
  blobToBytes,
  decryptPrivateArchiveBlob,
  encryptPrivateArchiveBlob,
} from "../../../cboard/src/components/Settings/Export/PrivateArchiveEncryption.browser.js";
import type {
  PictureLibraryArchivePort,
  PictureLibraryRestoreSession,
} from "../../src/platform/pictureLibraryArchivePort";
import { createPictureLibraryBackupService } from "../../src/packages/backup/pictureLibraryBackupService";
import {
  decryptPrivateArchiveData,
  encryptPrivateArchiveData,
} from "../../src/platform/taroPrivateArchiveEncryption";

vi.mock("@tarojs/taro", () => ({
  default: {
    getRandomValues: vi.fn(),
  },
}));

const PRIVATE_ARCHIVE_PASSPHRASE = "correct-horse-battery-staple";

const MEDIA_BYTES = {
  image: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  sound: new Uint8Array([0x49, 0x44, 0x33, 0x04]),
  video: new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]),
} as const;

function deterministicRandomBytes(length: number) {
  return Uint8Array.from(
    { length },
    (_value, index) => (index * 41 + 17) % 256,
  );
}

function createBoard(name: string): BoardDTO {
  return {
    dtoType: "BoardDTO",
    version: 1,
    id: "daily",
    name,
    nameKey: "daily",
    category: "needs",
    layout: { columns: 1, rows: 1, tileIds: ["water"] },
    tiles: [
      {
        dtoType: "TileDTO",
        version: 1,
        id: "water",
        boardId: "daily",
        label: "喝水",
        vocalization: "喝水",
        image: "source://water.png",
        sound: "source://water.mp3",
        mediaType: "video",
        video: "source://water.mp4",
      },
    ],
  };
}

function createOrderedPersonalBoard(name: string): BoardDTO {
  const board = createBoard(name);
  const createPersonalTile = (id: string, label: string): BoardDTO["tiles"][number] => ({
    ...board.tiles[0],
    id,
    label,
    vocalization: label,
    image: `source://${id}.png`,
    sound: `source://${id}.mp3`,
    video: `source://${id}.mp4`,
    pictogramAttribution: {
      provider: "device-private",
      originalId: id,
      name: label,
      license: "家属提供，仅用于当前设备沟通",
      licenseUrl: null,
      author: "家属",
      authorUrl: null,
      sourceUrl: `device-private://personal/${id}`,
    },
  });
  const first = createPersonalTile(
    "device_private_custom_first",
    "第一张个人图卡",
  );
  const second = createPersonalTile(
    "device_private_custom_second",
    "第二张个人图卡",
  );

  return {
    ...board,
    layout: {
      columns: 1,
      rows: 3,
      tileIds: [second.id, board.tiles[0].id, first.id],
    },
    tiles: [board.tiles[0], first, second],
  };
}

function createPrivatePreference(image: string, originalId: string) {
  return {
    scope: "device-private",
    tileId: "water",
    boardId: "daily",
    labelSnapshot: "家里的水杯",
    image,
    pictogramAttribution: {
      provider: "device-private",
      originalId,
      name: "家里的水杯照片",
      license: "家属提供，仅用于当前设备沟通",
      licenseUrl: null,
      author: "家属",
      authorUrl: null,
      sourceUrl: `device-private://personal/${originalId}`,
    },
    patientId: "patient-current",
    workspaceId: "workspace-current",
    createdAt: 1,
    updatedAt: 2,
  };
}

function createInteropHarness(board: BoardDTO, initialPreferences: any[] = []) {
  let boards = [board];
  let preferences = initialPreferences;
  const restoredAssets = new Map<string, Uint8Array>();
  const repository = {
    loadCommunicationIdentity: () => ({
      patientId: "patient-current",
      workspaceId: "workspace-current",
    }),
    loadPersonalImagePreferences: () => preferences,
    loadAllPersonalImagePreferences: () => preferences,
    overwritePersonalImagePreferences: vi.fn((value) => {
      preferences = value;
      return preferences;
    }),
    overwriteAllPersonalImagePreferences: vi.fn((value) => {
      preferences = value;
      return preferences;
    }),
    loadMissingTokens: () => [],
    overwriteMissingTokens: vi.fn((value) => value),
    loadCommunicationSavedPhrases: () => [
      {
        id: "wechat-private-phrase",
        sentence: "微信私有常用语",
        output: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    loadCommunicationSavedPhraseTombstones: () => [],
    loadCommunicationHistory: () => [],
    loadReceiverRecords: () => [],
    loadReceiverCorrections: () => [],
    loadExpressionCandidateFeedbackDrafts: () => [],
    overwriteCommunicationSavedPhrases: vi.fn((value) => value),
    overwriteCommunicationSavedPhraseTombstones: vi.fn((value) => value),
    overwriteCommunicationHistory: vi.fn((value) => value),
    overwriteReceiverRecords: vi.fn((value) => value),
    overwriteReceiverCorrections: vi.fn((value) => value),
    overwriteExpressionCandidateFeedbackDrafts: vi.fn((value) => value),
  };
  const boardStore = {
    load: () => boards,
    save: (value: BoardDTO[]) => {
      boards = value;
      return boards;
    },
    reset: () => boards,
  };
  const orderingStore = {
    load: () => ({
      schemaVersion: 1 as const,
      manualOrderByBoard: {},
      usageByTileKey: {},
    }),
    save: (value: {
      schemaVersion: 1;
      manualOrderByBoard: Record<string, string[]>;
      usageByTileKey: Record<string, never>;
    }) => value,
  };
  const restoreSession: PictureLibraryRestoreSession = {
    async writeAsset(path, data) {
      restoredAssets.set(path, data);
      return `wxfile://restored/${path}`;
    },
    async cleanup() {},
  };
  const archivePort: PictureLibraryArchivePort = {
    readAsset: vi.fn(async (_source, mediaKind) => {
      const data = MEDIA_BYTES[mediaKind];
      return {
        data,
        mediaType:
          mediaKind === "sound"
            ? "audio/mpeg"
            : mediaKind === "video"
              ? "video/mp4"
              : "image/png",
        size: data.byteLength,
      };
    }),
    chooseArchive: vi.fn(),
    shareArchive: vi.fn(),
    createRestoreSession: vi.fn(async () => restoreSession),
  };
  const service = createPictureLibraryBackupService({
    repository,
    boardStore,
    orderingStore,
    archivePort,
    localDeviceDataPort: {
      removePrivateFile: vi.fn(async () => true),
      clearAllLocalData: vi.fn(async () => ({ ok: true, message: "已清除" })),
    },
    now: () => 123,
  });

  return {
    service,
    repository,
    restoredAssets,
    getBoards: () => boards,
    getPreferences: () => preferences,
    setBoards: (value: BoardDTO[]) => {
      boards = value;
    },
  };
}

describe("PictureLibraryArchive v1 Web/WeChat interoperability", () => {
  test("restores a CBoard Web JSZip archive with the WeChat fflate service", async () => {
    const board = createBoard("Web 图库");
    const harness = createInteropHarness(board);
    const webArchive = await buildWebPictureLibraryArchive({
      boards: [board],
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null,
      sourcePlatform: "cboard-web",
      createdAt: 123,
      readImage: async (_source: string, mediaKind: keyof typeof MEDIA_BYTES) => {
        const data = MEDIA_BYTES[mediaKind];
        return {
          data,
          mediaType:
            mediaKind === "sound"
              ? "audio/mpeg"
              : mediaKind === "video"
                ? "video/mp4"
                : "image/png",
          size: data.byteLength,
        };
      },
      zipType: "uint8array",
    });
    harness.setBoards([]);

    const restored = await harness.service.restoreArchiveData(
      webArchive.content,
      "merge",
    );

    expect(webArchive.manifest.sourcePlatform).toBe("cboard-web");
    expect(restored.ok).toBe(true);
    expect(harness.getBoards()[0]).toEqual(
      expect.objectContaining({
        name: "Web 图库",
        category: "needs",
        layout: { columns: 1, rows: 1, tileIds: ["water"] },
      }),
    );
    expect(harness.getBoards()[0].tiles[0]).toEqual(
      expect.objectContaining({
        image: expect.stringContaining("wxfile://restored/images/boards/"),
        sound: expect.stringContaining("wxfile://restored/sounds/boards/"),
        mediaType: "video",
        video: expect.stringContaining("wxfile://restored/videos/boards/"),
      }),
    );
    expect([...harness.restoredAssets.values()]).toEqual(
      expect.arrayContaining([
        MEDIA_BYTES.image,
        MEDIA_BYTES.sound,
        MEDIA_BYTES.video,
      ]),
    );
  });

  test("reads a WeChat fflate archive with the CBoard Web JSZip adapter", async () => {
    const harness = createInteropHarness(createBoard("微信图库"));
    const built = await harness.service.buildArchive(
      PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    );
    if (!built.ok || !built.archive) {
      throw new Error(built.message);
    }
    const archive = built.archive.data;

    const restored = await readWebPictureLibraryArchive({
      file: {
        arrayBuffer: async () =>
          archive.buffer.slice(
            archive.byteOffset,
            archive.byteOffset + archive.byteLength,
          ),
      },
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      identity: {
        patientId: "patient-current",
        workspaceId: "workspace-current",
      },
      conflictStrategy: "merge",
    });

    expect(restored.boards[0]).toEqual(
      expect.objectContaining({ name: "微信图库", category: "needs" }),
    );
    expect(restored.boards[0].tiles[0]).toEqual(
      expect.objectContaining({
        image: "data:image/png;base64,iVBORw0KGgo=",
        sound: "data:audio/mpeg;base64,SUQzBA==",
        mediaType: "video",
        video: "data:video/mp4;base64,AAAAGGZ0eXBpc29t",
      }),
    );
  });

  test("preserves personal pictogram display order in both archive directions", async () => {
    const orderedBoard = createOrderedPersonalBoard("个人图卡排序");
    const expectedOrder = [
      "device_private_custom_second",
      "water",
      "device_private_custom_first",
    ];
    const webToWechat = createInteropHarness(orderedBoard);
    const webArchive = await buildWebPictureLibraryArchive({
      boards: [orderedBoard],
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null,
      sourcePlatform: "cboard-web",
      createdAt: 123,
      readImage: async (_source: string, mediaKind: keyof typeof MEDIA_BYTES) => {
        const data = MEDIA_BYTES[mediaKind];
        return {
          data,
          mediaType:
            mediaKind === "sound"
              ? "audio/mpeg"
              : mediaKind === "video"
                ? "video/mp4"
                : "image/png",
          size: data.byteLength,
        };
      },
      zipType: "uint8array",
    });
    webToWechat.setBoards([]);

    const wechatRestore = await webToWechat.service.restoreArchiveData(
      webArchive.content,
      "merge",
    );

    expect(wechatRestore.ok).toBe(true);
    expect(webToWechat.getBoards()[0].layout.tileIds).toEqual(expectedOrder);

    const wechatToWeb = createInteropHarness(orderedBoard);
    const wechatArchive = await wechatToWeb.service.buildArchive(
      PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
    );
    if (!wechatArchive.ok || !wechatArchive.archive) {
      throw new Error(wechatArchive.message);
    }
    const archive = wechatArchive.archive.data;
    const webRestore = await readWebPictureLibraryArchive({
      file: {
        arrayBuffer: async () =>
          archive.buffer.slice(
            archive.byteOffset,
            archive.byteOffset + archive.byteLength,
          ),
      },
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      identity: {
        patientId: "patient-current",
        workspaceId: "workspace-current",
      },
      conflictStrategy: "merge",
    });

    expect(webRestore.boards[0].layout.tileIds).toEqual(expectedOrder);
  });

  test("restores a Web encrypted private snapshot through the WeChat pipeline", async () => {
    const harness = createInteropHarness(createBoard("本机图库"));
    const webArchive = await buildWebPictureLibraryArchive({
      boards: [],
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
      personalImagePreferences: [],
      missingTokens: [],
      orderingState: null,
      sourcePlatform: "cboard-web",
      createdAt: 123,
      deviceData: {
        savedPhrases: [
          {
            id: "web-private-phrase",
            sentence: "Web 私有常用语",
            output: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        savedPhraseTombstones: [],
        history: [],
        receiverRecords: [],
        receiverCorrections: [],
        expressionCandidateFeedbackDrafts: [],
        purpose: LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot,
        sourcePlatform: "cboard-web",
        createdAt: 123,
      },
      zipType: "uint8array",
    });
    const encryptedBlob = await encryptPrivateArchiveBlob({
      archive: new Blob([webArchive.content], { type: "application/zip" }),
      passphrase: PRIVATE_ARCHIVE_PASSPHRASE,
      randomBytes: deterministicRandomBytes,
    });
    const decryptedArchive = await decryptPrivateArchiveData(
      await blobToBytes(encryptedBlob),
      PRIVATE_ARCHIVE_PASSPHRASE,
    );

    const restored = await harness.service.restoreArchiveData(
      decryptedArchive,
      "merge",
    );

    expect(restored.ok).toBe(true);
    expect(
      harness.repository.overwriteCommunicationSavedPhrases,
    ).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sentence: "Web 私有常用语" }),
      ]),
    );
  });

  test("restores a WeChat encrypted private snapshot through the Web pipeline", async () => {
    const harness = createInteropHarness(createBoard("微信图库"));
    const built = await harness.service.buildPrivateDeviceDataArchive();
    if (!built.ok || !built.archive) {
      throw new Error(built.message);
    }
    const encryptedBytes = await encryptPrivateArchiveData(
      built.archive.data,
      PRIVATE_ARCHIVE_PASSPHRASE,
      deterministicRandomBytes,
    );
    const decryptedBlob = await decryptPrivateArchiveBlob({
      archive: new Blob([encryptedBytes], {
        type: PRIVATE_DEVICE_DATA_CONTENT_TYPE,
      }),
      passphrase: PRIVATE_ARCHIVE_PASSPHRASE,
    });

    const restored = await readWebPictureLibraryArchive({
      file: decryptedBlob,
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      existingLocalDeviceData: {
        savedPhrases: [],
        savedPhraseTombstones: [],
        history: [],
        receiverRecords: [],
        receiverCorrections: [],
        expressionCandidateFeedbackDrafts: [],
      },
      identity: {
        patientId: "patient-current",
        workspaceId: "workspace-current",
      },
      conflictStrategy: "merge",
    });

    expect(restored.localDeviceData.savedPhrases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sentence: "微信私有常用语" }),
      ]),
    );
    expect(restored.summary.deviceDataStats.savedPhraseCount).toBe(1);
  });

  test("restores a Web encrypted private picture snapshot in WeChat", async () => {
    const preference = createPrivatePreference(
      "source://web-family.png",
      "web-family",
    );
    const webArchive = await buildWebPictureLibraryArchive({
      boards: [createBoard("Web 图库")],
      scope: PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
      personalImagePreferences: [preference],
      missingTokens: [],
      orderingState: null,
      sourcePlatform: "cboard-web",
      createdAt: 123,
      readImage: async () => ({
        data: MEDIA_BYTES.image,
        mediaType: "image/png",
        size: MEDIA_BYTES.image.byteLength,
      }),
      zipType: "uint8array",
    });
    const encryptedBlob = await encryptPrivateArchiveBlob({
      archive: new Blob([webArchive.content], { type: "application/zip" }),
      passphrase: PRIVATE_ARCHIVE_PASSPHRASE,
      randomBytes: deterministicRandomBytes,
    });
    const decryptedArchive = await decryptPrivateArchiveData(
      await blobToBytes(encryptedBlob),
      PRIVATE_ARCHIVE_PASSPHRASE,
    );
    const harness = createInteropHarness(createBoard("本机图库"));

    const restored = await harness.service.restoreArchiveData(
      decryptedArchive,
      "merge",
    );

    expect(restored.ok).toBe(true);
    expect(harness.getPreferences()).toEqual([
      expect.objectContaining({
        labelSnapshot: "家里的水杯",
        image: expect.stringContaining("wxfile://restored/images/custom/"),
        pictogramAttribution: expect.objectContaining({
          originalId: "web-family",
          author: "家属",
        }),
        patientId: "patient-current",
        workspaceId: "workspace-current",
      }),
    ]);
    expect([...harness.restoredAssets.values()]).toContainEqual(
      MEDIA_BYTES.image,
    );
  });

  test("restores a WeChat encrypted private picture snapshot in Web", async () => {
    const preference = createPrivatePreference(
      "source://wechat-family.png",
      "wechat-family",
    );
    const harness = createInteropHarness(createBoard("微信图库"), [preference]);
    const built = await harness.service.buildArchive(
      PICTURE_LIBRARY_ARCHIVE_SCOPES.custom,
    );
    if (!built.ok || !built.archive) {
      throw new Error(built.message);
    }
    const encryptedBytes = await encryptPrivateArchiveData(
      built.archive.data,
      PRIVATE_ARCHIVE_PASSPHRASE,
      deterministicRandomBytes,
    );
    const decryptedBlob = await decryptPrivateArchiveBlob({
      archive: new Blob([encryptedBytes], {
        type: PRIVATE_DEVICE_DATA_CONTENT_TYPE,
      }),
      passphrase: PRIVATE_ARCHIVE_PASSPHRASE,
    });

    const restored = await readWebPictureLibraryArchive({
      file: decryptedBlob,
      existingBoards: [],
      existingPersonalImagePreferences: [],
      existingMissingTokens: [],
      existingOrderingState: null,
      identity: {
        patientId: "patient-current",
        workspaceId: "workspace-current",
      },
      conflictStrategy: "merge",
    });

    expect(restored.personalImagePreferences).toEqual([
      expect.objectContaining({
        labelSnapshot: "家里的水杯",
        image: "data:image/png;base64,iVBORw0KGgo=",
        pictogramAttribution: expect.objectContaining({
          originalId: "wechat-family",
          author: "家属",
        }),
        patientId: "patient-current",
        workspaceId: "workspace-current",
      }),
    ]);
  });
});
