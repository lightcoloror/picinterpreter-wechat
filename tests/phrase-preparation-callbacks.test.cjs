'use strict';
// Reuse the receiver-repair callback harness against the actual workspace source.
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

test('preparation confirmation calls only its save callback, never history, display or speech', () => {
  const entry = { inputText: '我不想吃饭', output: [{ textOnly: true, label: '我不想吃饭' }] };
  const calls = [], ref = { current: false };
  const confirm = extract('handleOpenDisplay', {
    preparationMode: true, displayOpeningRef: ref, session: { quality: { needsReview: false } },
    buildConfirmedReceiverHistory: () => entry, onConfirmPreparedPhrase: value => calls.push(value)
    // No normal-confirmation, display, output or speech dependencies are supplied.
  });
  confirm(); assert.deepEqual(calls, [entry]); assert.equal(ref.current, false);
});

test('unreviewed preparation cannot save and a failed save releases the click guard', () => {
  const notices = [], ref = { current: false }, session = { quality: { needsReview: true } };
  const confirm = extract('handleOpenDisplay', { preparationMode: true, displayOpeningRef: ref, session,
    buildConfirmedReceiverHistory: () => ({}), setNotice: value => notices.push(value),
    onConfirmPreparedPhrase: () => { throw new Error('synthetic storage failure'); } });
  confirm(); assert.equal(notices.length, 1); assert.equal(ref.current, false);
  session.quality.needsReview = false;
  assert.throws(confirm, /storage failure/); assert.equal(ref.current, false);
});

test('clearing preparation text updates its own draft instead of deleting the ordinary resumable draft', () => {
  const draft = { id: 'preparation', recordStatus: 'draft' }, calls = [];
  const persist = extract('persistInputDraft', { preparationMode: true, activeDraft: draft, repairRequested: false, repairSource: null,
    wechatSpeechPort: { stop() {} }, withReceiverRepair: entry => entry,
    buildReceiverHistoryEntry: inputText => ({ inputText }),
    onUpdateDraft: (saved, entry) => { calls.push([saved.id, entry.inputText]); return { ...saved, ...entry }; },
    setActiveDraft() {}, setNotice: value => { throw new Error(value); } });
  persist(''); assert.deepEqual(calls, [['preparation', '']]);
});

test('preparation AI handler cannot reach request or fee dependencies', async () => {
  await extract('handleAiResegmentation', { preparationMode: true })();
});
