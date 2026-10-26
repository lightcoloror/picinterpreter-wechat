'use strict';
// Execute actual page callbacks with synthetic local state; no private media,
// model service, browser or developer-tool network is used by this harness.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/features/communication/CommunicationPage.tsx');
const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name, context) {
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
      source = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(source, name);
  const box = { module: { exports: {} }, ...context };
  vm.runInNewContext(ts.transpileModule('module.exports = ' + source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 }
  }).outputText, box);
  return box.module.exports;
}
test('unreadable authoritative draft blocks an empty workspace without falling back or writing', () => {
  let reads = 0;
  const context = { createTaroCommunicationRepository: () => ({
    loadCommunicationIdentity: () => ({}), loadCommunicationHistory: () => [],
    loadExpressionDraft() { reads++; throw new Error('synthetic read permission failure'); }
  }) };
  assert.match(extract('readExpressionStorageError', context)(), /原数据已保留/);
  assert.equal(reads, 1);
  context.createTaroCommunicationRepository = () => ({
    loadCommunicationIdentity: () => ({}), loadCommunicationHistory: () => [], loadExpressionDraft: () => null
  });
  assert.equal(extract('readExpressionStorageError', context)(), '');
});
test('management navigation retains full in-memory workspace and never writes ID-only recovery', async () => {
  const calls = [];
  const navigate = extract('openManagementPage', {
    Taro: { navigateTo: async value => calls.push(value.url) },
    setConversationNotice: () => {},
    taroCommunicationNavigationIntent: { save() { throw new Error('ID-only draft must not be written'); } }
  });
  navigate('phrases');
  assert.deepEqual(calls, ['/packages/management/pages/index/index?view=phrases']);
});
test('continue uses the exact ordered draft and only changes local presentation state', () => {
  const snapshot = { pipeline: { candidateSentences: ['合成林安今晚不回家吃饭。'],
    outputSnapshot: [{ id: 'same', personId: 'a' }, { id: 'same', personId: 'b' }] } };
  const pendingDraft = { id: 'draft-synthetic', snapshot }, actions = [], restored = [];
  const state = { selectedTiles: snapshot.pipeline.outputSnapshot, pipeline: snapshot.pipeline, restored: true };
  const context = {
    pendingDraft, createExpressionSessionFromDraft(value) { assert.equal(value, snapshot); return state; },
    expressionSessionRef: { current: null }, expressionDispatch: action => actions.push(action),
    setRestoredDraft: value => restored.push(value), setPendingDraft: () => {},
    setDraftDeferred: () => {}, setWorkspaceRevision: () => {}
  };
  extract('continueDraft', context)();
  assert.equal(context.expressionSessionRef.current, state);
  assert.equal(actions[0].state, state);
  assert.equal(restored[0], pendingDraft);
});
test('canceling start-new preserves draft; a late modal cannot discard another profile', async () => {
  let confirmation, scope = 'profile-a', discarded = 0;
  const context = {
    expressionScopeRef: { current: 'profile-a' }, careScopedKey: () => scope,
    Taro: { showModal: () => new Promise(resolve => { confirmation = resolve; }) },
    draftServiceRef: { current: { discard: () => { discarded++; } } }
  };
  const discard = extract('discardPendingDraft', context);
  const canceled = discard(); confirmation({ confirm: false }); await canceled;
  assert.equal(discarded, 0);
  const switched = discard(); scope = 'profile-b'; confirmation({ confirm: true }); await switched;
  assert.equal(discarded, 0);
});
test('discard storage failure leaves the pending draft available and reports the problem', async () => {
  const errors = [];
  const context = {
    expressionScopeRef: { current: 'profile-a' }, careScopedKey: () => 'profile-a',
    Taro: { showModal: async () => ({ confirm: true }) },
    draftServiceRef: { current: { discard() { throw new Error('synthetic write failure'); } } },
    setPendingDraft: () => { throw new Error('must preserve pending content'); },
    setDraftReadError: value => errors.push(value)
  };
  await extract('discardPendingDraft', context)();
  assert.equal(errors.length, 1);
});
test('confirm uses shared idempotent service and storage failure cannot pretend success', () => {
  const calls = [], histories = [];
  const repositoryRef = { current: { loadCommunicationHistory: () => histories } };
  const record = { id: 'expression_stable', sentence: '合成人甲不喝水', output: [] };
  const context = {
    repositoryRef, draftServiceRef: { current: {
      getCurrent: () => null, confirm: entry => { calls.push(entry); return record; }
    } }, setHistoryItems: () => {}
  };
  assert.equal(extract('appendHistory', context)({ sentence: record.sentence }), record);
  assert.equal(calls.length, 1);
  context.draftServiceRef.current.confirm = () => { throw new Error('synthetic failure'); };
  assert.equal(extract('appendHistory', context)({ sentence: record.sentence }), null);
});

test('favorite save preserves the precise capacity error for the workspace and only refreshes after success', () => {
  const full = Object.assign(new Error('常用语已达到容量上限（100条），请先整理已有收藏。'), { code: 'SAVED_PHRASE_CAPACITY' });
  const entry = { sentence: '合成林安今晚不回家吃饭。', output: [] }, refreshed = [];
  const repository = { overwriteCommunicationSavedPhrases() { throw full; }, loadCommunicationSavedPhrases: () => [entry] };
  const save = extract('savePhrase', { repositoryRef: { current: repository },
    addCommunicationSavedPhrase: () => ({ changed: true, item: entry, items: [entry] }),
    setSavedPhraseItems: value => refreshed.push(value) });
  assert.throws(() => save(entry), error => error === full);
  assert.equal(refreshed.length, 0);
  repository.overwriteCommunicationSavedPhrases = () => entry;
  assert.equal(save(entry), true);
  assert.deepEqual(refreshed, [[entry]]);
});

function confirmedReuseFixture() {
  const output = [
    { id: 'same', label: '合成林安', personId: 'synthetic-a' },
    { id: 'same', label: '合成林安', personId: 'synthetic-b' },
    { id: 'same', label: '合成林安', personId: 'synthetic-a' }
  ];
  const entry = { id: 'synthetic-phrase', sentence: '合成林安今晚七点半不回家吃饭。', output };
  const next = { selectedTiles: output, pipeline: {
    outputSnapshot: output, candidateSentences: [entry.sentence, '我的意思是：' + entry.sentence, '我想表达的是：' + entry.sentence],
    selectedIndex: 0
  }, restored: false };
  const oldSession = JSON.parse(JSON.stringify(next));
  const history = [{ id: 'synthetic-old-history', sentence: entry.sentence, output }];
  const beforeHistory = JSON.stringify(history), events = [], notices = [], saves = [];
  let record = { id: 'old-draft', status: 'confirmed', confirmedRecordId: history[0].id }, failSave = false, failUsage = false;
  const context = {
    pendingDraft: null, draftReadError: '', personalizedBoards: [],
    createExpressionSessionFromSavedPhrase: () => next,
    loadedPhraseRef: { current: JSON.stringify([entry.id, entry.sentence, entry.output]) },
    expressionSessionRef: { current: oldSession },
    expressionDispatch: action => events.push(['replace', action.state]),
    setRestoredDraft: value => events.push(['restored', value]),
    setWorkspaceRevision: update => events.push(['remount', update(0)]),
    setConversationNotice: text => notices.push(text),
    markPhraseUsed() { if (failUsage) throw new Error('synthetic usage write failure'); events.push(['used']); },
    draftServiceRef: { current: {
      getCurrent: () => record,
      save(snapshot, options) {
        saves.push({ snapshot, options });
        if (failSave) throw new Error('synthetic durable write failure');
        record = { id: 'new-draft', status: 'draft', snapshot };
        events.push(['saved', record.id]);
        return record;
      }
    } }
  };
  return { entry, next, oldSession, history, beforeHistory, events, notices, saves, context,
    record: () => record, failSave: value => { failSave = value; }, failUsage: value => { failUsage = value; } };
}

test('management reuse after confirmation persists a new exact expression before remounting, and repeat reuse is idempotent', () => {
  const f = confirmedReuseFixture(), reuse = extract('reusePhrase', f.context);
  assert.equal(reuse(f.entry), true);
  assert.equal(f.saves.length, 1);
  assert.equal(f.saves[0].options.startNew, true);
  assert.equal(f.saves[0].snapshot.pendingAi, null, 'a new expression must not inherit the ended expression request');
  assert.equal(f.saves[0].snapshot.pipeline, f.next.pipeline);
  assert.equal(f.saves[0].snapshot.rejected, false);
  assert.equal(f.context.expressionSessionRef.current, f.next);
  assert.deepEqual(f.events.map(event => event[0]), ['saved', 'used', 'replace', 'restored', 'remount']);
  assert.equal(f.events.find(event => event[0] === 'restored')[1], null);
  assert.equal(JSON.stringify(f.history), f.beforeHistory);
  assert.equal(reuse(f.entry), true);
  assert.equal(f.saves.length, 1);
  assert.equal(f.events.filter(event => event[0] === 'used').length, 1);
  assert.equal(f.events.filter(event => event[0] === 'remount').length, 1);
});

test('management reuse write failure preserves current confirmation and usage, then explicit retry creates one new draft', () => {
  const f = confirmedReuseFixture(), reuse = extract('reusePhrase', f.context);
  const oldKey = f.context.loadedPhraseRef.current;
  f.failSave(true);
  assert.equal(reuse(f.entry), false);
  assert.equal(f.context.expressionSessionRef.current, f.oldSession);
  assert.equal(f.context.loadedPhraseRef.current, oldKey);
  assert.equal(f.record().status, 'confirmed');
  assert.deepEqual(f.events, []);
  assert.equal(JSON.stringify(f.history), f.beforeHistory);
  assert.equal(f.notices.length, 1);
  f.failSave(false);
  assert.equal(reuse(f.entry), true);
  assert.equal(f.record().id, 'new-draft');
  assert.equal(f.events.filter(event => event[0] === 'used').length, 1);
});

test('a deferred expression blocks management reuse before a new confirmed expression is saved', () => {
  const f = confirmedReuseFixture();
  f.context.pendingDraft = { id: 'synthetic-pending' };
  assert.equal(extract('reusePhrase', f.context)(f.entry), false);
  assert.equal(f.saves.length, 0);
  assert.deepEqual(f.events, []);
  assert.equal(f.context.expressionSessionRef.current, f.oldSession);
});

test('usage metadata failure does not strand a successfully saved new expression in the old confirmed workspace', () => {
  const f = confirmedReuseFixture();
  f.failUsage(true);
  assert.equal(extract('reusePhrase', f.context)(f.entry), true);
  assert.equal(f.record().status, 'draft');
  assert.equal(f.context.expressionSessionRef.current, f.next);
  assert.equal(f.events.filter(event => event[0] === 'remount').length, 1);
  assert.match(f.notices.at(-1), /使用次数/);
  assert.equal(JSON.stringify(f.history), f.beforeHistory);
});
