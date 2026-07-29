import JSZip from "jszip";
import { describe, expect, test, vi } from "vitest";
import type { BoardDTO } from "@cboard-communication-core/dto";
import { OPEN_BOARD_IMPORT_BOARD_ID_PREFIX } from "@cboard-communication-core/openBoardFormat";
import {
  PICTURE_LIBRARY_ARCHIVE_MANIFEST,
  PICTURE_LIBRARY_ARCHIVE_SCOPES,
} from "@cboard-communication-core/pictureLibraryArchive";
import {
  LOCAL_DEVICE_DATA_EXPRESSIONS,
  LOCAL_DEVICE_DATA_MANIFEST,
  LOCAL_DEVICE_DATA_PURPOSES,
} from "@cboard-communication-core/localDeviceData";

import type {
  PictureLibraryArchivePort,
  PictureLibraryRestoreSession,
} from "../../platform/pictureLibraryArchivePort";
import type { CommunicationAacImportPort } from "../../platform/communicationAacImportPort";
import { createOpenBoardImportService } from "../aac-import/openBoardImportService";
import { createPictureLibraryBackupService } from "./pictureLibraryBackupService";

const VIDEO_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

function createMediaBoards(count: number, mediaKind: "sound" | "video") {
  return Array.from({ length: count }, (_, index) => {
    const board = createBoard(
      `媒体图库 ${index + 1}`,
      `source://image-${index}.png`,
      mediaKind === "sound" ? `wxfile://recordings/${index}.mp3` : "",
    );
    board.id = `media-board-${index}`;
    board.tiles[0].id = `media-tile-${index}`;
    board.tiles[0].boardId = board.id;
    board.layout.tileIds = [board.tiles[0].id];
    if (mediaKind === "video") {
      board.tiles[0].mediaType = "video";
      board.tiles[0].video = `wxfile://videos/${index}.mp4`;
    }
    return board;
  });
}

function createMediaBytes(mediaKind: "sound" | "video", size: number) {
  const data = new Uint8Array(size);
  data.set(mediaKind === "sound" ? [0x49, 0x44, 0x33, 0x04] : VIDEO_BYTES);
  return data;
}

async function replaceArchiveMedia(
  archiveData: Uint8Array,
  mediaDirectory: "sounds/" | "videos/",
  data: Uint8Array,
) {
  const zip = await JSZip.loadAsync(archiveData);
  const manifest = JSON.parse(
    await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST)!.async("text"),
  );
  const assets = manifest.assets.filter((asset: { path: string }) =>
    asset.path.startsWith(mediaDirectory),
  );
  for (const asset of assets) {
    asset.size = data.byteLength;
    zip.file(asset.path, data, {
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    });
  }
  zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST, JSON.stringify(manifest));
  return {
    archive: await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    }),
    assetCount: assets.length,
  };
}

function createBoard(name: string, image: string, sound = ""): BoardDTO {
  return {
    dtoType: "BoardDTO",
    version: 1,
    id: "daily",
    name,
    nameKey: "board.daily",
    category: "needs",
    layout: {
      columns: 1,
      rows: 1,
      tileIds: ["water"],
    },
    tiles: [
      {
        dtoType: "TileDTO",
        version: 1,
        id: "water",
        boardId: "daily",
        label: "水",
        vocalization: "水",
        image,
        sound,
        backgroundColor: "",
        keyPath: "",
        loadBoardId: "",
        communication: {
          synonyms: ["喝水"],
          relatedTerms: [],
          excludeTokens: [],
          category: "饮品",
        },
      },
    ],
  };
}

async function createGridsetArchive() {
  const zip = new JSZip();
  zip.file(
    "Grids/Home/grid.xml",
    `
      <Grid>
        <GridGuid>home-grid</GridGuid>
        <Name>主页</Name>
        <ColumnDefinitions>
          <ColumnDefinition />
          <ColumnDefinition />
        </ColumnDefinitions>
        <RowDefinitions><RowDefinition /></RowDefinitions>
        <AutoContentCommands />
        <Cells>
          <Cell X="0" Y="0">
            <Content>
              <Commands>
                <Command ID="Action.InsertText">
                  <Parameter Key="text"><r>我想喝水</r></Parameter>
                </Command>
              </Commands>
              <CaptionAndImage>
                <Caption>喝水</Caption>
                <Image>drink.png</Image>
              </CaptionAndImage>
              <Style>
                <BackColour>#112233FF</BackColour>
                <BorderColour>#445566FF</BorderColour>
              </Style>
            </Content>
          </Cell>
          <Cell X="1" Y="0">
            <Content>
              <Commands>
                <Command ID="Action.InsertText">
                  <Parameter Key="text"><r>需要帮助</r></Parameter>
                </Command>
              </Commands>
              <CaptionAndImage><Caption>帮助</Caption></CaptionAndImage>
            </Content>
          </Cell>
        </Cells>
      </Grid>
    `,
  );
  zip.file(
    "Grids/Home/drink.png",
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return zip.generateAsync({ type: "uint8array" });
}

function createHarness() {
  const defaultBoards = [createBoard("默认图库", "source://default.png")];
  let boards = [createBoard("原图库", "source://water.png")];
  let preferences: any[] = [];
  let missingTokens: any[] = [];
  let savedPhrases: any[] = [
    { id: "phrase-1", sentence: "我要喝水", output: [] },
  ];
  let savedPhraseTombstones: any[] = [];
  let history: any[] = [
    { id: "history-1", direction: "express", sentence: "我要喝水" },
  ];
  let receiverRecords: any[] = [];
  let receiverCorrections: any[] = [];
  let feedbackDrafts: any[] = [];
  let ordering = {
    schemaVersion: 1 as const,
    manualOrderByBoard: { daily: ["water"] },
    usageByTileKey: {
      "daily:water": { count: 3, lastUsedAt: 10 },
    },
  };
  let archiveData = new Uint8Array();
  let archiveName = "library.zip";
  const restoredAssets = new Map<string, Uint8Array>();
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const restoreSession: PictureLibraryRestoreSession = {
    async writeAsset(path, data) {
      restoredAssets.set(path, data);
      return `wxfile://restored/${path}`;
    },
    cleanup,
  };
  const archivePort: PictureLibraryArchivePort = {
    readAsset: vi.fn(async (source, mediaKind) => {
      if (mediaKind === "sound") {
        return {
          data: new Uint8Array([0x49, 0x44, 0x33, 0x04]),
          mediaType: "audio/mpeg",
          size: 4,
        };
      }
      if (mediaKind === "video") {
        return {
          data: VIDEO_BYTES,
          mediaType: "video/mp4",
          size: VIDEO_BYTES.byteLength,
        };
      }
      return {
        data: source.includes("local.png")
          ? new Uint8Array([9, 9, 9])
          : new Uint8Array([1, 2, 3]),
        mediaType: "image/png",
        size: 3,
      };
    }),
    chooseArchive: vi.fn(async () => ({
      ok: true,
      message: "已选择",
      value: { name: archiveName, data: archiveData },
    })),
    shareArchive: vi.fn(async (_name, data) => {
      archiveData = data;
      return {
        ok: true,
        message: "已分享",
        value: "wxfile://library.zip",
      };
    }),
    createRestoreSession: vi.fn().mockResolvedValue(restoreSession),
  };
  const repository = {
    loadCommunicationIdentity: () => ({
      patientId: "patient-current",
      workspaceId: "workspace-current",
    }),
    loadPersonalImagePreferences: () => preferences,
    loadAllPersonalImagePreferences: () => preferences,
    overwritePersonalImagePreferences: vi.fn((value: any[]) => {
      preferences = value;
      return preferences;
    }),
    overwriteAllPersonalImagePreferences: vi.fn((value: any[]) => {
      preferences = value;
      return preferences;
    }),
    loadMissingTokens: () => missingTokens,
    overwriteMissingTokens: vi.fn((value: any[]) => {
      missingTokens = value;
      return missingTokens;
    }),
    loadCommunicationSavedPhrases: () => savedPhrases,
    loadCommunicationSavedPhraseTombstones: () => savedPhraseTombstones,
    loadCommunicationHistory: () => history,
    loadReceiverRecords: () => receiverRecords,
    loadReceiverCorrections: () => receiverCorrections,
    loadExpressionCandidateFeedbackDrafts: () => feedbackDrafts,
    overwriteCommunicationSavedPhrases: vi.fn((value: any[]) => {
      savedPhrases = value;
      return savedPhrases;
    }),
    overwriteCommunicationSavedPhraseTombstones: vi.fn((value: any[]) => {
      savedPhraseTombstones = value;
      return savedPhraseTombstones;
    }),
    overwriteCommunicationHistory: vi.fn((value: any[]) => {
      history = value;
      return history;
    }),
    overwriteReceiverRecords: vi.fn((value: any[]) => {
      receiverRecords = value;
      return receiverRecords;
    }),
    overwriteReceiverCorrections: vi.fn((value: any[]) => {
      receiverCorrections = value;
      return receiverCorrections;
    }),
    overwriteExpressionCandidateFeedbackDrafts: vi.fn((value: any[]) => {
      feedbackDrafts = value;
      return feedbackDrafts;
    }),
  };
  const boardStore = {
    load: () => boards,
    save: (value: BoardDTO[]) => {
      boards = value;
      return boards;
    },
    reset: vi.fn(() => {
      boards = defaultBoards;
      return boards;
    }),
  };
  const orderingStore = {
    load: () => ordering,
    save: vi.fn((value: typeof ordering) => {
      ordering = value;
      return ordering;
    }),
  };
  const localDeviceDataPort = {
    removePrivateFile: vi.fn(async () => true),
    clearAllLocalData: vi.fn(async () => ({
      ok: true,
      message: "本机数据已清除。",
    })),
  };
  const aacImportPort: CommunicationAacImportPort = {
    configured: true,
    convert: vi.fn(async () => ({
      ok: true,
      message: "已转换",
      value: {
        sourceFormat: "snap",
        warnings: [],
        documents: [
          {
            path: "boards/snap-home.obf",
            board: {
              format: "open-board-0.1",
              id: "snap-home",
              name: "Snap 首页",
              buttons: [{ id: "water", label: "喝水" }],
              images: [],
              sounds: [],
              grid: { rows: 1, columns: 1, order: [["water"]] },
            },
          },
        ],
      },
    })),
  };
  const service = createPictureLibraryBackupService({
    repository,
    boardStore,
    orderingStore,
    archivePort,
    localDeviceDataPort,
    now: () => 123,
  });
  const importService = createOpenBoardImportService({
    boardStore,
    archivePort,
    aacImportPort,
  });

  return {
    service,
    importService,
    archivePort,
    repository,
    boardStore,
    orderingStore,
    cleanup,
    restoredAssets,
    localDeviceDataPort,
    aacImportPort,
    getArchive: () => archiveData,
    setBoards: (value: BoardDTO[]) => {
      boards = value;
    },
    setArchiveSelection: (name: string, data: Uint8Array) => {
      archiveName = name;
      archiveData = data;
    },
    getBoards: () => boards,
    setPreferences: (value: any[]) => {
      preferences = value;
    },
    setMissingTokens: (value: any[]) => {
      missingTokens = value;
    },
    getSavedPhrases: () => savedPhrases,
    setSavedPhrases: (value: any[]) => {
      savedPhrases = value;
    },
    getSavedPhraseTombstones: () => savedPhraseTombstones,
    setSavedPhraseTombstones: (value: any[]) => {
      savedPhraseTombstones = value;
    },
    getHistory: () => history,
    setHistory: (value: any[]) => {
      history = value;
    },
    getReceiverRecords: () => receiverRecords,
    setReceiverRecords: (value: any[]) => {
      receiverRecords = value;
    },
    getReceiverCorrections: () => receiverCorrections,
    setReceiverCorrections: (value: any[]) => {
      receiverCorrections = value;
    },
    getFeedbackDrafts: () => feedbackDrafts,
    setFeedbackDrafts: (value: any[]) => {
      feedbackDrafts = value;
    },
  };
}

describe("picture library backup service", () => {
  test("imports linked OBZ boards and stages supported images locally", async () => {
    const harness = createHarness();
    const zip = new JSZip();
    zip.file(
      "boards/home.obf",
      JSON.stringify({
        format: "open-board-0.1",
        id: "home",
        name: "导入首页",
        grid: { rows: 1, columns: 2, order: [["water", "more"]] },
        images: [{ id: "water-image", path: "images/water.png" }],
        sounds: [
          {
            id: "water-sound",
            path: "sounds/water.mp3",
            content_type: "audio/mpeg",
          },
        ],
        buttons: [
          {
            id: "water",
            label: "水",
            image_id: "water-image",
            sound_id: "water-sound",
          },
          {
            id: "more",
            label: "更多",
            load_board: { path: "boards/more.obf" },
          },
        ],
      }),
    );
    zip.file(
      "boards/more.obf",
      JSON.stringify({
        format: "open-board-0.1",
        id: "more",
        name: "更多",
        buttons: [{ id: "help", label: "帮帮我" }],
      }),
    );
    zip.file(
      "images/water.png",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    zip.file("sounds/water.mp3", new Uint8Array([0x49, 0x44, 0x33]));
    harness.setArchiveSelection(
      "standard.obz",
      await zip.generateAsync({ type: "uint8array" }),
    );

    const result = await harness.importService.importOpenBoard("merge");
    const importedBoards = harness
      .getBoards()
      .filter((board) =>
        board.id.startsWith(OPEN_BOARD_IMPORT_BOARD_ID_PREFIX),
      );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        message: expect.stringContaining("2 个"),
      }),
    );
    expect(harness.archivePort.chooseArchive).toHaveBeenCalledWith([
      "obf",
      "obz",
      "grd",
      "gridset",
      "gridsetx",
      "sps",
      "spb",
      "ce",
    ]);
    expect(importedBoards).toHaveLength(2);
    expect(importedBoards[0].tiles[0].image).toBe(
      "wxfile://restored/images/water.png",
    );
    expect(importedBoards[0].tiles[0].sound).toBe(
      "wxfile://restored/sounds/water.mp3",
    );
    expect(importedBoards[0].tiles[1].loadBoardId).toBe(importedBoards[1].id);
    expect(harness.restoredAssets.get("images/water.png")).toBeTruthy();
    expect(harness.restoredAssets.get("sounds/water.mp3")).toBeTruthy();
    expect(harness.cleanup).not.toHaveBeenCalled();
  });

  test("imports Snap through the authenticated server port and local merge pipeline", async () => {
    const harness = createHarness();
    harness.setArchiveSelection(
      "patient.sps",
      new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65]),
    );

    const result = await harness.importService.importOpenBoard("merge");
    const imported = harness
      .getBoards()
      .find((board) => board.name === "Snap 首页");

    expect(result.ok).toBe(true);
    expect(harness.aacImportPort.convert).toHaveBeenCalledWith({
      name: "patient.sps",
      data: expect.any(Uint8Array),
      locale: "zh-CN",
    });
    expect(imported?.tiles[0].label).toBe("喝水");
  });

  test("rejects an invalid OBF without changing the current library", async () => {
    const harness = createHarness();
    harness.setArchiveSelection(
      "broken.obf",
      new Uint8Array([0x7b, 0x22, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74]),
    );
    const before = harness.getBoards();

    const result = await harness.importService.importOpenBoard("merge");

    expect(result.ok).toBe(false);
    expect(harness.getBoards()).toBe(before);
  });

  test("imports a single OBF and persists an embedded supported image", async () => {
    const harness = createHarness();
    const inlinePng = Buffer.from(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
      .toString("base64")
      .replace(/=+$/, "");
    const board = {
      format: "open-board-0.1",
      id: "single",
      name: "单板",
      images: [{ id: "yes-image", data: `data:image/png;base64,${inlinePng}` }],
      buttons: [{ id: "yes", label: "是", image_id: "yes-image" }],
    };
    harness.setArchiveSelection(
      "single.obf",
      new Uint8Array(Buffer.from(JSON.stringify(board), "utf8")),
    );

    const result = await harness.importService.importOpenBoard("skip");
    const imported = harness.getBoards().find((item) => item.name === "单板");

    expect(result.ok).toBe(true);
    expect(imported?.tiles[0].image).toMatch(
      /^wxfile:\/\/restored\/images\/open-board\//,
    );
  });

  test("imports an AsTeRICS Grid with navigation and embedded image", async () => {
    const harness = createHarness();
    const inlinePng = Buffer.from(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ).toString("base64");
    const asterics = {
      metadata: { homeGridId: "home" },
      grids: [
        {
          id: "home",
          label: { en: "Home", zh: "首页" },
          rowCount: 1,
          minColumnCount: 2,
          gridElements: [
            {
              id: "water",
              x: 0,
              y: 0,
              label: { en: "Water", zh: "喝水" },
              image: {
                data: `data:image/png;base64,${inlinePng}`,
                author: "家庭提供",
              },
              actions: [
                {
                  modelName: "GridActionSpeakCustom",
                  speakText: { en: "Drink water", zh: "我要喝水" },
                },
              ],
            },
            {
              id: "more",
              x: 1,
              y: 0,
              label: { en: "More", zh: "更多" },
              actions: [
                {
                  modelName: "GridActionNavigate",
                  toGridId: "details",
                },
              ],
            },
          ],
        },
        {
          id: "details",
          label: { en: "Details", zh: "更多需要" },
          rowCount: 1,
          minColumnCount: 1,
          gridElements: [
            {
              id: "toilet",
              x: 0,
              y: 0,
              label: { en: "Toilet", zh: "厕所" },
              actions: [{ modelName: "GridActionSpeak" }],
            },
          ],
        },
      ],
    };
    harness.setArchiveSelection(
      "family.grd",
      new Uint8Array(Buffer.from(JSON.stringify(asterics), "utf8")),
    );

    const result = await harness.importService.importOpenBoard("merge");
    const imported = harness
      .getBoards()
      .filter((board) =>
        board.id.startsWith(OPEN_BOARD_IMPORT_BOARD_ID_PREFIX),
      );

    expect(result.ok).toBe(true);
    expect(imported).toHaveLength(2);
    expect(imported[0].name).toBe("首页");
    expect(imported[0].tiles[0]).toEqual(
      expect.objectContaining({
        label: "喝水",
        vocalization: "我要喝水",
        image: expect.stringMatching(
          /^wxfile:\/\/restored\/images\/open-board\//,
        ),
      }),
    );
    expect(imported[0].tiles[1].loadBoardId).toBe(imported[1].id);
    expect(imported[1].tiles[0].label).toBe("厕所");
  });

  test("imports an unencrypted Gridset with its layout and embedded image", async () => {
    const harness = createHarness();
    harness.setArchiveSelection("family.gridset", await createGridsetArchive());

    const result = await harness.importService.importOpenBoard("merge");
    const imported = harness.getBoards().find((board) => board.name === "主页");

    expect(result.ok).toBe(true);
    expect(imported).toEqual(
      expect.objectContaining({
        layout: expect.objectContaining({ rows: 1, columns: 2 }),
      }),
    );
    expect(imported?.tiles[0]).toEqual(
      expect.objectContaining({
        label: "喝水",
        vocalization: "我想喝水",
        image: expect.stringMatching(
          /^wxfile:\/\/restored\/images\/open-board\//,
        ),
      }),
    );
    expect(imported?.tiles[1]).toEqual(
      expect.objectContaining({
        label: "帮助",
        vocalization: "需要帮助",
      }),
    );
  });

  test("rejects encrypted Gridset files without changing the library", async () => {
    const harness = createHarness();
    const before = harness.getBoards();
    harness.setArchiveSelection(
      "private.gridsetx",
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    );

    const result = await harness.importService.importOpenBoard("merge");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("不支持加密的 Gridset");
    expect(harness.getBoards()).toBe(before);
  });

  test("exports and restores a full WeChat ZIP with progress", async () => {
    const harness = createHarness();
    const progress = vi.fn();
    const board = createBoard(
      "原图库",
      "source://water.png",
      "wxfile://recordings/water.mp3",
    );
    board.tiles[0].mediaType = "video";
    board.tiles[0].video = "wxfile://videos/water.mp4";
    harness.setBoards([board]);

    const exported = await harness.service.exportArchive(
      PICTURE_LIBRARY_ARCHIVE_SCOPES.full,
      progress,
    );
    const zip = await JSZip.loadAsync(harness.getArchive());
    const manifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST)!.async("text"),
    );
    expect(exported.ok).toBe(true);
    expect(manifest).toEqual(
      expect.objectContaining({
        sourcePlatform: "wechat-miniprogram",
        scope: "full",
        stats: expect.objectContaining({
          boardCount: 1,
          assetCount: 3,
          pictureAssetCount: 1,
          soundAssetCount: 1,
          videoAssetCount: 1,
        }),
      }),
    );

    harness.setBoards([createBoard("本机冲突图库", "source://local.png")]);
    const imported = await harness.service.importArchive("merge", progress);

    expect(imported.ok).toBe(true);
    expect(harness.getBoards()[0]).toEqual(
      expect.objectContaining({
        name: "原图库",
        category: "needs",
        layout: {
          columns: 1,
          rows: 1,
          tileIds: ["water"],
        },
      }),
    );
    expect(harness.getBoards()[0].tiles[0].image).toContain(
      "wxfile://restored/images/boards/",
    );
    expect(harness.getBoards()[0].tiles[0].sound).toContain(
      "wxfile://restored/sounds/boards/",
    );
    expect(harness.getBoards()[0].tiles[0]).toEqual(
      expect.objectContaining({
        mediaType: "video",
        video: expect.stringContaining("wxfile://restored/videos/boards/"),
      }),
    );
    expect(
      [...harness.restoredAssets.keys()].some((path) =>
        path.startsWith("sounds/boards/"),
      ),
    ).toBe(true);
    expect(
      [...harness.restoredAssets.keys()].some((path) =>
        path.startsWith("videos/boards/"),
      ),
    ).toBe(true);
    expect(harness.restoredAssets.size).toBe(3);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "complete", percent: 100 }),
    );
  });

  test("reuses archive bytes for private cloud review and restore", async () => {
    const harness = createHarness();

    const built = await harness.service.buildArchive("custom");

    expect(built).toEqual(
      expect.objectContaining({
        ok: true,
        archive: expect.objectContaining({
          fileName: expect.stringContaining("picture-library-custom"),
          data: expect.any(Uint8Array),
        }),
        summary: expect.objectContaining({ scope: "custom" }),
      }),
    );
    expect(harness.archivePort.shareArchive).not.toHaveBeenCalled();

    const inspected = await harness.service.inspectArchiveData(
      built.archive!.data,
    );
    expect(inspected).toEqual(
      expect.objectContaining({
        ok: true,
        summary: expect.objectContaining({ scope: "custom" }),
      }),
    );

    const restored = await harness.service.restoreArchiveData(
      built.archive!.data,
      "merge",
    );
    expect(restored.ok).toBe(true);
    expect(harness.archivePort.chooseArchive).not.toHaveBeenCalled();
  });

  test("reuses byte-identical current CBoard assets during a full restore", async () => {
    const harness = createHarness();
    harness.setBoards([
      createBoard(
        "当前 CBoard 图库",
        "source://water.png",
        "wxfile://recordings/water.mp3",
      ),
    ]);
    const built = await harness.service.buildArchive("full");

    const restored = await harness.service.restoreArchiveData(
      built.archive!.data,
      "merge",
    );

    expect(restored.ok).toBe(true);
    expect(harness.getBoards()[0].tiles[0].image).toBe(
      "source://water.png",
    );
    expect(harness.getBoards()[0].tiles[0].sound).toBe(
      "wxfile://recordings/water.mp3",
    );
    expect(harness.restoredAssets.size).toBe(0);
  });

  test("rejects a tampered tile recording without replacing local boards", async () => {
    const harness = createHarness();
    harness.setBoards([
      createBoard(
        "待备份图库",
        "source://water.png",
        "wxfile://recordings/water.mp3",
      ),
    ]);
    const built = await harness.service.buildArchive("full");
    const zip = await JSZip.loadAsync(built.archive!.data);
    const manifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST)!.async("text"),
    );
    const soundPath = manifest.assets.find((asset: { path: string }) =>
      asset.path.startsWith("sounds/"),
    ).path;
    zip.file(soundPath, new Uint8Array([1, 2, 3, 4]));
    const tampered = await zip.generateAsync({ type: "uint8array" });
    harness.setArchiveSelection("tampered-recording.zip", tampered);
    harness.setBoards([createBoard("当前本机图库", "source://local.png")]);

    const restored = await harness.service.importArchive("merge");

    expect(restored.ok).toBe(false);
    expect(harness.getBoards()[0].name).toBe("当前本机图库");
    expect(harness.cleanup).toHaveBeenCalled();
  });

  test("rejects recordings above the aggregate restore limit", async () => {
    const harness = createHarness();
    harness.setBoards(createMediaBoards(5, "sound"));
    const built = await harness.service.buildArchive("full");
    const oversized = await replaceArchiveMedia(
      built.archive!.data,
      "sounds/",
      createMediaBytes("sound", 4 * 1024 * 1024 + 1),
    );
    expect(oversized.assetCount).toBe(5);

    harness.setBoards([createBoard("当前本机图库", "source://local.png")]);
    const restored = await harness.service.restoreArchiveData(
      oversized.archive,
      "merge",
    );

    expect(restored).toEqual(
      expect.objectContaining({
        ok: false,
        message: "图库恢复失败，原有图库未被替换。",
      }),
    );
    expect(harness.getBoards()[0].name).toBe("当前本机图库");
    expect(harness.cleanup).toHaveBeenCalled();
  });

  test("does not count videos against the recording restore limit", async () => {
    const harness = createHarness();
    harness.setBoards(createMediaBoards(3, "video"));
    const built = await harness.service.buildArchive("full");
    const videos = await replaceArchiveMedia(
      built.archive!.data,
      "videos/",
      createMediaBytes("video", 7 * 1024 * 1024),
    );
    expect(videos.assetCount).toBe(3);

    harness.setBoards([createBoard("当前本机图库", "source://local.png")]);
    const restored = await harness.service.restoreArchiveData(
      videos.archive,
      "merge",
    );

    expect(restored.ok).toBe(true);
    expect(harness.getBoards()).toHaveLength(4);
    expect(
      harness
        .getBoards()
        .find((board) => board.id === "media-board-0")?.tiles[0].video,
    ).toContain(
      "wxfile://restored/videos/boards/",
    );
  });

  test("rejects malformed cloud archive bytes before changing local data", async () => {
    const harness = createHarness();
    const before = harness.getBoards();

    expect(
      await harness.service.inspectArchiveData(new Uint8Array([1, 2, 3])),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(
      await harness.service.restoreArchiveData(
        new Uint8Array([1, 2, 3]),
        "merge",
      ),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(harness.getBoards()).toBe(before);
  });

  test("cleans staged files and preserves the local library on invalid ZIP", async () => {
    const harness = createHarness();
    await harness.service.exportArchive("full");
    const zip = await JSZip.loadAsync(harness.getArchive());
    const manifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST)!.async("text"),
    );
    zip.remove(manifest.assets[0].path);
    const broken = await zip.generateAsync({ type: "uint8array" });
    vi.mocked(harness.archivePort.chooseArchive).mockResolvedValueOnce({
      ok: true,
      message: "已选择",
      value: { name: "broken.zip", data: broken },
    });

    const before = harness.getBoards();
    const imported = await harness.service.importArchive("merge");

    expect(imported).toEqual(
      expect.objectContaining({
        ok: false,
        message: "图库恢复失败，原有图库未被替换。",
      }),
    );
    expect(harness.getBoards()).toBe(before);
    expect(harness.cleanup).toHaveBeenCalled();
  });

  test("restores packaged defaults without deleting personal communication data", () => {
    const harness = createHarness();
    harness.setBoards([
      createBoard("导入图库", "wxfile://restored/imported.png"),
    ]);

    const result = harness.service.resetToDefaults();

    expect(result).toEqual({
      ok: true,
      message:
        "已恢复默认 CBoard 图库：1 个沟通板。" + "个人图片和沟通记录均已保留。",
    });
    expect(harness.getBoards()[0].name).toBe("默认图库");
    expect(harness.boardStore.reset).toHaveBeenCalledTimes(1);
    expect(
      harness.repository.overwritePersonalImagePreferences,
    ).not.toHaveBeenCalled();
    expect(harness.repository.overwriteMissingTokens).not.toHaveBeenCalled();
    expect(harness.orderingStore.save).not.toHaveBeenCalled();
  });

  test("reports a reset failure without claiming the library changed", () => {
    const harness = createHarness();
    vi.mocked(harness.boardStore.reset).mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });

    expect(harness.service.resetToDefaults()).toEqual({
      ok: false,
      message: "恢复默认图库失败，当前图库未被替换。",
    });
    expect(harness.getBoards()[0].name).toBe("原图库");
  });

  test("exports a full device ZIP with explicit expression sidecars", async () => {
    const harness = createHarness();
    harness.setSavedPhraseTombstones([
      {
        id: "phrase-deleted",
        deletedAt: 2,
        deletedBy: "local",
        serverVersion: 1,
        pending: true,
      },
    ]);

    const result = await harness.service.exportDeviceDataArchive();
    const zip = await JSZip.loadAsync(harness.getArchive());
    const deviceManifest = JSON.parse(
      await zip.file(LOCAL_DEVICE_DATA_MANIFEST)!.async("text"),
    );
    const expressions = JSON.parse(
      await zip.file(LOCAL_DEVICE_DATA_EXPRESSIONS)!.async("text"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        summary: expect.objectContaining({
          deviceDataStats: expect.objectContaining({
            savedPhraseCount: 1,
            expressionCount: 1,
          }),
        }),
      }),
    );
    expect(deviceManifest.format).toBe("picinterpreter-local-device-data");
    expect(expressions.history[0].sentence).toBe("我要喝水");
    expect(expressions.savedPhraseTombstones[0].id).toBe("phrase-deleted");
  });

  test("builds and restores a compact account snapshot without default boards", async () => {
    const harness = createHarness();
    harness.setHistory([
      {
        id: "history-cloud",
        direction: "express",
        sentence: "我要喝水",
        labels: ["水"],
        sessionId: "session-cloud",
        createdAt: 2,
        updatedAt: 2,
      },
    ]);

    const built = await harness.service.buildPrivateDeviceDataArchive();
    const zip = await JSZip.loadAsync(built.archive!.data);
    const libraryManifest = JSON.parse(
      await zip.file(PICTURE_LIBRARY_ARCHIVE_MANIFEST)!.async("text"),
    );
    const deviceManifest = JSON.parse(
      await zip.file(LOCAL_DEVICE_DATA_MANIFEST)!.async("text"),
    );

    expect(built).toEqual(
      expect.objectContaining({
        ok: true,
        archive: expect.objectContaining({
          fileName: expect.stringContaining("private-device-data"),
        }),
      }),
    );
    expect(libraryManifest.scope).toBe(PICTURE_LIBRARY_ARCHIVE_SCOPES.custom);
    expect(libraryManifest.boards).toEqual([]);
    expect(deviceManifest.purpose).toBe(
      LOCAL_DEVICE_DATA_PURPOSES.accountPrivateSnapshot,
    );

    harness.setHistory([]);
    const restored = await harness.service.restoreArchiveData(
      built.archive!.data,
      "merge",
    );

    expect(restored.ok).toBe(true);
    expect(harness.getHistory()[0].sentence).toBe("我要喝水");
  });

  test("restores every full-device sidecar in the picture-library transaction", async () => {
    const harness = createHarness();
    harness.setSavedPhrases([
      {
        id: "phrase-1",
        sentence: "备份里的常用语",
        output: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    harness.setSavedPhraseTombstones([
      {
        id: "phrase-deleted",
        deletedAt: 3,
        deletedBy: "local",
        serverVersion: 1,
        pending: true,
      },
    ]);
    harness.setHistory([
      {
        id: "history-backup",
        direction: "express",
        sentence: "备份里的沟通历史",
        sessionId: "session-backup",
        patientId: "patient-old",
        workspaceId: "workspace-old",
        createdAt: 4,
        updatedAt: 4,
      },
    ]);
    harness.setReceiverRecords([
      {
        id: "receiver-backup",
        direction: "receive",
        sentence: "备份里的接收记录",
        labels: ["接收"],
        recordStatus: "confirmed",
        sessionId: "session-backup",
        patientId: "patient-old",
        workspaceId: "workspace-old",
        createdAt: 5,
        updatedAt: 5,
      },
    ]);
    harness.setReceiverCorrections([
      {
        id: "correction-backup",
        expressionId: "receiver-backup",
        sessionId: "session-backup",
        patientId: "patient-old",
        workspaceId: "workspace-old",
        action: "replace_pictogram",
        originalToken: "旧词",
        normalizedToken: "新词",
        createdAt: 6,
      },
    ]);
    harness.setFeedbackDrafts([
      {
        id: "feedback-backup",
        sessionId: "session-backup",
        outputSignature: "output-backup",
        candidates: [
          { sentence: "备份里的候选句。", feedback: "up" },
        ],
        createdAt: 7,
        updatedAt: 7,
      },
    ]);

    const exported = await harness.service.exportDeviceDataArchive();
    const archive = harness.getArchive();
    expect(exported.ok).toBe(true);

    harness.setSavedPhrases([
      {
        id: "phrase-1",
        sentence: "本机冲突常用语",
        output: [],
        createdAt: 8,
        updatedAt: 8,
      },
      {
        id: "phrase-local",
        sentence: "仅本机常用语",
        output: [],
        createdAt: 8,
        updatedAt: 8,
      },
    ]);
    harness.setSavedPhraseTombstones([]);
    harness.setHistory([
      {
        id: "history-local",
        direction: "express",
        sentence: "仅本机沟通历史",
        createdAt: 8,
        updatedAt: 8,
      },
    ]);
    harness.setReceiverRecords([]);
    harness.setReceiverCorrections([]);
    harness.setFeedbackDrafts([]);
    harness.setArchiveSelection("picinterpreter-local-device-data.zip", archive);

    const restored = await harness.service.importArchive("merge");

    expect(restored).toEqual(
      expect.objectContaining({
        ok: true,
        message: expect.stringContaining("完整本机数据恢复完成"),
        summary: expect.objectContaining({
          deviceDataStats: expect.objectContaining({
            savedPhraseCount: 1,
            expressionCount: 2,
            correctionCount: 1,
            draftCount: 1,
          }),
        }),
      }),
    );
    expect(harness.getSavedPhrases().map((entry) => entry.sentence)).toEqual([
      "备份里的常用语",
      "仅本机常用语",
    ]);
    expect(harness.getSavedPhraseTombstones()[0].id).toBe("phrase-deleted");
    expect(harness.getHistory().map((entry) => entry.id)).toEqual([
      "history-backup",
      "history-local",
    ]);
    expect(harness.getReceiverRecords()[0]).toEqual(
      expect.objectContaining({
        id: "receiver-backup",
        patientId: "patient-current",
        workspaceId: "workspace-current",
      }),
    );
    expect(harness.getReceiverCorrections()[0]).toEqual(
      expect.objectContaining({
        id: "correction-backup",
        patientId: "patient-current",
        workspaceId: "workspace-current",
      }),
    );
    expect(harness.getFeedbackDrafts()[0].id).toBe("feedback-backup");
  });

  test("clears private files and metadata together", async () => {
    const harness = createHarness();
    const privateSource = {
      provider: "device-private",
      originalId: "private-1",
      name: "本机图片",
      license: "用户提供，仅限本机使用",
      sourceUrl: "device-private://private-1",
    };
    harness.setPreferences([
      {
        scope: "device-private",
        tileId: "family",
        boardId: "daily",
        labelSnapshot: "家人",
        image: "wxfile://family.png",
        pictogramAttribution: privateSource,
        patientId: "patient-current",
        workspaceId: "workspace-current",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    harness.setMissingTokens([
      {
        id: "private-record",
        normalizedToken: "家人",
        status: "resolved",
        occurrenceCount: 1,
        scenes: ["receiver"],
        rawTextSamples: ["找家人"],
        suggestedPictogramId: null,
        suggestedPictogram: null,
        source: "device-private",
        resolvedPictogramId: "private-1",
        resolvedPictogram: {
          id: "private-1",
          label: "家人",
          image: "wxfile://private.png",
          source: privateSource,
        },
        reviewedByCaregiver: true,
        patientId: "patient-current",
        workspaceId: "workspace-current",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const result = await harness.service.clearPrivatePictograms();

    expect(result.ok).toBe(true);
    expect(
      harness.localDeviceDataPort.removePrivateFile.mock.calls
        .map((call) => call[0])
        .sort(),
    ).toEqual(["wxfile://family.png", "wxfile://private.png"]);
    expect(
      harness.repository.overwriteAllPersonalImagePreferences,
    ).toHaveBeenCalledWith([]);
    expect(harness.repository.overwriteMissingTokens).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "private-record",
        status: "new",
        resolvedPictogram: null,
      }),
    ]);
  });

  test("keeps private metadata when a physical file cannot be removed", async () => {
    const harness = createHarness();
    harness.setPreferences([
      {
        scope: "device-private",
        tileId: "family",
        boardId: "daily",
        labelSnapshot: "家人",
        image: "wxfile://locked.png",
        pictogramAttribution: {
          provider: "device-private",
          originalId: "locked",
          name: "本机图片",
          license: "用户提供，仅限本机使用",
          sourceUrl: "device-private://locked",
        },
        patientId: "patient-current",
        workspaceId: "workspace-current",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    harness.localDeviceDataPort.removePrivateFile.mockResolvedValueOnce(false);

    expect(await harness.service.clearPrivatePictograms()).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(
      harness.repository.overwriteAllPersonalImagePreferences,
    ).not.toHaveBeenCalled();
  });
});
