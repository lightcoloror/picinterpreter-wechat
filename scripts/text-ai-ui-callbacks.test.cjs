'use strict';
// Same actual-source callback harness as expression-ai-callbacks.test.cjs.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function extract(file, name, context) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let source;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) source = n.initializer.getText(ast); ts.forEachChild(n, visit); }
  visit(ast); assert.ok(source, name);
  const box = { ...context, module: { exports: {} } };
  vm.runInNewContext(ts.transpileModule('module.exports=' + source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
  return box.module.exports;
}
const receiver = 'features/communication/ReceiverWorkspace.tsx';
test('equivalent Care catalog refresh preserves AI comparison; identity/image edits invalidate it', () => {
  const boards = [{ id: 'synthetic', tiles: [
    { id: 'one', label: '合成人甲', image: 'wxfile://synthetic-one.png', personalReference: { personId: 'person-a' } }
  ] }];
  const key = value => extract(receiver, 'receiverCatalogSignature', { boards: value });
  assert.equal(key(boards), key(JSON.parse(JSON.stringify(boards))));
  const changed = JSON.parse(JSON.stringify(boards));
  changed[0].tiles[0].personalReference.personId = 'person-b';
  assert.notEqual(key(boards), key(changed));
  changed[0].tiles[0].image = 'wxfile://synthetic-two.png';
  assert.notEqual(key(boards), key(changed));
  const source = fs.readFileSync(path.join(__dirname, '../src', receiver), 'utf8');
  assert.match(source, /\[receiverSignature, receiverCatalogSignature, segmentationDraft\]/);
});
function fixture() {
  let availability = { available: true, contextKey: 'synthetic-a' };
  const calls = [], notices = [], suggestions = [], busy = [];
  const c = { preparationMode: false, aiPendingRef: { current: false }, aiGenerationRef: { current: 0 },
    receiverSignature: '我不喝水', receiverSignatureRef: { current: '我不喝水' }, boards: [],
    session: { inputText: '我不喝水', reviewItems: [] }, missingTokenRecords: [], correctionMemory: {},
    getTaroTextAiAvailability: () => availability, buildCommunicationAiResegmentRequest: x => x,
    taroCommunicationAiPort: { resegment: request => new Promise((resolve, reject) => calls.push({ request, resolve, reject })) },
    setPendingAiSuggestion: x => suggestions.push(x), setIsAiResegmenting: x => busy.push(x), setNotice: x => notices.push(x),
    applyCommunicationAiResegmentation: () => ({ applied: true, segmentation: ['我', '不', '喝水'] }),
    wechatSpeechPort: { stop() {} }
  };
  return { c, calls, notices, suggestions, busy, setAvailability: value => { availability = value; },
    generate: extract(receiver, 'handleAiResegmentation', c),
    hide: extract(receiver, 'invalidateTextAi', c) };
}
test('receiver double-click sends once and only presents a comparison, without accepting it', async () => {
  const f = fixture(), first = f.generate(); await f.generate();
  assert.equal(f.calls.length, 1);
  f.calls[0].resolve({ ok: true, value: {} }); await first;
  assert.equal(f.suggestions.filter(Boolean).length, 1);
  assert.equal(f.c.session.inputText, '我不喝水');
  assert.match(f.notices.at(-1), /比较/);
});
test('receiver hidden/context-changed response cannot update suggestions or new busy state', async () => {
  const f = fixture(), first = f.generate();
  f.hide(); f.calls[0].resolve({ ok: true, value: {} }); await first;
  assert.equal(f.suggestions.filter(Boolean).length, 0);
  const second = f.generate(); f.setAvailability({ available: true, contextKey: 'synthetic-b' });
  f.calls[1].resolve({ ok: true, value: {} }); await second;
  assert.equal(f.suggestions.filter(Boolean).length, 0);
});
test('receiver preparation and unavailable states never call AI; thrown calls release the explicit retry lock', async () => {
  const f = fixture();
  f.setAvailability({ available: false, message: '请选择额度', contextKey: 'a' });
  await f.generate(); assert.equal(f.calls.length, 0);
  assert.equal(f.notices[0], '请选择额度');
  const p = extract(receiver, 'handleAiResegmentation', { ...f.c, preparationMode: true });
  await p(); assert.equal(f.calls.length, 0);
  f.setAvailability({ available: true, contextKey: 'a' });
  const pending = f.generate(); f.calls[0].reject(new Error('synthetic')); await pending;
  assert.equal(f.c.aiPendingRef.current, false);
});
test('settings fixed-input connection is single-flight and discards hidden or changed-context completion', async () => {
  let scope = 'synthetic-a', calls = 0, finish;
  const notices = [], c = { aiTestPendingRef: { current: false }, aiUiGenerationRef: { current: 0 },
    getTaroTextAiAvailability: () => ({ available: true, contextKey: scope }),
    setAiTestBusy() {}, setAiBusy() {}, setAiTestNotice: x => notices.push(x), taroCommunicationAiPort: {},
    runCommunicationAiConnectionTest: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
  const file = 'packages/management/pages/index/index.tsx', run = extract(file, 'testAiConnection', c);
  const first = run(); await run(); assert.equal(calls, 1);
  scope = 'synthetic-b'; finish({ message: 'stale' }); await first; assert.deepEqual(notices, []);
  const second = run(); extract(file, 'invalidateAiUi', c)(); finish({ message: 'hidden' }); await second;
  assert.deepEqual(notices, []);
});
