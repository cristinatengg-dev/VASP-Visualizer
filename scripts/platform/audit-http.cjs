// Isolated HTTP acceptance audit. No live SMS, provider calls, or customer data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PlatformAuth } = require('../../server/src/auth/platform-auth');
const { createProductApp } = require('../../server/src/platform/app');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eliangmat-http-audit-'));
const checks = [];
let cookie = '', delivered, server, base;
async function request(label, method, route, body, expected = 200, as = cookie) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + route, {method, headers: {
    'X-EliangMat-Client': 'knowledge-v1', cookie: as,
    ...(multipart ? {} : {'Content-Type': 'application/json'}),
  }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body)});
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  checks.push({label, method, route, expected, actual: response.status, pass: response.status === expected});
  assert.equal(response.status, expected, label + ': ' + text.slice(0, 500));
  return {data, response};
}
const get = async (label, route, expected, as) => (await request(label, 'GET', route, undefined, expected, as)).data;
const post = async (label, route, body, expected, as) => (await request(label, 'POST', route, body, expected, as)).data;
const patch = async (label, route, body, expected, as) => (await request(label, 'PATCH', route, body, expected, as)).data;
async function login(phone) {
  await post('OTP send using isolated delivery stub', '/api/auth/send-phone-code', {phone});
  const result = await request('OTP login', 'POST', '/api/auth/login', {phone, code: delivered});
  assert.match(result.response.headers.get('set-cookie'), /HttpOnly/);
  return result.response.headers.get('set-cookie').split(';')[0];
}
async function main() {
  const auth = new PlatformAuth(path.join(root, 'auth'), {mode:'tencent', development:false, deliver:async (_phone, code) => {delivered=code;}});
  server = require('node:http').createServer().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const {app} = createProductApp({auth, root:path.join(root,'data'), origins:[base], smsReady:true});
  server.on('request', app);
  await get('health', '/api/health');
  await get('anonymous blocked', '/api/platform', 401);
  await post('development login absent', '/api/auth/development-login', {}, 404);
  cookie = await login('+12025550148');
  const accountA = cookie;
  const initial = await get('formal overview', '/api/platform');
  assert.equal(initial.environment, 'production'); assert.equal(initial.wallet, null);
  const target = {name:'QA-907 isolated fictional HTTP audit', goal:'200°C 屈服强度至少300 MPa，延伸率至少8%，最多4个样品，周期4周。全部虚构仅软件验收。', family:'Al-Cu-Mg', targetStrength:300, targetElongation:8, sampleBudget:4, testTemperature:200, standard:'QA-907 FICTIONAL v1', environment:'空气', strengthDefinition:'Rp0.2', repeats:2, durationWeeks:4};
  await post('requirements extraction', '/api/platform/requirements/preview', target);
  const project = await post('create private project', '/api/platform/projects', target, 201);
  const p = '/api/platform/projects/' + project.id;
  let state = await get('project detail', p); assert.equal(state.project.mode, 'private');
  await post('invalid composition refused', p+'/candidates', {composition:'Al 90 / Cu 20 / Mg 5',basis:'wt%',process:'fictional'}, 400);
  const c = await post('candidate registration', p+'/candidates', {composition:'Al 94 / Cu 4 / Mg 2',basis:'wt%',process:'QA fictional process'});
  await patch('candidate selection', p+'/candidates/'+c.id, {selected:true});
  await post('sample registration', p+'/samples', {id:'S1',candidate:c.id,batch:'B1',process:c.process});
  const contract = {execution:'manual', inputs:'fictional sample v1',outputs:'fictional original record',methodVersion:'QA v1',resource:'QA resource',assignee:'QA audit',dueAt:'2026-10-01T12:00',estimatedCost:0,acceptance:'software fixture only, no science use',dependencies:[]};
  await patch('configure manual task', p+'/tasks/screen', contract);
  await post('unapproved execution refused', p+'/tasks/screen/execute', {action:'submit'}, 409);
  state=await get('plan revision',p);
  await post('approve route',p+'/approve',{confirm:true,revision:state.workflow.revision});
  await post('manual dispatch',p+'/tasks/screen/execute',{action:'submit'});
  let task=await post('manual original return',p+'/tasks/screen/execute',{action:'return',artifact:{name:'QA.txt',content:'FICTIONAL SOFTWARE AUDIT ONLY. No real experiment.'},summary:'fictional return'});
  assert.equal(task.status,'waiting');
  task=await post('manual acceptance',p+'/tasks/screen/execute',{action:'accept',confirm:true,note:'fixture verified, no science use'}); assert.equal(task.status,'completed');
  await patch('dependent task configuration',p+'/tasks/prepare',{...contract,dependencies:['screen']});
  state=await get('dependent route revision',p);
  await post('approve dependent route',p+'/approve',{confirm:true,revision:state.workflow.revision});
  task=await post('versioned dependency dispatch',p+'/tasks/prepare/execute',{action:'submit'});
  assert.equal(task.runs[0].inputs[0].outputVersion,1);
  await post('task cancellation',p+'/tasks/prepare/execute',{action:'cancel',note:'audit cancelled before any real execution'});
  await patch('CSV task configuration',p+'/tasks/tensile',{...contract,execution:'curve-csv'});
  state=await get('CSV route revision',p);
  await post('approve CSV route',p+'/approve',{confirm:true,revision:state.workflow.revision});
  task=await post('invalid CSV records failure',p+'/tasks/tensile/execute',{action:'submit',artifact:{name:'bad.csv',content:'bad'}}); assert.equal(task.status,'failed');
  task=await post('CSV retry calculates',p+'/tasks/tensile/execute',{action:'submit',artifact:{name:'QA.csv',content:'strain,stress_mpa\n0,0\n0.01,100\n0.02,200'}}); assert.equal(task.status,'waiting');
  await post('CSV acceptance',p+'/tasks/tensile/execute',{action:'accept',confirm:true,note:'verified synthetic input'});
  const obs = {sampleId:'S1',strength:315,elongation:9,conditions:'QA fictional only',raw:'FICTIONAL SOFTWARE TEST RECORD, no actual science or training use.',temperature:25,standard:target.standard,environment:'空气',strengthDefinition:'Rp0.2',strainRate:.001,dimensions:'5mm diameter 25mm gauge fictional',specimenId:'T25',artifact:{name:'QA.txt',content:'fictional 25C test record'}};
  let o=await post('mismatched observation',p+'/observations',obs);
  await post('review mismatched observation',p+'/review',{observationId:o.id,decision:'accepted',confirm:true,note:'quality review not target attainment'});
  await post('incomparable next round refused',p+'/next-plan',{estimatedCost:0},409);
  for(const [specimenId,strength] of [['T200A',315],['T200B',317]]) {
    o=await post('independent 200C observation '+specimenId,p+'/observations',{...obs,specimenId,strength,temperature:200,artifact:{name:specimenId+'.txt',content:'fictional 200C record for '+specimenId}});
    await post('review '+specimenId,p+'/review',{observationId:o.id,decision:'accepted',confirm:true,note:'software fixture review only'});
  }
  const report=await get('research report export',p+'/report');
  assert.equal(report.hardwareExecuted,false); assert.equal(report.trainingSubmitted,false);
  assert.ok(report.workflow.datasets.some(d=>d.n===2), 'two independent specimens aggregate');
  const plan=await post('generate next round',p+'/next-plan',{estimatedCost:0,variable:'fictional aging time',variableValue:'2 h'});
  assert.equal(plan.rows.length,3);
  await post('confirm next round',p+'/next-plan/approve',{confirm:true,planId:plan.id});
  await post('next confirmation idempotent',p+'/next-plan/approve',{confirm:true,planId:plan.id});
  state=await get('round history and samples',p); assert.equal(state.workflow.round,2); assert.equal(state.workflow.samples.length,4);
  await post('local project message',p+'/messages',{message:'QA记录约定：报告先列温度，再列标准。'});
  const reply=await post('local project memory recall',p+'/messages',{message:'QA记录约定的报告顺序是什么？'}); assert.match(JSON.stringify(reply),/未调用语言模型/);
  await get('account conversation','/api/platform/conversation');
  await post('account auto recall','/api/platform/conversation',{message:'QA项目的报告顺序是什么？'});
  const m='/api/platform/memory';
  const item=await post('account memory add',m+'/items',{title:'QA记忆',content:'QA907 报告温度先于标准，全部虚构。',kind:'constraint'},201);
  await patch('memory versioned correction',m+'/items/'+item.id,{version:1,content:'QA907 更正：标准先于温度，全部虚构。'});
  await patch('stale memory write refused',m+'/items/'+item.id,{version:1,content:'stale content'},409);
  await get('memory version history',m+'/items/'+item.id+'/versions');
  const recalled=await post('account memory search',m+'/search',{query:'QA907'}); assert.ok(recalled.records.some(r=>r.id===item.id));
  const ref=recalled.records.find(r=>r.id===item.id);
  await get('memory source provenance',m+'/source?'+new URLSearchParams({id:ref.id,version:ref.version,projectId:ref.projectId||''}));
  let memory=await get('memory view',m);
  await patch('memory disable',m+'/settings',{revision:memory.revision,enabled:false,inheritCustomer:true});
  const off=await post('disabled memory search',m+'/search',{query:'QA907'}); assert.equal(off.records.length,0);
  memory=await get('memory disabled view',m);
  await patch('memory re-enable',m+'/settings',{revision:memory.revision,enabled:true,inheritCustomer:true});
  await get('memory history',m+'/history'); await get('memory export',m+'/export');
  await request('memory delete','DELETE',m+'/items/'+item.id,{version:2});
  await get('deleted history inaccessible',m+'/items/'+item.id+'/versions',404);
  await patch('account defaults','/api/platform/defaults',{model:'materials',mode:'private'});
  await patch('space settings','/api/platform/settings',{spaceName:'QA fictional audit',monthCap:0,taskCap:0,lowBalance:0});
  if(initial.resources[0]) {const resource=await patch('resource notes only','/api/platform/resources/'+initial.resources[0].id,{channel:'QA fixture only',note:'not connected'}); assert.equal(resource.state,'unconfigured');}
  for(const route of ['/orders','/orders/id/pay-test','/members','/usage/id/settle']) await post('formal unavailable '+route,'/api/platform'+route,{},403);
  await post('simulated task shortcut forbidden',p+'/tasks/screen',{action:'start'},403);
  await patch('unavailable model refused',p+'/model',{model:'gemini',externalConsent:true},400);
  const k='/api/knowledge/projects/'+project.id;
  await get('knowledge overview','/api/knowledge'); await get('shared knowledge project',k);
  const fixture={kind:'paper',title:'QA-907 FICTIONAL HTTP fixture',sourceId:'qa907-fictional',source:'audit-fixture',sourceUrl:'https://example.invalid/qa907',demo:true,pages:[{page:1,text:'FICTIONAL Alloy A measured 315 MPa at 200 C. No real experiment.'}]};
  const file=new FormData(); file.set('storageConsent','true'); file.set('file',new Blob([JSON.stringify(fixture)]),'QA907.jsonl');
  await post('JSONL multipart import',k+'/import',file,202);
  let kp;
  for(let i=0;i<100;i++){kp=await get('poll import',k);if(kp.jobs.every(j=>!['running','queued'].includes(j.status)))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(kp.documents.length,1); const doc=kp.documents[0],d=k+'/documents/'+doc.id;
  let detail=await get('document detail',d);
  await get('original source download',d+'/original/'+detail.versions[0].rawHash);
  await patch('rights authorization',d+'/rights',{confirm:true,rag:true,training:false,basis:'self-authored fictional software fixture'});
  const evidence=await post('evidence add',d+'/evidence',{kind:'measurement',page:1,quote:'Alloy A measured 315 MPa at 200 C.',material:'FICTIONAL Alloy A',value:'315',unit:'MPa',conditions:'200 C',basis:'wt%'},201);
  await patch('evidence review',d+'/evidence/'+evidence.id,{reviewed:true});
  await post('RAG export',k+'/export',{purpose:'rag'});
  await post('evidence project synchronization',p+'/evidence',{});
  await post('private training export denied',k+'/export',{purpose:'training'},403);
  const content=new FormData();content.set('storageConsent','true');content.set('file',new Blob(['FICTIONAL SOFTWARE AUDIT: Alloy A measured 316 MPa at 200 C.']),'QA907.txt');
  await post('TXT original upload',d+'/content',content);
  detail=await get('new original detail',d);
  await get('new original download',d+'/original/'+detail.contentRawHash);
  await post('changed source requires fresh evidence review',p+'/evidence',{},409);
  const other=await login('+12025550149');
  await get('cross-account project denied',p,404,other);
  await get('cross-account memory denied',p+'/memory',404,other);
  await get('cross-account original denied',d+'/original/'+detail.contentRawHash,404,other);
  await post('cross-account evidence mutation denied',d+'/evidence',{},404,other);
  await post('logout','/api/auth/logout',{},200,accountA);
  await get('revoked session denied','/api/platform',401,accountA);
}
main().then(()=>{console.log(JSON.stringify({ok:true,checks:checks.length}));}).catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{
  const output=path.resolve('artifacts/platform-http-audit-2026-09-07.json');fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({at:new Date().toISOString(),success:!process.exitCode,profile:'production app, isolated temporary storage, stub SMS transport, no external model',checks},null,2)+'\n');
  if(server) await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});
});
