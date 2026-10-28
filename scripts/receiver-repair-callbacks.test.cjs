'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const file = path.resolve(__dirname, '../src/features/communication/ReceiverWorkspace.tsx');
const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name, context) {
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) source = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(source, name);
  const box = { module: { exports: {} }, ...context };
  vm.runInNewContext(ts.transpileModule('module.exports = ' + source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
  return box.module.exports;
}

test('assistance is cancelled or invalidated by content change; write failure does not present; retry and double click present once', () => {
  let fail = true, writes = 0, shown = 0;
  const notices = [], ref = { current: 'current-content' }, draft = { current: { id: 'draft', recordStatus: 'draft' } };
  const context = { assistanceRef: ref, meaningKeyRef: { current: 'current-content' }, displayOpeningRef: { current: false },
    session: { inputText: '你要不要喝水？', reviewItems: [{token:'要不要', tile:null}] }, repairSource: null, activeDraftRef: draft,
    prepareReceiverAssistedItems: items => items, replaceReceiverReviewItems: session => session,
    buildReceiverHistoryEntry: text => ({ inputText:text }), withReceiverRepair: value => value,
    onUpdateDraft: () => { writes++; return fail ? null : draft.current; },
    onCreateDraft: () => { throw Error('must use existing draft'); },
    setActiveDraft: value => { draft.current=value; }, setSession() {}, setAssistanceRequest() {},
    setDraftSaveError: value => notices.push(value),
    handleOpenDisplay: (_session, assisted) => { assert.equal(assisted,true); shown++; context.displayOpeningRef.current=true; }
  };
  context.cancelAssistance=extract('cancelAssistance',context);
  const confirm=extract('confirmAssistance',context);
  context.cancelAssistance(); confirm(); assert.equal(writes,0);
  ref.current='old-content'; confirm(); assert.equal(writes,0);
  ref.current='current-content'; confirm(); assert.equal(shown,0); assert.match(notices[0],/未保存/);
  fail=false; confirm(); confirm(); assert.equal(writes,2); assert.equal(shown,1);
});
for (const change of ['none', 'text', 'person', 'repair-source']) test(`confirmed assistance redisplay: ${change}`, () => {
  const current = { id: 'confirmed', recordStatus: 'confirmed', inputText: '合成林安喝水',
    repairOfRecordId: 'original', output: [{ id: 'same-card', personId: 'synthetic-a' }] };
  const entry = JSON.parse(JSON.stringify(current));
  if (change === 'text') entry.inputText = '合成林安不喝水';
  if (change === 'person') entry.output[0].personId = 'synthetic-b';
  if (change === 'repair-source') entry.repairOfRecordId = 'other-original';
  let created = 0, shown = 0;
  const ref = { current }, opening = { current: false };
  const context = { assistanceRef: { current: 'content' }, meaningKeyRef: { current: 'content' }, displayOpeningRef: opening,
    session: { inputText: entry.inputText, reviewItems: [] }, repairSource: null, activeDraftRef: ref,
    prepareReceiverAssistedItems: items => items, replaceReceiverReviewItems: session => session,
    buildReceiverHistoryEntry: () => entry, withReceiverRepair: value => value,
    receiverDraftContentSignature: value => JSON.stringify([value.inputText, value.output]),
    onUpdateDraft: () => { throw Error('confirmed record must not be edited'); },
    onCreateDraft: value => { created++; return { ...value, id: 'new-draft', recordStatus: 'draft' }; },
    setActiveDraft: value => { ref.current = value; }, setSession() {}, cancelAssistance() {},
    setDraftSaveError: value => { throw Error(value); },
    handleOpenDisplay: (_session, assisted) => { assert.equal(assisted, true); shown++; opening.current = true; }
  };
  const snapshot = JSON.stringify(current), confirm = extract('confirmAssistance', context);
  confirm(); confirm();
  assert.equal(created, change === 'none' ? 0 : 1);
  assert.equal(shown, 1);
  assert.equal(ref.current.id, change === 'none' ? 'confirmed' : 'new-draft');
  assert.equal(JSON.stringify(current), snapshot);
});

test('repeated repair starts use one saved draft and invalidate prior AI work', () => {
  let creates = 0, editing = false, stopped = 0;
  const ref = { current: { id: 'source', recordStatus: 'confirmed' } };
  const context = { repairSource: ref.current, activeDraftRef: ref,
    session: { inputText: '合成人甲不喝水', reviewItems: [] },
    buildReceiverHistoryEntry: (text, items) => ({ inputText: text, items }),
    withReceiverRepair: (entry, source) => ({ ...entry, repairOfRecordId: source.id }),
    onCreateDraft: entry => { creates++; return { ...entry, id: 'draft', recordStatus: 'draft' }; },
    setActiveDraft: record => { ref.current = record; },
    aiGenerationRef: { current: 1 }, aiPendingRef: { current: false }, setIsAiResegmenting() {}, setPendingAiSuggestion() {},
    setRepairEditing: value => { editing = value; }, setNotice() {},
    wechatSpeechPort: { stop() { stopped++; } } };
  const start = extract('startRepair', context);
  start('text'); start('pictures');
  assert.equal(creates, 1); assert.equal(editing, true); assert.equal(stopped, 2);
  assert.equal(context.aiGenerationRef.current, 3);
});
test('storage failure never claims repair mode is saved', () => {
  const notices = [], edit = [];
  const start = extract('startRepair', { repairSource: { id: 'source' }, activeDraftRef: { current: null },
    session: { inputText: '合成', reviewItems: [] }, buildReceiverHistoryEntry: () => ({}), withReceiverRepair: value => value,
    onCreateDraft: () => null, setNotice: value => notices.push(value), setRepairEditing: value => edit.push(value),
    wechatSpeechPort: { stop() {} } });
  start('text'); assert.equal(edit.length, 0); assert.match(notices[0], /未保存/);
});
test('segmented redisplay uses confirmed original without new history or playback', () => {
  const calls = [], context = { repairSource: { id: 'source', inputText: '合成原句' },
    repairEditing: false, displayOpeningRef: { current: false }, boards: [],
    restoreReceiverWorkspaceFromRecord: () => ({ session: { outputPreview: [] } }),
    onOpenDisplay: (...args) => calls.push(args) };
  const reopen = extract('reopenRepairOriginal', context);
  reopen(); reopen();
  assert.equal(calls.length, 1); assert.equal(calls[0][1], '合成原句');
  assert.equal(calls[0][4].autoPlay, false); assert.equal(calls[0][4].startSegmented, true);
});

test('manual rematch updates the existing repair draft instead of deduplicating back to stale contents', () => {
  const ref = { current: { id: 'draft', recordStatus: 'draft', repairOfRecordId: 'original' } };
  let updated = 0, created = 0;
  const context = {
    boards: [], missingTokenRecords: [], correctionMemory: {}, repairSource: { id: 'original' },
    runReceiverSession: inputText => ({ inputText, segments: [inputText], reviewItems: [{ token: inputText, tile: {} }], matched: true, quality: { needsReview: false } }),
    setSession() {}, setSegmentationDraft() {}, closePictogramPicker() {}, setNotice() {},
    formatReceiverSegmentation: value => value.join(''), activeDraftRef: ref,
    setActiveDraft: value => { ref.current = value; },
    buildReceiverHistoryEntry: inputText => ({ inputText }), withReceiverRepair: value => value,
    onUpdateDraft: (draft, entry) => { updated++; return { ...draft, ...entry }; },
    onCreateDraft: () => { created++; return ref.current; }
  };
  extract('handleMatchForText', context)('合成人甲不喝水');
  assert.equal(updated, 1); assert.equal(created, 0);
  assert.equal(ref.current.inputText, '合成人甲不喝水');
  assert.equal(ref.current.repairOfRecordId, 'original');
});

test('cancel repair invalidates every pending input and restores original only after storage succeeds', () => {
  const source = { id: 'original', inputText: '合成原句' }, calls = [];
  const context = { repairSource: source, boards: [], activeDraftRef: { current: { id: 'draft', recordStatus: 'draft' } },
    restoreReceiverWorkspaceFromRecord: () => ({ session: { inputText: source.inputText }, segmentationDraft: source.inputText }),
    onDiscardResumableRecord: () => true, setNotice() {}, setPendingAiSuggestion() {}, setIsAiResegmenting() {},
    aiGenerationRef: { current: 1 }, aiPendingRef: { current: false }, recognitionGenerationRef: { current: 1 }, dialectGenerationRef: { current: 1 }, dialectAudioGenerationRef: { current: 1 },
    wechatRecognitionPort: { cancel: () => calls.push('cancel-recognition') }, taroDialectAudioRecognitionPort: { cancel: () => calls.push('cancel-dialect') },
    wechatSpeechPort: { stop: () => calls.push('stop') }, clearRecognitionActivity() {}, setIsListening() {}, setIsDialectNormalizing() {}, setDialectAudioPhase() {},
    setSession: value => calls.push(value.inputText), setSegmentationDraft() {}, setActiveDraft() {}, setRepairEditing() {}, closePictogramPicker() {} };
  extract('cancelRepair', context)();
  assert.equal(context.dialectAudioGenerationRef.current, 2);
  assert.deepEqual(calls, ['cancel-recognition', 'cancel-dialect', 'stop', '合成原句']);
});
