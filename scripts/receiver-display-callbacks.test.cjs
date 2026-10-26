'use strict';
// Reuse expression-ai-callbacks' AST harness; execute product callbacks rather than copies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/features/communication/ReceiverDisplayPage.tsx');
const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name, context) {
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) source = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(source, name);
  const box = { module: { exports: {} }, ...context };
  vm.runInNewContext(ts.transpileModule('module.exports = ' + source,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
  return box.module.exports;
}
function fixture() {
  const pending = [], busy = [], notices = [], closeCalls = [];
  const context = {
    items: [{ id: 'synthetic-person', label: '合成人甲', image: 'wxfile://synthetic-person.png' }],
    speechText: '合成人甲不喝水', isSharing: false,
    sharePendingRef: { current: false }, shareGenerationRef: { current: 0 }, disposedRef: { current: false },
    speechGenerationRef: { current: 0 }, wechatSpeechPort: { stop() {} },
    setIsSharing: value => busy.push(value), setShareNotice: value => notices.push(value),
    taroCommunicationSharePort: { shareReceiverImage: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) },
    onClose: value => closeCalls.push(value)
  };
  return { context, pending, busy, notices, closeCalls,
    share: extract('handleShare', context), close: extract('handleClose', context) };
}
const completed = { ok: true, message: '合成分享完成' };

test('segment switching stops old speech, invalidates sharing and never auto-plays', async () => {
  const f = fixture(), task = f.share(), selections = [];
  let stops = 0;
  const change = extract('changeReading', { ...f.context,
    stopPlayback: () => { stops++; }, setSegmentIndex: value => selections.push(value) });
  change(1);
  assert.equal(stops, 1);
  assert.equal(f.pending[0].args[1].isCurrent(), false);
  assert.deepEqual(selections, [1]);
  const notices = f.notices.length;
  f.pending[0].resolve(completed); await task;
  assert.equal(f.notices.length, notices);
});

test('manual replay uses the current segment and cancelled speech cannot overwrite status', async () => {
  const f = fixture(), calls = [], statuses = [];
  let finish;
  const context = { ...f.context, segment: { text: '明早七点半回家' }, speechRate: 1,
    wechatSpeechPort: { stop() {}, speak: text => { calls.push(text); return new Promise(resolve => { finish = resolve; }); } },
    setIsSpeaking: value => statuses.push(value), setSpeechNotice: value => statuses.push(value) };
  const speak = extract('speak', context), pending = speak();
  assert.deepEqual(calls, ['明早七点半回家']);
  extract('stopPlayback', context)();
  const count = statuses.length;
  finish({ message: '旧播放完成' }); await pending;
  assert.equal(statuses.length, count);
  context.disposedRef.current = true;
  await extract('speak', context)();
  assert.equal(calls.length, 1);
});
test('rapid repeated clicks before React rerender create one share attempt', async () => {
  const f = fixture(), one = f.share(), two = f.share();
  const count = f.pending.length;
  f.pending.forEach(item => item.resolve(completed)); await Promise.all([one, two]);
  assert.equal(count, 1);
});
test('return invalidates pending export before the page unmounts, with no late state update', async () => {
  const f = fixture(), task = f.share();
  f.close();
  assert.equal(f.pending[0].args[1].isCurrent(), false);
  const states = f.busy.length, notices = f.notices.length;
  f.pending[0].resolve(completed); await task;
  assert.equal(f.busy.length, states); assert.equal(f.notices.length, notices);
  await f.share(); assert.equal(f.pending.length, 1);
});
test('unexpected adapter rejection releases waiting state and allows explicit retry', async () => {
  const f = fixture(), first = f.share();
  f.pending[0].reject(new Error('synthetic offline')); await first;
  assert.equal(f.busy.at(-1), false); assert.equal(f.context.sharePendingRef.current, false);
  const retry = f.share(); assert.equal(f.pending.length, 2);
  f.pending[1].resolve(completed); await retry;
  assert.equal(f.notices.at(-1), completed.message);
});
test('unmount invalidates share callbacks as well as speech callbacks', async () => {
  const f = fixture(), task = f.share();
  let source;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
        node.arguments[0].getText(ast).includes('void speak()')) source = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(source);
  const box = { module: { exports: {} }, ...f.context, autoPlay: true, startSegmented: false, speak: async () => {} };
  vm.runInNewContext(ts.transpileModule('module.exports = ' + source,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
  const cleanup = box.module.exports(); cleanup();
  assert.equal(f.pending[0].args[1].isCurrent(), false);
  const notices = f.notices.length;
  f.pending[0].resolve(completed); await task;
  assert.equal(f.notices.length, notices);
});
