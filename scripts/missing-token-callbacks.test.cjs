'use strict';
// Reuse the audit's real-TS-callback harness and CBoard repository. Only network,
// lifecycle and storage boundaries are synthetic; no copied callback logic.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const mini=path.resolve(__dirname,'..'),web=path.resolve(mini,'../cboard');
require(path.join(web,'scripts/evaluateCommunicationSegmentation.cjs')).loadCore();
const babel=require(path.join(web,'node_modules/@babel/core'));
const previous=require.extensions['.js'];
require.extensions['.js']=(mod,file)=>{
  if(!file.startsWith(path.join(web,'src/common/communicationSupport')+path.sep)) return previous(mod,file);
  const result=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,plugins:[require.resolve(path.join(web,'node_modules/@babel/plugin-transform-modules-commonjs'))]});
  mod._compile(result.code,file);
};
const {createCommunicationRepository}=require(path.join(web,'src/common/communicationSupport/repository.js'));
const {normalizeMissingTokenSuggestions,getMissingTokenSuggestions}=require(path.join(web,'src/common/communicationSupport/missingTokens.js'));
const {buildArasaacSemanticFields}=require(path.join(web,'src/common/communicationSupport/pictogramSemantics.js'));
const {filterPublicPictureTokens}=require(path.join(web,'src/common/communicationSupport/personalPeople.js'));
const {buildCommunicationTileCatalog}=require(path.join(web,'src/common/communicationSupport/symbolMatching.js'));
const {currentImageOperationEpoch,invalidateImageOperations}=require(path.join(web,'src/common/communicationSupport/imageOperationEpoch.js'));
require.extensions['.js']=previous;
const ts=require('typescript');
const file=path.join(mini,'src/packages/caregiver/pages/receiver/index.tsx');
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name,context){
  let value;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)value=n.initializer.getText(ast);ts.forEachChild(n,visit);}
  visit(ast);assert.ok(value,name);
  const code=ts.transpileModule('module.exports = '+value,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const box={module:{exports:{}},...context};vm.runInNewContext(code,box);return box.module.exports;
}
const picture={id:'runtime_arasaac_999',label:'停车场',vocalization:'停车场',image:'/synthetic.png',source:{provider:'arasaac',originalId:'999',name:'ARASAAC',license:'CC BY-NC-SA 4.0',sourceUrl:'https://arasaac.org/pictograms/999'}};
const cachedPicture={...picture,image:'wxfile://saved/parking.png'};
function fixture(status='new'){
  const storage=new Map();let clock=100,id=0,rejectWrites=false,cleanupResult=true,referenceCheckFails=false;
  const options={storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(rejectWrites)throw new Error('quota');storage.set(k,v);},removeItem:k=>storage.delete(k)},now:()=>++clock,createId:p=>p+'-'+(++id)};
  const repository=createCommunicationRepository(options);
  const [record]=repository.recordMissingTokens({tokens:['停车场'],rawText:'停车场在哪里'});
  if(status==='suggested')repository.reviewMissingToken(record.id,{status,suggestedPictogram:picture,suggestedPictogramId:picture.id});
  const pending=[],removed=[];let scope='family-a',renders=0;
  const port={search:tokens=>new Promise(resolve=>pending.push({tokens,resolve})),cache:p=>new Promise(resolve=>pending.push({picture:p,resolve}))};
  const context={repositoryRef:{current:repository},taroPictogramSearchPort:port,normalizeMissingTokenSuggestions,getMissingTokenSuggestions,
    currentImageOperationEpoch,preparedMissingImagesRef:{current:new Map()},
    filterPublicPictureTokens,buildCommunicationTileCatalog,communicationBoards:[],
    missingTokenRequestsRef:{current:new Map()},missingTokenConfirmationsRef:{current:new Set()},missingTokenScopeKey:scope,getMissingTokenScopeKey:()=>scope,setMissingTokenItems:()=>renders++,
    captureMissingTokenImageUsage:()=>image=>{
      if(referenceCheckFails)throw new Error('storage unreadable');
      return repository.loadMissingTokens().some(item=>[item.resolvedPictogram,item.suggestedPictogram,...(item.suggestedPictograms||[])].some(p=>p&&p.image===image));
    },
    taroPersonalImagePort:{remove:async image=>{removed.push(image);if(cleanupResult instanceof Error)throw cleanupResult;return cleanupResult;}}};
  context.isMissingTokenRequestCurrent=extract('isMissingTokenRequestCurrent',context);
  return {repository,record,pending,port,context,search:extract('searchMissingTokensOnline',context),accept:extract('acceptMissingTokenOnline',context),
    current:()=>repository.loadMissingTokens().find(r=>r.id===record.id),switchScope:()=>{scope='family-b';},renders:()=>renders,
    restart:()=>createCommunicationRepository(options),removed,setWriteFailure:value=>{rejectWrites=value;},setCleanupResult:value=>{cleanupResult=value;},failReferenceCheck:()=>{referenceCheckFails=true;}};
}
const found=(p=picture)=>({ok:true,value:[{token:'停车场',pictogram:p}]});
test('recording receiver gaps stays local even with online search enabled; explicit search remains usable',async()=>{
  const f=fixture();let implicitSearches=0;
  const record=extract('recordMissingTokens',{
    ...f.context,preparationMode:false,preferences:{onlinePictogramSearchEnabled:true},
    taroPictogramSearchPort:{...f.port,configured:true},
    attemptedAutomaticMissingTokenIdsRef:{current:new Set()},
    searchMissingTokensOnline:()=>{implicitSearches++;return Promise.resolve({ok:true});}
  });
  assert.equal(record({tokens:['停车场'],rawText:'停车场在哪里'}),true);
  assert.equal(implicitSearches,0);assert.equal(f.pending.length,0);
  const task=f.search([f.record.id]);
  assert.equal(f.pending.length,1);
  f.pending[0].resolve(found());await task;
  assert.equal(f.current().status,'suggested');
});
for(const mode of ['search','cache']){
  for(const action of ['ignore','manual','scope','hide']){
    test(`${mode}: ${action} wins over a late result`,async()=>{
      const f=fixture(mode==='cache'?'suggested':'new');
      const task=mode==='search'?f.search([f.record.id]):f.accept(f.record.id,picture.id);
      if(action==='ignore')f.repository.reviewMissingToken(f.record.id,{status:'ignored'});
      if(action==='manual')f.repository.reviewMissingToken(f.record.id,{status:'resolved',resolvedPictogramId:'chosen',resolvedPictogram:{...picture,id:'chosen',image:'/chosen.png'}});
      if(action==='scope')f.switchScope();
      if(action==='hide')f.context.missingTokenRequestsRef.current.clear();
      const before=JSON.stringify(f.current());
      f.pending[0].resolve(mode==='search'?found():{ok:true,value:cachedPicture});await task;
      assert.equal(JSON.stringify(f.current()),before);
      // Cancellation does not prove a stored file has no other snapshot references.
      assert.deepEqual(f.removed,[]);
      if(action==='scope'||action==='hide')assert.equal(f.renders(),0);
    });
  }
}
test('suggested refresh sends the token and keeps candidates through offline failure, then retries',async()=>{
  const f=fixture('suggested'),before=JSON.stringify(f.current());
  let task=f.search([f.record.id]);assert.deepEqual(Array.from(f.pending[0].tokens),['停车场']);
  f.pending[0].resolve({ok:false,message:'offline'});await task;assert.equal(JSON.stringify(f.current()),before);
  task=f.search([f.record.id]);f.pending[1].resolve(found({...picture,id:'new-candidate'}));await task;
  assert.equal(f.current().suggestedPictogramId,'new-candidate');
});

test('search ranks the later qualified candidate before applying the four-image limit',async()=>{
  const f=fixture();
  const [record]=f.repository.recordMissingTokens({tokens:['回家'],rawText:'今晚回家'});
  const task=f.search([record.id]);
  f.pending[0].resolve({ok:true,value:[1,2,3,4,29714].map(id=>({token:'回家',pictogram:{
    ...picture,id:`home-${id}`,image:`/images/${id}.png`,
    ...buildArasaacSemanticFields('回家',id===29714?'come back':'go home','en',id,{keywords:[{keyword:id===29714?'come back':'go home'}]}),
    source:{...picture.source,originalId:String(id),sourceUrl:`https://arasaac.org/pictograms/${id}`}
  }}))});
  await task;
  const saved=f.repository.loadMissingTokens().find(r=>r.id===record.id);
  assert.deepEqual(saved.suggestedPictograms.map(p=>p.source.originalId),['29714','1','2','3']);
  assert.equal(saved.status,'suggested');
});
test('newest search wins when responses arrive in reverse order',async()=>{
  const f=fixture(),first=f.search([f.record.id]),second=f.search([f.record.id]);
  f.pending[1].resolve(found({...picture,id:'second'}));await second;
  f.pending[0].resolve(found({...picture,id:'first'}));await first;
  assert.equal(f.current().suggestedPictogramId,'second');
});
test('candidate replacement during caching cannot confirm the old picture',async()=>{
  const f=fixture('suggested'),task=f.accept(f.record.id,picture.id);
  f.repository.reviewMissingToken(f.record.id,{status:'suggested',suggestedPictogram:{...picture,image:'/replacement.png'},suggestedPictogramId:picture.id});
  const before=JSON.stringify(f.current());f.pending[0].resolve({ok:true,value:cachedPicture});
  assert.equal((await task).ok,false);assert.equal(JSON.stringify(f.current()),before);
  assert.deepEqual(f.removed,[]);
});
test('failed cache preserves review; retry persists the confirmed offline file across repository restart',async()=>{
  const f=fixture('suggested'),before=JSON.stringify(f.current());let task=f.accept(f.record.id,picture.id);
  f.pending[0].resolve({ok:false,message:'offline'});await task;assert.equal(JSON.stringify(f.current()),before);
  task=f.accept(f.record.id,picture.id);f.pending[1].resolve({ok:true,value:{...picture,image:'/local/cached.png'}});assert.equal((await task).ok,true);
  assert.equal(f.restart().loadMissingTokens()[0].resolvedPictogram.image,'/local/cached.png');
  assert.deepEqual(f.removed,[]);
});
test('stale page cannot initiate operations after a scope change',async()=>{
  const f=fixture('suggested');f.switchScope();
  assert.equal((await f.search([f.record.id])).ok,false);
  assert.equal((await f.accept(f.record.id,picture.id)).ok,false);assert.equal(f.pending.length,0);
});
test('duplicate confirmations start only one cache operation before rerender',async()=>{
  const f=fixture('suggested'),first=f.accept(f.record.id,picture.id);
  assert.equal((await f.accept(f.record.id,picture.id)).ok,false);
  assert.equal(f.pending.length,1);
  f.pending[0].resolve({ok:true,value:cachedPicture});assert.equal((await first).ok,true);
  assert.equal(f.current().resolvedPictogram.image,cachedPicture.image);
  assert.deepEqual(f.removed,[]);
});
test('metadata quota failure retains prepared bytes and retries without a second download',async()=>{
  const f=fixture('suggested'),before=JSON.stringify(f.current()),task=f.accept(f.record.id,picture.id);
  f.setWriteFailure(true);f.pending[0].resolve({ok:true,value:cachedPicture});
  const result=await task;assert.equal(result.ok,false);assert.match(result.message,/词图关联保存失败/);
  assert.equal(JSON.stringify(f.current()),before);assert.deepEqual(f.removed,[]);
  f.setWriteFailure(false);const retry=f.accept(f.record.id,picture.id);
  assert.equal((await retry).ok,true);assert.equal(f.current().resolvedPictogram.image,cachedPicture.image);
  assert.equal(f.pending.length,1);assert.deepEqual(f.removed,[]);
});
test('a repository that declines the review does not produce a successful confirmation',async()=>{
  const f=fixture('suggested'),before=JSON.stringify(f.current());
  f.repository.reviewMissingToken=()=>null;
  const task=f.accept(f.record.id,picture.id);f.pending[0].resolve({ok:true,value:cachedPicture});
  assert.equal((await task).ok,false);assert.equal(JSON.stringify(f.current()),before);
  assert.deepEqual(f.removed,[]);
});
for(const outcome of [false,new Error('cleanup unavailable')]){
  test(`cancellation does not invoke uncertain cleanup (${String(outcome)})`,async()=>{
    const f=fixture('suggested'),task=f.accept(f.record.id,picture.id);
    f.repository.reviewMissingToken(f.record.id,{status:'ignored'});f.setCleanupResult(outcome);
    f.pending[0].resolve({ok:true,value:cachedPicture});const result=await task;
    assert.equal(result.ok,false);assert.ok(result.message.startsWith('记录或候选图已更新，请重新确认。'));
    assert.doesNotMatch(result.message,/清理未完成/);assert.equal(f.current().status,'ignored');
    assert.deepEqual(f.removed,[]);
  });
}
test('failed reference inspection retains the file and the original failure',async()=>{
  const f=fixture('suggested'),task=f.accept(f.record.id,picture.id);
  f.repository.reviewMissingToken(f.record.id,{status:'ignored'});f.failReferenceCheck();
  f.pending[0].resolve({ok:true,value:cachedPicture});const result=await task;
  assert.equal(result.ok,false);assert.ok(result.message.startsWith('记录或候选图已更新，请重新确认。'));
  assert.doesNotMatch(result.message,/清理未完成/);assert.deepEqual(f.removed,[]);
});
test('privacy cleanup invalidates the late image without adopting it',async()=>{
  const f=fixture('suggested'),before=JSON.stringify(f.current()),task=f.accept(f.record.id,picture.id);
  invalidateImageOperations();f.pending[0].resolve({ok:true,value:cachedPicture});
  assert.equal((await task).ok,false);assert.equal(JSON.stringify(f.current()),before);
  assert.deepEqual(f.removed,[]);
});
test('a file adopted by another record is never removed during rollback',async()=>{
  const f=fixture('suggested'),task=f.accept(f.record.id,picture.id);
  const other=f.repository.recordMissingTokens({tokens:['另一个词'],rawText:'另一个词'}).find(item=>item.id!==f.record.id);
  f.repository.reviewMissingToken(other.id,{status:'resolved',resolvedPictogram:cachedPicture,resolvedPictogramId:picture.id});
  f.repository.reviewMissingToken(f.record.id,{status:'ignored'});
  f.pending[0].resolve({ok:true,value:cachedPicture});assert.equal((await task).ok,false);
  assert.deepEqual(f.removed,[]);
  assert.equal(f.repository.loadMissingTokens().find(item=>item.id===other.id).resolvedPictogram.image,cachedPicture.image);
});
