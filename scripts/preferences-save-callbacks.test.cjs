'use strict';
// Reuses the existing receiver-display AST harness; invokes product handlers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/features/communication/CommunicationSettingsPanel.tsx');
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
test('settings retain failed changes, expose retry, and acknowledge only a verified callback', async () => {
  const desired = { fontSize: 'extra-large', highContrast: true }, notices = [], failures = [], pending = [], calls = [];
  let fail = true, scrolls = 0;
  const save = extract('save', {
    onChange(value) { calls.push(value); if (fail) throw new Error('write/readback failed'); },
    setPendingValue: value => pending.push(value), setSaveNotice: value => notices.push(value),
    setSaveFailed: value => failures.push(value),
    Taro: { pageScrollTo: () => { scrolls++; return Promise.resolve(); } }
  });
  save(desired);
  assert.equal(failures.at(-1), true);
  assert.match(notices.at(-1), /尚未核对保存/);
  assert.equal(pending.at(-1), desired);
  assert.equal(scrolls, 1);
  fail = false;
  save(pending.at(-1));
  assert.deepEqual(calls, [desired, desired]);
  assert.equal(pending.at(-1), null);
  assert.match(notices.at(-1), /已保存到本机/);
  assert.match(notices.at(-1), /不表示已同步/);
});
