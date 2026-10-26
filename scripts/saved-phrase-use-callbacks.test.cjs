'use strict';
// Same actual-source callback harness as expression-ai-callbacks.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function extract(file, name, context) {
  const ast=ts.createSourceFile(file,fs.readFileSync(path.resolve(__dirname,'../src/features/communication',file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let source;
  function visit(node) {
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name) source=node.initializer.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast); assert.ok(source,name);
  const box={module:{exports:{}},...context};
  vm.runInNewContext(ts.transpileModule('module.exports='+source,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,box);
  return box.module.exports;
}
function fixture() {
  const pending=[],used=[],shown=[],notices=[];
  const c={
    savedPlaybackPending:{current:false},savedPlaybackCounted:{current:false},speechGenerationRef:{current:0},
    invalidatePendingShare(){},invalidatePendingAi(){},handlePatientInteraction(){},
    setPlaybackPhrase:x=>shown.push(x),setNotice:x=>notices.push(x),onUseSavedPhrase:x=>used.push(x),
    candidateAutoplayControllerRef:{current:{cancel(){}}},
    stopSpeechPlayback(){c.speechGenerationRef.current++},
    playCandidateQueue:()=>{c.speechGenerationRef.current++;return new Promise(resolve=>pending.push(resolve))},
    playbackPhrase:{id:'one',sentence:'我今晚不回家吃饭',output:[]}
  };
  return {c,pending,used,shown,notices,run:name=>extract('ExpressionWorkspace.tsx',name,c)};
}
test('mini silent view and close never play, count or mutate the expression',()=>{
  const f=fixture(); f.run('handleViewSavedPhrase')(f.c.playbackPhrase);
  assert.equal(f.pending.length,0); assert.equal(f.used.length,0);
  assert.equal(f.shown[0],f.c.playbackPhrase);
  f.run('handleCloseSavedPhrasePlayback')(); assert.equal(f.shown.at(-1),null);
  assert.match(f.notices.at(-1),/已返回/);
});
test('mini double play/replay counts only successful first playback in the overlay',async()=>{
  const f=fixture(), play=f.run('handlePlaySavedPhrase'), replay=f.run('handleReplaySavedPhrase');
  const first=play(f.c.playbackPhrase); await play(f.c.playbackPhrase);
  assert.equal(f.pending.length,1); assert.equal(f.used.length,0);
  f.pending[0](true);await first; assert.equal(f.used.length,1);
  const second=replay();f.pending[1](true);await second;assert.equal(f.used.length,1);
});
test('late playback completion cannot clear a newer pending run or count a cancelled run',async()=>{
  const f=fixture(),play=f.run('handlePlaySavedPhrase');
  const old=play(f.c.playbackPhrase);f.run('handleViewSavedPhrase')({...f.c.playbackPhrase,id:'two'});
  const next=play({...f.c.playbackPhrase,id:'two'});
  f.pending[0](true);await old;assert.equal(f.used.length,0);assert.equal(f.c.savedPlaybackPending.current,true);
  f.pending[1](true);await next;assert.equal(f.used.length,1);assert.equal(f.used[0].id,'two');
});
test('manager speech failure, double click and changed scope never count incorrectly',async()=>{
  const pending=[],used=[],notices=[];let scope='a';
  const c={speechPending:{current:false},speechRun:{current:0},speechCounted:{current:false},
    careScopedKey:()=>scope,setSpeaking(){},setNotice:x=>notices.push(x),speechRate:1,
    wechatSpeechPort:{speak:()=>new Promise(resolve=>pending.push(resolve))},
    service:{markSavedPhraseUsed:id=>{used.push(id);return[]}},onItemsChange(){}};
  const speak=extract('SavedPhraseManager.tsx','speak',c),item={id:'a',sentence:'合成句'};
  const first=speak(item);await speak(item);assert.equal(pending.length,1);
  pending[0]({ok:false,message:'失败'});await first;assert.equal(used.length,0);
  const second=speak(item);scope='b';pending[1]({ok:true,message:'成功'});await second;assert.equal(used.length,0);
});
test('manager double undo dispatches one operation without a countdown',async()=>{
  const operations=[],pending={current:false};
  const undo=extract('SavedPhraseManager.tsx','undoDelete',{
    undoPending:pending,undoState:{operationId:'one'},onItemsChange(){},setNotice(){},setUndoState(){},
    service:{undoSavedPhraseDelete:id=>{operations.push(id);return[]},savedPhraseUndoState:()=>({count:2,operationId:'two'})}
  });
  undo();undo();assert.deepEqual(operations,['one']);
  await Promise.resolve();assert.equal(pending.current,false);
});
