'use strict';
// Reuse the actual-callback harness used by missing-token-callbacks.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/features/communication/ExpressionWorkspace.tsx');
const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('actual mini playback callback passes its generation guard through to each shared frame', async () => {
  const calls = [], notices = [];
  let finish;
  const context = {
    playbackOutputRef: { current: [{ label: '合成图卡' }] },
    speechGenerationRef: { current: 0 }, isSpeakingRef: { current: false },
    speechRateRef: { current: 1 }, setIsSpeaking: () => {}, setNotice: text => notices.push(text),
    wechatSpeechPort: {}, wechatTileAudioPort: {}, stopExpressionPlayback: () => {},
    playExpressionSentence: options => {
      calls.push(options);
      return new Promise(resolve => { finish = resolve; });
    }
  };
  const play = extract('playCandidateQueue', context);
  const stop = extract('stopSpeechPlayback', context);
  const task = play(['第一句', '第二句']);
  assert.equal(calls[0].isCurrent(), true);
  stop(false);
  assert.equal(calls[0].isCurrent(), false);
  finish({ ok: true });
  await task;
  assert.equal(calls.length, 1);
  assert.equal(notices.includes('候选句已全部播报。'), false);
});
const sharedFeedback = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../../cboard/src/common/communicationSupport/candidateFeedback.js'), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }
).outputText, { module: sharedFeedback, exports: sharedFeedback.exports });
function extract(name, context) {
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) source = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source, name);
  const code = ts.transpileModule('module.exports = ' + source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const box = { module: { exports: {} }, ...context };
  vm.runInNewContext(code, box);
  return box.module.exports;
}

test('favorite capacity failure shows the exact reason and preserves the selected content for retry', () => {
  const savedPhrase = { sentence: '合成林安今晚不回家吃饭。', output: [{ id: 'same', personId: 'synthetic-a' }, { id: 'same', personId: 'synthetic-b' }] };
  const before = JSON.stringify(savedPhrase), notices = [], writes = [];
  let fail = true;
  const save = extract('handleSavePhrase', {
    candidatesRejectedRef: { current: false }, invalidatePendingShare() {}, invalidatePendingAi() {},
    session: { pipeline: {} }, buildExpressionSavedPhraseEntry: () => savedPhrase,
    onSavePhrase(value) { writes.push(value); if (fail) throw Object.assign(new Error('常用语已达到容量上限（100条），请先整理已有收藏。'), { code: 'SAVED_PHRASE_CAPACITY' }); return true; },
    setNotice: value => notices.push(value)
  });
  assert.doesNotThrow(() => save());
  assert.match(notices.at(-1), /容量上限/);
  assert.doesNotMatch(notices.at(-1), /已收藏/);
  assert.equal(JSON.stringify(savedPhrase), before);
  fail = false; save();
  assert.match(notices.at(-1), /已收藏/);
  assert.equal(writes.length, 2);
  assert.equal(writes[0], writes[1]);
});
function effectContaining(context, marker) {
  let source;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
        node.arguments[0].getText(ast).includes(marker))
      source = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source);
  const box = { module: { exports: {} }, ...context };
  vm.runInNewContext(ts.transpileModule('module.exports = ' + source,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
  return box.module.exports;
}
const rejectionEffect = context => effectContaining(context, 'rejectionSelectionRef.current');
function fixture() {
  const pending = [], actions = [], busy = [], notices = [], scheduled = [], drafts = [], played = [];
  const copyPending = [], copyBusy = [];
  let completed = 0;
  const context = {
    session: { pipeline: { outputSignature: 'water', outputSnapshot: [{ label: '水' }], candidateSentences: ['水', '我的意思是：水', '我想表达的是：水'] } },
    conversationContext: {}, selectionSignature: 'water', selectionSignatureRef: { current: 'water' },
    getTaroTextAiAvailability: () => ({ available: true, contextKey: 'synthetic-scope' }),
    aiGenerationRef: { current: 0 }, aiPendingRef: { current: false },
    restorationMutedRef: { current: false }, clearPendingAiRef: { current: false },
    persistDraft: () => true, draftService: null, setPendingAiRecovery: () => {},
    pageActiveRef: { current: true }, shareGenerationRef: { current: 0 }, sharePendingRef: { current: false },
    shareSignature: 'synthetic-context|water', shareSignatureRef: { current: 'synthetic-context|water' },
    previousShareSignatureRef: { current: 'synthetic-context|water' }, selectedSentence: '合成人甲不喝水',
    setIsSharing: value => copyBusy.push(value),
    taroCommunicationSharePort: { shareExpressionText: (sentence, options) =>
      new Promise((resolve, reject) => copyPending.push({ sentence, options, resolve, reject })) },
    candidatesRejectedRef: { current: false }, candidateFeedbackDraftIdRef: { current: null }, confirmedHistoryIdRef: { current: null },
    isExpressionConfirmed: false, candidateFeedbackEntries: [{ sentence: '水', feedback: null }],
    setCandidatesRejected: () => {}, setIsExpressionConfirmed: () => {}, setCandidateFeedbackNotice: message => notices.push(message),
    setCandidateFeedbackEntries: () => {}, normalizeExpressionCandidates: sharedFeedback.exports.normalizeExpressionCandidates,
    onSaveCandidateFeedbackDraft: entry => { drafts.push(entry); return { ...entry, id: 'reject-1' }; },
    onDiscardCandidateFeedbackDraft: () => true,
    setIsGeneratingAi: value => busy.push(value), setNotice: value => notices.push(value),
    setAiCompletion: () => completed++,
    buildCommunicationAiSentenceRequest: ({ output, candidateCount }) => ({ pictogramLabels: output.map(t => t.label), candidateCount, context: {} }),
    taroCommunicationAiPort: { generateSentences: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    dispatch: action => actions.push(action), playCandidateQueue: async queue => played.push(queue), stopSpeechPlayback: () => {},
    isSpeakingRef: { current: false },
    candidateAutoplayControllerRef: { current: { cancel() {}, schedule: (...args) => scheduled.push(args) } }
  };
  context.invalidatePendingShare = extract('invalidatePendingShare', context);
  context.invalidatePendingAi = extract('invalidatePendingAi', context);
  context.handlePatientInteraction = extract('handlePatientInteraction', context);
  context.handleStopSpeech = extract('handleStopSpeech', context);
  return { context, actions, busy, pending, notices, scheduled, drafts, played, copyPending, copyBusy, completed: () => completed,
    share: extract('handleShareExpression', context), hide: extract('handleWorkspaceHide', context),
    generate: extract('handleGenerateAiCandidates', context), select: extract('handleSelectCandidate', context),
    stop: context.handleStopSpeech, edit: extract('handleEditSelectedTile', context), invalidate: context.invalidatePendingAi,
    reject: extract('handleRejectCandidates', context), undoRejection: extract('handleUndoRejection', context) };
}
const success = { ok: true, value: { candidates: ['AI一', 'AI二', 'AI三'] }, message: '完成' };
test('unknown AI result keeps reconciliation notice and does not restart candidate autoplay', async () => {
  const f = fixture(), task = f.generate();
  f.pending[0].resolve({ ok: false, code: 'AI_REQUEST_RESULT_UNKNOWN', message: '结果未知，请核对同一请求' });
  await task;
  assert.equal(f.completed(), 0);
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.actions.length, 0);
  assert.equal(f.context.aiPendingRef.current, false);
  assert.match(f.notices.at(-1), /同一请求/);
  const retry = f.generate(); f.pending[1].resolve(success); await retry;
  assert.equal(f.completed(), 1);
});

// Exercise the actual mini controller wiring and JSX notice, not a copied label.
function autoplayViewFixture(delaySeconds = 5) {
  const f = fixture(), context = f.context, timers = [], cleared = [];
  function loadCore(name) {
    const mod = { exports: {} };
    const source = fs.readFileSync(path.resolve(__dirname,
      `../../cboard/src/common/communicationSupport/${name}.js`), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS
    } }).outputText, { module: mod, exports: mod.exports,
      require: dependency => loadCore(dependency.replace('./', '')) });
    return mod.exports;
  }
  let controllerSource, noticeSource;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'createCandidateAutoplayController')
      controllerSource = node.getText(ast);
    if (ts.isJsxExpression(node) && node.expression &&
        node.expression.getText(ast).includes('秒无操作后自动播报全部候选句'))
      noticeSource = node.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(controllerSource); assert.ok(noticeSource);
  Object.assign(context, {
    pendingAutoplayDelayMs: 0, candidateAutoplayDelaySeconds: delaySeconds,
    candidatesRejected: false, isSpeaking: false,
    setPendingAutoplayDelayMs: value => { context.pendingAutoplayDelayMs = value; },
    setCandidatesRejected: value => { context.candidatesRejected = value; },
    setTimeout: callback => { const timer = { callback }; timers.push(timer); return timer; },
    clearTimeout: timer => cleared.push(timer),
    createCandidateAutoplayController: loadCore('candidateAutoplay').createCandidateAutoplayController
  });
  const box = { module: { exports: {} }, ...context };
  vm.runInNewContext(ts.transpileModule('module.exports = ' + controllerSource,
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
  const controller = box.module.exports;
  context.candidateAutoplayControllerRef.current = controller;
  return { ...f, controller, timers, cleared,
    notice: () => vm.runInNewContext(noticeSource, context),
    reject: () => extract('handleRejectCandidates', context)(),
    undoRejection: () => extract('handleUndoRejection', context)() };
}

test('mini notice follows actual scheduling, touch cancellation, firing and disabled autoplay', async () => {
  const f = autoplayViewFixture();
  assert.ok(!f.notice().includes('秒无操作后'));
  f.controller.schedule(['水。'], 5);
  assert.ok(f.notice().includes('5 秒无操作后'));
  f.context.handlePatientInteraction();
  assert.ok(f.notice().includes('当前不会自动播报'));
  await f.timers[0].callback();
  assert.equal(f.played.length, 0);
  f.controller.schedule(['水。'], 10);
  assert.ok(f.notice().includes('10 秒无操作后'));
  await f.timers[1].callback();
  assert.equal(f.played.length, 1);
  assert.ok(!f.notice().includes('秒无操作后'));
  f.context.isSpeaking = true;
  assert.equal(f.notice(), '正在播报。');
  const disabled = autoplayViewFixture(0);
  assert.equal(disabled.controller.schedule(['水。'], 0), false);
  assert.ok(disabled.notice().includes('自动播报已关闭'));
});

test('mini rejection and undo preserve manual playback notice even when the canceled callback arrives', async () => {
  const f = autoplayViewFixture();
  f.controller.schedule(['水。'], 5);
  f.reject();
  assert.equal(f.notice(), '已暂停自动播报。');
  f.undoRejection();
  assert.ok(f.notice().includes('当前不会自动播报'));
  await f.timers[0].callback();
  assert.equal(f.played.length, 0);
  assert.equal(f.pending.length, 0);
  assert.ok(!f.notice().includes('秒无操作后'));
});

test('mini pending AI cancels the visible timer and only the completed candidate effect rearms it', async () => {
  const f = autoplayViewFixture();
  f.controller.schedule(['水。'], 5);
  const task = f.generate();
  assert.ok(!f.notice().includes('秒无操作后'));
  f.pending[0].resolve(success); await task;
  assert.equal(f.completed(), 1);
  Object.assign(f.context, {
    rejectionSelectionRef: { current: 'water' }, previousAiSelectionRef: { current: 'water' },
    feedbackInputRef: { current: null }
  });
  rejectionEffect(f.context)();
  assert.ok(f.notice().includes('5 秒无操作后'));
});
test('manual sentence selection wins over a late AI result', async () => {
  const f = fixture(), task = f.generate();
  await f.select('人工选择', 1);
  f.pending[0].resolve(success); await task;
  assert.deepEqual(f.actions.map(a => a.type), ['select-candidate']);
  assert.equal(f.busy.at(-1), false);
});
test('changing pictures rejects the stale response and releases its busy state', async () => {
  const f = fixture(), task = f.generate();
  f.context.selectionSignatureRef.current = 'water-help';
  f.pending[0].resolve(success); await task;
  assert.equal(f.actions.length, 0);
  assert.equal(f.busy.at(-1), false);
});
test('double click makes one provider attempt until completion', async () => {
  const f = fixture(), first = f.generate(), second = f.generate();
  assert.equal(f.pending.length, 1);
  f.pending[0].resolve(success); await Promise.all([first, second]);
  assert.equal(f.actions.length, 1);
  assert.equal(f.busy.at(-1), false);
});
test('an old response cannot release or overwrite a newer request', async () => {
  const f = fixture(), first = f.generate();
  f.invalidate();
  const second = f.generate();
  f.pending[0].resolve(success); await first;
  assert.equal(f.busy.at(-1), true);
  assert.equal(f.actions.length, 0);
  f.pending[1].resolve(success); await second;
  assert.equal(f.actions.length, 1);
  assert.equal(f.busy.at(-1), false);
});
test('stop prevents a late result and autoplay rescheduling', async () => {
  const f = fixture(), task = f.generate();
  f.stop(); f.pending[0].resolve(success); await task;
  assert.equal(f.actions.length, 0);
  assert.equal(f.completed(), 0);
  assert.equal(f.busy.at(-1), false);
});

test('reject all keeps pictures, ignores late AI, blocks explicit retry and undo does not call AI or speak', async () => {
  const f = fixture(), task = f.generate();
  f.reject();
  assert.equal(f.context.candidatesRejectedRef.current, true);
  assert.equal(f.drafts[0].rejected, true);
  assert.equal(f.context.session.pipeline.outputSnapshot[0].label, '水');
  f.pending[0].resolve(success); await task;
  await f.generate(); await f.select('水', 0);
  assert.equal(f.pending.length, 1);
  assert.equal(f.actions.length, 0);
  assert.equal(f.played.length, 0);
  assert.equal(f.completed(), 0);
  f.undoRejection();
  assert.equal(f.context.candidatesRejectedRef.current, false);
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.played.length, 0);
  assert.equal(f.pending.length, 1);
  await f.select('水', 0);
  assert.equal(f.played.length, 1);
});

test('failed rejection persistence still blocks output, and failed undo keeps persisted rejection', () => {
  const f = fixture();
  const reject = extract('handleRejectCandidates', { ...f.context, onSaveCandidateFeedbackDraft: () => null });
  reject();
  assert.equal(f.context.candidatesRejectedRef.current, true);
  assert.ok(f.notices.some(message => message.includes('拒绝状态未能保存')));
  f.context.candidateFeedbackDraftIdRef.current = 'persisted-rejection';
  extract('handleUndoRejection', { ...f.context, onDiscardCandidateFeedbackDraft: () => false })();
  assert.equal(f.context.candidatesRejectedRef.current, true);
  assert.ok(f.notices.some(message => message.includes('撤销未能保存')));
});

test('rejection guards confirmation, saving and sharing even if an obsolete handler fires', async () => {
  const f = fixture(); f.reject();
  // Missing service ports deliberately throw if these guarded paths proceed.
  for (const name of ['handleConfirm', 'handleSavePhrase', 'handleShareExpression', 'handleSpeech', 'handlePlayAllCandidates'])
    await extract(name, f.context)();
  assert.equal(f.played.length, 0);
  assert.equal(f.actions.length, 0);
});

test('restored rejection blocks scheduling; changing person resets it and returning restores it', () => {
  const f = fixture();
  const context = {
    ...f.context, rejectionSelectionRef: { current: 'water' },
    previousAiSelectionRef: { current: 'water' }, feedbackInputRef: { current: null },
    candidateAutoplayDelaySeconds: 5
  };
  context.candidatesRejectedRef.current = true;
  rejectionEffect(context)();
  assert.equal(f.scheduled.length, 0);
  context.session.pipeline.outputSignature = 'synthetic-person-b|pain';
  context.selectionSignature = 'person-b';
  rejectionEffect(context)();
  assert.equal(context.candidatesRejectedRef.current, false);
  assert.equal(f.scheduled.length, 1);
  context.session.pipeline.outputSignature = 'water';
  context.feedbackInputRef.current = { id: 'rejected-water', rejected: true };
  context.selectionSignature = 'water';
  rejectionEffect(context)();
  assert.equal(context.candidatesRejectedRef.current, true);
  assert.equal(context.candidateFeedbackDraftIdRef.current, 'rejected-water');
  assert.equal(f.scheduled.length, 1);
});
test('transport exception releases busy state and permits explicit retry', async () => {
  const f = fixture(), first = f.generate();
  f.pending[0].reject(new Error('synthetic offline')); await first;
  assert.equal(f.busy.at(-1), false);
  const second = f.generate(); f.pending[1].resolve(success); await second;
  assert.equal(f.actions.length, 1);
});
test('page disposal never updates state when the response finally arrives', async () => {
  const f = fixture(), task = f.generate();
  f.context.aiGenerationRef.current += 1;
  f.context.aiPendingRef.current = false;
  const before = f.busy.length;
  f.pending[0].resolve(success); await task;
  assert.equal(f.actions.length, 0);
  assert.equal(f.busy.length, before);
});

test('delete then undo rejects a late AI result even when the picture signature is identical', async () => {
  const f = fixture(), task = f.generate();
  f.edit({ type: 'clear' }, 'clear');
  f.edit({ type: 'undo-delete' }, 'undo');
  f.pending[0].resolve(success); await task;
  assert.deepEqual(f.actions.map(a => a.type), ['clear', 'undo-delete']);
  assert.equal(f.pending.length, 1, 'undo must not call the provider');
  assert.equal(f.completed(), 0);
  assert.equal(f.busy.at(-1), false);
});

test('all output edit buttons use the guarded callback and CBoard SVG assets', () => {
  const source = fs.readFileSync(filename, 'utf8');
  for (const [id, action] of [['backspace', 'remove-last'], ['clear', 'clear'], ['undo-delete', 'undo-delete']]) {
    const block = source.match(new RegExp(`<PatientActionButton\\s[^>]*id='expression-${id}-button'[\\s\\S]*?\\n          />`));
    assert.ok(block, id);
    assert.ok(block[0].includes(`handleEditSelectedTile({ type: '${action}' }`), id);
  }
  for (const name of ['Backspace', 'Undo', 'Clear']) {
    const upstream = fs.readFileSync(path.resolve(__dirname, `../../cboard/node_modules/@material-ui/icons/${name}.js`), 'utf8');
    const svg = fs.readFileSync(path.resolve(__dirname, `../src/assets/cboard/output-${name.toLowerCase()}.svg`), 'utf8');
    assert.ok(svg.includes(upstream.match(/d: "([^"]+)"/)[1]), `${name}: exact upstream path`);
  }
});

test('copy double click makes one call, retaining the exact sentence and busy state', async () => {
  const f = fixture(), first = f.share(), second = f.share();
  assert.equal(f.copyPending.length, 1);
  assert.equal(f.copyPending[0].sentence, '合成人甲不喝水');
  assert.equal(f.copyPending[0].options.isCurrent(), true);
  assert.equal(f.copyBusy.at(-1), true);
  f.copyPending[0].resolve({ ok: true, message: 'copied' });
  await Promise.all([first, second]);
  assert.equal(f.notices.at(-1), 'copied');
  assert.equal(f.copyBusy.at(-1), false);
  assert.equal(f.actions.length, 0);
});

test('copy freezes pending AI and autoplay even without a touch event', async () => {
  const f = autoplayViewFixture();
  f.controller.schedule(['水'], 5);
  const ai = f.generate(), share = f.share();
  await f.timers[0].callback();
  f.pending[0].resolve(success); await ai;
  assert.equal(f.actions.length, 0);
  assert.equal(f.played.length, 0);
  assert.equal(f.completed(), 0);
  f.copyPending[0].resolve({ ok: true, message: 'copied' }); await share;
  assert.equal(f.notices.at(-1), 'copied');
});

for (const outcome of ['resolve', 'reject']) {
  test(`late copy ${outcome} cannot overwrite clear and undo, even with the same signature`, async () => {
    const f = fixture(), task = f.share();
    f.edit({ type: 'clear' }, 'clear');
    f.edit({ type: 'undo-delete' }, 'undo');
    const notices = f.notices.length, busy = f.copyBusy.length;
    assert.equal(f.copyPending[0].options.isCurrent(), false);
    if (outcome === 'resolve') f.copyPending[0].resolve({ ok: true, message: 'old copied' });
    else f.copyPending[0].reject(new Error('synthetic late failure'));
    await task;
    assert.equal(f.notices.at(-1), 'undo');
    assert.equal(f.notices.length, notices);
    assert.equal(f.copyBusy.length, busy);
    assert.deepEqual(f.actions.map(action => action.type), ['clear', 'undo-delete']);
  });
}

test('reject and undo do not resurrect an earlier pending copy', async () => {
  const f = fixture(), task = f.share();
  f.reject(); f.undoRejection();
  const before = [...f.notices];
  f.copyPending[0].resolve({ ok: true, message: 'stale copy' }); await task;
  assert.deepEqual(f.notices, before);
  assert.equal(f.copyPending[0].options.isCurrent(), false);
  assert.equal(f.copyPending.length, 1);
});

test('selecting a different candidate invalidates copying before the next render', async () => {
  const f = fixture(), task = f.share();
  await f.select('合成人甲想喝水', 1);
  const count = f.notices.length;
  assert.equal(f.copyPending[0].options.isCurrent(), false);
  f.copyPending[0].resolve({ ok: true, message: 'stale' }); await task;
  assert.equal(f.notices.length, count);
  assert.equal(f.played.length, 1);
});

test('an external identity change blocks the old copy immediately, then resets only its pending view', async () => {
  const f = fixture(), task = f.share();
  const nextSignature = 'different-person-same-display-name';
  f.context.shareSignatureRef.current = nextSignature;
  assert.equal(f.copyPending[0].options.isCurrent(), false);
  effectContaining({ ...f.context, shareSignature: nextSignature }, 'previousShareSignatureRef.current')();
  assert.equal(f.copyBusy.at(-1), false);
  const count = f.notices.length;
  f.copyPending[0].resolve({ ok: true, message: 'stale' }); await task;
  assert.equal(f.notices.length, count);
});

test('an unchanged rerender preserves the copy request', async () => {
  const f = fixture(), task = f.share();
  effectContaining(f.context, 'previousShareSignatureRef.current')();
  assert.equal(f.copyPending[0].options.isCurrent(), true);
  f.copyPending[0].resolve({ ok: true, message: 'copied' }); await task;
  assert.equal(f.notices.at(-1), 'copied');
});

test('hide and return ignore the old result and do not clear a newer copy busy state', async () => {
  const f = fixture(), first = f.share();
  f.hide();
  assert.equal(f.context.pageActiveRef.current, false);
  await f.share();
  assert.equal(f.copyPending.length, 1, 'a hidden page cannot copy');
  // The native port separately serializes writes; this isolates UI request ownership.
  f.context.pageActiveRef.current = true;
  const second = f.share(), count = f.notices.length;
  f.copyPending[0].resolve({ ok: true, message: 'old' }); await first;
  assert.equal(f.notices.length, count);
  assert.equal(f.copyBusy.at(-1), true);
  f.copyPending[1].resolve({ ok: true, message: 'new' }); await second;
  assert.equal(f.notices.at(-1), 'new');
  assert.equal(f.copyBusy.at(-1), false);
});

test('unmount cleanup rejects a late copy without state updates', async () => {
  const f = fixture();
  const cleanup = effectContaining({ ...f.context,
    speechGenerationRef: { current: 0 }, wechatSpeechPort: {}, wechatTileAudioPort: {},
    stopExpressionPlayback: () => {}
  }, 'pageActiveRef.current = true')();
  const task = f.share();
  cleanup();
  const notices = f.notices.length, busy = f.copyBusy.length;
  f.copyPending[0].resolve({ ok: true, message: 'late' }); await task;
  assert.equal(f.notices.length, notices);
  assert.equal(f.copyBusy.length, busy);
  assert.equal(f.copyPending[0].options.isCurrent(), false);
});

test('copy transport failure releases the UI and manual retry succeeds without generating or saving', async () => {
  const f = fixture(), first = f.share();
  f.copyPending[0].reject(new Error('synthetic clipboard failure')); await first;
  assert.equal(f.copyBusy.at(-1), false);
  assert.ok(f.notices.at(-1).includes('仍会保留'));
  const retry = f.share();
  f.copyPending[1].resolve({ ok: true, message: 'copied' }); await retry;
  assert.equal(f.notices.at(-1), 'copied');
  assert.equal(f.pending.length, 0);
  assert.equal(f.actions.length, 0);
  assert.equal(f.drafts.length, 0);
});

test('an obsolete captured handler cannot start copying after a context change', async () => {
  const f = fixture();
  f.context.shareSignatureRef.current = 'different-session';
  await f.share();
  assert.equal(f.copyPending.length, 0);
  assert.equal(f.notices.length, 0);
});

test('share UI keeps the CBoard action and wires page-hide cancellation', () => {
  const source = fs.readFileSync(filename, 'utf8');
  const button = source.match(/<PatientActionButton\s[^>]*id='expression-share-button'[\s\S]*?\n          \/>/)[0];
  assert.ok(button.includes('PATIENT_ACTION_IDS.share'));
  assert.ok(button.includes('disabled={candidatesRejected || !selectedSentence || isSharing}'));
  assert.ok(button.includes("label={isSharing ? '复制中' : '分享'}"));
  assert.ok(source.includes('useDidHide(handleWorkspaceHide)'));
  assert.match(source, /useDidShow\(\(\) => \{\s*pageActiveRef.current = true/);
  const contextSignature = extract('shareSignature', {
    conversationContext: { sessionId: 'session' }, selectionSignature: 'person-one',
    session: { pipeline: { outputSignature: 'same-text' } }, candidateSignature: 'candidate', selectedSentence: '合成人甲'
  });
  assert.deepEqual(JSON.parse(contextSignature), ['session', 'person-one', 'same-text', 'candidate', '合成人甲']);
});

test('hiding cancels AI waiting without retaining a misleading pending notice or rearming autoplay', async () => {
  const f = autoplayViewFixture(), task = f.generate();
  f.hide();
  assert.equal(f.busy.at(-1), false);
  assert.ok(f.notices.at(-1).includes('旧 AI 结果不再更新'));
  const count = f.notices.length;
  f.pending[0].resolve(success); await task;
  assert.equal(f.notices.length, count);
  assert.equal(f.actions.length, 0);
  Object.assign(f.context, {
    rejectionSelectionRef: { current: 'water' }, previousAiSelectionRef: { current: 'water' },
    feedbackInputRef: { current: null }
  });
  rejectionEffect(f.context)();
  assert.equal(f.timers.length, 0);
});

test('sharing interrupts active playback so a late speech completion cannot replace the copy notice', async () => {
  const f = fixture();
  let finishSpeech;
  Object.assign(f.context, {
    playbackOutputRef: { current: [{ label: '合成图卡' }] }, speechGenerationRef: { current: 0 },
    speechRateRef: { current: 1 }, setIsSpeaking: () => {}, wechatSpeechPort: {}, wechatTileAudioPort: {},
    stopExpressionPlayback: () => {},
    playExpressionSentence: () => new Promise(resolve => { finishSpeech = resolve; })
  });
  f.context.stopSpeechPlayback = extract('stopSpeechPlayback', f.context);
  f.context.handlePatientInteraction = extract('handlePatientInteraction', f.context);
  const speaking = extract('playCandidateQueue', f.context)(['合成句子']);
  const copying = extract('handleShareExpression', f.context)();
  finishSpeech({ ok: true }); await speaking;
  assert.equal(f.notices.at(-1), '正在复制当前句子…');
  f.copyPending[0].resolve({ ok: true, message: 'copied' }); await copying;
  assert.equal(f.notices.at(-1), 'copied');
  assert.equal(f.context.isSpeakingRef.current, false);
});

test('restored unfinished expression never rearms autoplay until a deliberate edit', () => {
  const f = fixture();
  const context = {
    ...f.context, rejectionSelectionRef: { current: 'water' },
    previousAiSelectionRef: { current: 'water' }, feedbackInputRef: { current: null },
    candidateAutoplayDelaySeconds: 15
  };
  context.restorationMutedRef.current = true;
  rejectionEffect(context)();
  assert.equal(f.scheduled.length, 0);
  assert.equal(f.pending.length, 0);
  assert.equal(f.played.length, 0);
  f.edit({ type: 'add-tile', tile: { label: '几何图形' } }, '手动修改');
  rejectionEffect(context)();
  assert.equal(f.scheduled.length, 1);
});

test('failed verified local save blocks paid AI before transport', async () => {
  const f = fixture();
  const generate = extract('handleGenerateAiCandidates', {
    ...f.context, persistDraft: () => false
  });
  await generate();
  assert.equal(f.pending.length, 0);
  assert.equal(f.context.aiPendingRef.current, false);
  assert.match(f.notices.at(-1), /未发起 AI/);
});

test('actual draft persistence reports failure and retries without dropping in-memory expression', () => {
  const snapshot = { pipeline: { outputSnapshot: [{ label: '合成林安', personId: 'a', image: 'private:a' }],
    candidateSentences: ['合成林安不喝水'], selectedIndex: 0 }, rejected: true, candidateFeedbackEntries: [] };
  const states = [], failures = [], pending = [];
  let fail = true;
  const context = {
    draftService: { getCurrent: () => null,
      save(value) { if (fail) throw new Error('合成存储失败'); return { snapshot: value, status: 'draft' }; } },
    draftSnapshotRef: { current: snapshot }, clearPendingAiRef: { current: false },
    newExpressionAfterConfirmationRef: { current: false },
    lastSavedDraftSignatureRef: { current: '' },
    setPendingAiRecovery: value => pending.push(value),
    setSavedDraftSignature: () => {},
    setDraftSaveFailed: value => failures.push(value), setDraftSaveStatus: value => states.push(value)
  };
  const persist = extract('persistDraft', context);
  assert.equal(persist(), false);
  assert.equal(context.lastSavedDraftSignatureRef.current, '');
  assert.equal(context.draftSnapshotRef.current, snapshot);
  assert.equal(states.includes('已保存到本机'), false);
  fail = false;
  assert.equal(persist(), true);
  assert.equal(states.at(-1), '已保存到本机');
  assert.equal(failures.at(-1), false);
});

test('saved indicator belongs to the current snapshot and never carries over to unsaved edits', () => {
  const base = { draftSaveFailed: false, isExpressionConfirmed: false,
    draftSaveStatus: '已保存到本机', savedDraftSignature: 'revision-one', draftSignature: 'revision-two' };
  assert.equal(extract('draftVisibleSaveStatus', base), '正在保存到本机…');
  assert.equal(extract('draftVisibleSaveStatus', { ...base, savedDraftSignature: 'revision-two' }), '已保存到本机');
  assert.equal(extract('draftVisibleSaveStatus', { ...base, draftSaveFailed: true, draftSaveStatus: '保存失败，请重试' }), '保存失败，请重试');
});

test('leaving with rendered unsaved changes flushes the same snapshot without AI or speech', () => {
  const f = fixture(), saves = [];
  const snapshot = { pipeline: f.context.session.pipeline, rejected: true };
  const hide = extract('handleWorkspaceHide', { ...f.context,
    draftService: { getCurrent: () => null }, draftSnapshotRef: { current: snapshot },
    lastSavedDraftSignatureRef: { current: 'previous' },
    persistDraft: () => { saves.push(snapshot); return false; }
  });
  hide();
  assert.equal(saves.length, 1);
  assert.equal(saves[0], snapshot);
  assert.equal(f.pending.length, 0);
  assert.equal(f.played.length, 0);
});

test('cold blank entry after confirmation preserves the completed marker until an actual edit', () => {
  const pipeline = { outputSnapshot: [], candidateSentences: [], selectedIndex: 0 };
  const context = { draftService: { getCurrent: () => ({ status: 'confirmed' }) },
    session: { pipeline }, candidatesRejected: false, candidateFeedbackEntries: [],
    useRef: value => ({ current: value }) };
  const signature = extract('settledEntrySignature', context);
  assert.equal(signature, JSON.stringify({ pipeline, rejected: false, candidateFeedbackEntries: [] }));
  const saves = [];
  const effect = { isExpressionConfirmed: false, lastSavedDraftSignatureRef: { current: signature },
    draftSignature: signature, persistDraft: () => saves.push('save') };
  effectContaining(effect, 'lastSavedDraftSignatureRef.current === draftSignature')();
  assert.equal(saves.length, 0, 'opening must not replace confirmed with a new cleared draft');
  effect.draftSignature = JSON.stringify({ pipeline: { ...pipeline, candidateSentences: ['我不想喝水'] } });
  effectContaining(effect, 'lastSavedDraftSignatureRef.current === draftSignature')();
  assert.equal(saves.length, 1, 'actual new content is still saved');
});

test('unconfirmed and nonempty entries do not use the settled-entry save shortcut', () => {
  const base = { session: { pipeline: { outputSnapshot: [], candidateSentences: [] } },
    candidatesRejected: false, candidateFeedbackEntries: [], useRef: value => ({ current: value }) };
  for (const status of ['draft', 'cleared']) assert.equal(extract('settledEntrySignature', {
    ...base, draftService: { getCurrent: () => ({ status }) }
  }), '');
  for (const pipeline of [{ outputSnapshot: [{ personId: 'synthetic-a' }], candidateSentences: [] },
    { outputSnapshot: [], candidateSentences: ['我不想喝水'] }]) assert.equal(extract('settledEntrySignature', {
      ...base, session: { pipeline }, draftService: { getCurrent: () => ({ status: 'confirmed' }) }
    }), '');
});

test('first actual edit after confirmed cold entry starts a new draft even for identical saved content', () => {
  const originalHistory = [{ id: 'confirmed-original', sentence: '我今晚不回家吃饭' }];
  const historyBefore = JSON.stringify(originalHistory);
  const snapshot = { pipeline: { outputSnapshot: [], candidateSentences: ['我今晚不回家吃饭'], selectedIndex: 0 },
    rejected: false, candidateFeedbackEntries: [] };
  const calls = [], statuses = [];
  let record = { id: 'old-draft', status: 'confirmed', snapshot };
  const pending = extract('newExpressionAfterConfirmationRef', {
    settledEntrySignature: 'confirmed-blank-signature', useRef: value => ({ current: value })
  });
  const context = {
    draftService: { getCurrent: () => record, save(value, options) {
      calls.push(options.startNew);
      if (options.startNew) record = { id: 'new-draft', status: 'draft', snapshot: value };
      return record;
    } },
    newExpressionAfterConfirmationRef: pending,
    draftSnapshotRef: { current: snapshot }, clearPendingAiRef: { current: false },
    lastSavedDraftSignatureRef: { current: 'confirmed-blank-signature' },
    setSavedDraftSignature: () => {}, setPendingAiRecovery: () => {}, setDraftSaveFailed: () => {},
    setDraftSaveStatus: value => statuses.push(value)
  };
  const persist = extract('persistDraft', context);
  assert.equal(persist(), true);
  assert.equal(record.status, 'draft');
  assert.equal(record.id, 'new-draft');
  assert.equal(pending.current, false, 'new-expression intent is consumed only after successful save');
  assert.equal(statuses.at(-1), '已保存到本机');
  assert.equal(persist(), true);
  assert.deepEqual(calls, [true, false], 'retry after success must retain the new draft identity');
  assert.equal(JSON.stringify(originalHistory), historyBefore);
});

test('failed first edit after confirmation retains its new-expression intent for explicit save retry', () => {
  const snapshot = { pipeline: { outputSnapshot: [], candidateSentences: ['我今晚不回家吃饭'] } };
  const pending = { current: true }, calls = [], notices = [];
  let fail = true;
  const context = {
    draftService: { getCurrent: () => ({ status: 'confirmed' }), save(value, options) {
      calls.push(options.startNew);
      if (fail) throw new Error('合成写入失败');
      return { status: 'draft', snapshot: value };
    } },
    newExpressionAfterConfirmationRef: pending,
    draftSnapshotRef: { current: snapshot }, clearPendingAiRef: { current: false },
    lastSavedDraftSignatureRef: { current: 'confirmed-blank-signature' },
    setSavedDraftSignature: () => {}, setPendingAiRecovery: () => {}, setDraftSaveFailed: () => {},
    setDraftSaveStatus: value => notices.push(value)
  };
  const persist = extract('persistDraft', context);
  assert.equal(persist(), false);
  assert.equal(pending.current, true);
  assert.equal(context.lastSavedDraftSignatureRef.current, 'confirmed-blank-signature');
  assert.equal(notices.includes('已保存到本机'), false);
  fail = false;
  assert.equal(persist(), true);
  assert.deepEqual(calls, [true, true]);
  assert.equal(pending.current, false);
});

test('hiding a settled blank workspace does not consume the pending new-expression intent', () => {
  const f = fixture(), snapshot = { pipeline: { outputSnapshot: [], candidateSentences: [] } };
  const pending = { current: true }, saves = [];
  const hide = extract('handleWorkspaceHide', { ...f.context,
    draftService: { getCurrent: () => ({ status: 'confirmed' }) },
    draftSnapshotRef: { current: snapshot }, lastSavedDraftSignatureRef: { current: JSON.stringify(snapshot) },
    isExpressionConfirmed: false, newExpressionAfterConfirmationRef: pending,
    persistDraft: () => { saves.push('save'); pending.current = false; return true; }
  });
  hide();
  assert.equal(saves.length, 0);
  assert.equal(pending.current, true);
});

test('same-runtime successful reuse leaves old confirmation and creates one new draft through the normal effect', () => {
  const f = fixture(), events = [], history = [{ id: 'old-confirmation', sentence: '我今晚不回家吃饭' }];
  const snapshot = { pipeline: { outputSnapshot: [], candidateSentences: ['我今晚不回家吃饭'], selectedIndex: 0 },
    rejected: false, candidateFeedbackEntries: [] };
  const signature = JSON.stringify(snapshot);
  let record = { status: 'confirmed', id: 'old-draft', snapshot }, confirmed = true;
  const context = { ...f.context,
    draftService: { getCurrent: () => record, save(value, options) {
      events.push(options.startNew);
      if (options.startNew) record = { status: 'draft', id: 'new-draft', snapshot: value };
      return record;
    } },
    onReusePhrase: () => true,
    newExpressionAfterConfirmationRef: { current: false },
    lastSavedDraftSignatureRef: { current: signature }, draftSnapshotRef: { current: snapshot },
    confirmedHistoryIdRef: { current: 'old-confirmation' }, candidateFeedbackDraftIdRef: { current: 'old-feedback' },
    setIsExpressionConfirmed: value => { confirmed = value; },
    setSavedDraftSignature: () => {}, setDraftSaveFailed: () => {}, setDraftSaveStatus: () => {}
  };
  extract('handleReusePhrase', context)({ sentence: '我今晚不回家吃饭', output: [] });
  assert.equal(confirmed, false);
  assert.equal(context.newExpressionAfterConfirmationRef.current, true);
  assert.equal(context.confirmedHistoryIdRef.current, null);
  assert.equal(context.candidateFeedbackDraftIdRef.current, null);
  const effect = { isExpressionConfirmed: confirmed, lastSavedDraftSignatureRef: context.lastSavedDraftSignatureRef,
    draftSignature: signature, persistDraft: extract('persistDraft', context) };
  effectContaining(effect, 'lastSavedDraftSignatureRef.current === draftSignature')();
  effectContaining(effect, 'lastSavedDraftSignatureRef.current === draftSignature')();
  assert.deepEqual(events, [true]);
  assert.equal(record.status, 'draft');
  assert.deepEqual(history, [{ id: 'old-confirmation', sentence: '我今晚不回家吃饭' }]);
});

test('failed saved phrase reuse preserves confirmed identity and does not begin a new draft', () => {
  const f = fixture(), changes = [];
  const context = { ...f.context,
    onReusePhrase: () => false,
    draftService: { getCurrent: () => ({ status: 'confirmed' }) },
    newExpressionAfterConfirmationRef: { current: false }, lastSavedDraftSignatureRef: { current: 'confirmed-signature' },
    confirmedHistoryIdRef: { current: 'old-confirmation' }, candidateFeedbackDraftIdRef: { current: 'old-feedback' },
    setIsExpressionConfirmed: value => changes.push(value)
  };
  extract('handleReusePhrase', context)({ sentence: '我今晚不回家吃饭', output: [] });
  assert.equal(context.newExpressionAfterConfirmationRef.current, false);
  assert.equal(context.lastSavedDraftSignatureRef.current, 'confirmed-signature');
  assert.equal(context.confirmedHistoryIdRef.current, 'old-confirmation');
  assert.equal(context.candidateFeedbackDraftIdRef.current, 'old-feedback');
  assert.deepEqual(changes, []);
});

test('same-sentence reuse retains all three feedback rows and can rate the second candidate without changing history', () => {
  const f = fixture();
  let feedback = [];
  const context = { ...f.context,
    onReusePhrase: () => true,
    draftService: { getCurrent: () => ({ status: 'confirmed' }) },
    newExpressionAfterConfirmationRef: { current: false }, lastSavedDraftSignatureRef: { current: 'old-signature' },
    confirmedHistoryIdRef: { current: 'old-confirmation' }, candidateFeedbackDraftIdRef: { current: 'old-feedback' },
    setCandidateFeedbackEntries: value => { feedback = value; }
  };
  extract('handleReusePhrase', context)({ sentence: '水', output: [{ label: '水' }] });
  assert.equal(feedback.length, 3);
  assert.deepEqual(Array.from(feedback, row => row.sentence), context.session.pipeline.candidateSentences);
  extract('handleCandidateFeedback', { ...context,
    isExpressionConfirmed: false, candidateFeedbackEntries: feedback, candidateFeedbackSyncAvailable: false,
    toggleExpressionCandidateFeedback: sharedFeedback.exports.toggleExpressionCandidateFeedback,
    buildExpressionHistoryEntry: () => ({ sentence: '水' }),
    persistExpressionHistoryEntry: () => { throw new Error('must not modify old confirmed history'); }
  })(1, 'up');
  assert.equal(feedback.length, 3);
  assert.equal(feedback[1].feedback, 'up');
  assert.equal(f.drafts.at(-1).candidates[1].feedback, 'up');
  assert.equal(context.confirmedHistoryIdRef.current, null);
});

test('AI recovery attaches local lifecycle metadata only after verified save and does not lose same request state', async () => {
  const f = fixture(), events = [];
  const context = {
    ...f.context,
    persistDraft: () => { events.push('saved'); return true; },
    draftService: { getCurrent: () => ({ snapshot: { pendingAi: { requestId: 'synthetic-same' } } }) },
    attachExpressionDraftRequest: request => { events.push('attached'); return request; },
    setPendingAiRecovery: value => events.push(value ? 'pending' : 'clear')
  };
  const task = extract('handleGenerateAiCandidates', context)();
  assert.deepEqual(events, ['saved', 'attached']);
  f.pending[0].resolve({ ok: false, code: 'AI_REQUEST_RESULT_UNKNOWN', message: '结果未知，请核对' });
  await task;
  assert.equal(events.at(-1), 'pending');
  assert.equal(f.completed(), 0);
});
