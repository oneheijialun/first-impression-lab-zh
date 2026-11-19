import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.RESEARCH_DATA_DIR=await mkdtemp(path.join(tmpdir(),'impression-check-')); 
process.env.ADMIN_TOKEN = 'verification-only-token';
const { handler } = await import('./server.mjs');
async function request(url, method='GET', value, token) {
 const req = Readable.from(value ? [JSON.stringify(value)] : []);
 Object.assign(req,{url,method,headers:{host:'localhost',authorization:token ? 'Bearer '+token : undefined}});
 let status;
 let body;
 await handler(req,{writeHead(code){status=code},end(text){body=JSON.parse(text)}});
 return {status,body};
}
const created=await request('/api/sessions','POST',{mode:'test'});
assert.equal(created.status,201);
assert.ok([2,5,10].includes(created.body.exposure));
const url='/api/sessions/'+created.body.id;
const payload={kind:'trial',key:'verification',data:{valid:false,reason:'automated verification',gaze:[]}};
assert.equal((await request(url,'PUT',payload,'wrong')).status,403);
assert.equal((await request(url,'PUT',payload,created.body.token)).status,200);
assert.equal((await request(url,'PUT',payload,created.body.token)).status,200);
assert.equal((await request(url,'PUT',{...payload,data:{changed:true}},created.body.token)).status,409);
assert.equal((await request('/api/sessions','POST',{mode:'formal'})).status,409);
assert.equal((await request('/api/admin')).status,401);
const admin=await request('/api/admin','GET',undefined,process.env.ADMIN_TOKEN);
assert.equal(admin.status,200);
assert.equal(admin.body.records.filter(r=>r.session_id===created.body.id).length,1);
assert.ok(!JSON.stringify(admin.body.sessions).includes(created.body.token));
console.log('PASS session creation, exposure assignment, authorization, idempotent retry, conflict detection, formal gate, admin export and token redaction');

for(const file of ['/','/admin','/admin.html','/admin.js','/admin.css','/research-data.js','/gaze-visual.js','/eye-tracker.js','/theme.css','/gaze-math.js','/vendor/webgazer.js','/mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.wasm']){
 let status,headers,bytes;await handler({url:file,method:'GET',headers:{host:'localhost'}},{writeHead(code,value){status=code;headers=value},end(value){bytes=value}});
 assert.equal(status,200,file);assert.ok(bytes.length>0,file);
 if(file.endsWith('.wasm')){assert.equal(headers['Content-Type'],'application/wasm');assert.equal(bytes.subarray(0,4).toString('hex'),'0061736d');}
}
console.log('PASS local frontend, admin, eye-tracker script and WASM delivery');

const exclusion={sessionId:created.body.id,excluded:true,reason:'quality exclusion test'};
assert.equal((await request('/api/admin/exclusions','PUT',exclusion)).status,401);
assert.equal((await request('/api/admin/exclusions','PUT',exclusion,process.env.ADMIN_TOKEN)).status,200);
const excluded=await request('/api/admin','GET',undefined,process.env.ADMIN_TOKEN);
assert.equal(excluded.body.sessions[0].eye_excluded,1);
assert.equal(excluded.body.records.length,1,'excluding never deletes original records');
assert.equal(excluded.body.exclusionAudit.length,1);
assert.equal((await request('/api/admin/exclusions','PUT',{...exclusion,excluded:false,reason:'restored'},process.env.ADMIN_TOKEN)).status,200);
const restored=await request('/api/admin','GET',undefined,process.env.ADMIN_TOKEN);
assert.equal(restored.body.sessions[0].eye_excluded,0);assert.equal(restored.body.exclusionAudit.length,2);
const health=await request('/api/health');assert.equal(health.body.version,6);assert.ok(!JSON.stringify(health.body).includes(process.env.ADMIN_TOKEN));
console.log('PASS admin aliases, persistent-data health probe, exclusion authorization, reversible exclusion and audit history');
