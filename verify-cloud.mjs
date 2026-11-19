import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {researchApi} from './worker/research-api.mjs';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('./drizzle/0000_violet_blindfold.sql',import.meta.url),'utf8'));
const adapter={prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};return stmt;},async batch(statements){db.exec('BEGIN');try{const values=[];for(const statement of statements){try{values.push(await statement.all());}catch{values.push(await statement.run());}}db.exec('COMMIT');return values;}catch(error){db.exec('ROLLBACK');throw error;}}};
const env={DB:adapter,ADMIN_OWNER_EMAIL:'owner@example.test'};
async function call(path,{method='GET',body,token,owner=false,intruder=false,origin}={}){const headers={'content-type':'application/json'};if(token)headers.authorization='Bearer '+token;if(owner||intruder){headers['oai-authenticated-user-id']='scoped-user';headers['oai-authenticated-user-email']=owner?env.ADMIN_OWNER_EMAIL:'other@example.test';}if(origin)headers.origin=origin;const response=await researchApi(new Request('https://test.example'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);return {status:response.status,data:await response.json()};}
const sessions=[];for(let i=0;i<3;i++){const r=await call('/api/sessions',{method:'POST',body:{mode:'test'}});assert.equal(r.status,201);sessions.push(r.data);}
assert.deepEqual(sessions.map(s=>s.exposure).sort((a,b)=>a-b),[2,5,10]);
const s=sessions[0],route='/api/sessions/'+s.id,record={kind:'trial',key:'0',data:{gaze:[],camera:true,calibrationErrorPx:490}};
assert.equal((await call(route,{method:'PUT',body:record,token:'wrong'})).status,403);
assert.equal((await call(route,{method:'PUT',body:record,token:s.token})).status,200);
assert.equal((await call(route,{method:'PUT',body:record,token:s.token})).status,200);
assert.equal((await call(route,{method:'PUT',body:{...record,data:{changed:true}},token:s.token})).status,409);
assert.equal((await call('/api/admin')).status,401);assert.equal((await call('/api/admin',{intruder:true})).status,401);
const admin=await call('/api/admin',{owner:true});assert.equal(admin.status,200);assert.equal(admin.data.records.length,1);assert.ok(!JSON.stringify(admin.data.sessions).includes(s.token));assert.equal(admin.data.qualityThresholdPx,500);
const exclusion={sessionId:s.id,excluded:true,reason:'test'};
assert.equal((await call('/api/admin/exclusions',{method:'PUT',body:exclusion})).status,401);
assert.equal((await call('/api/admin/exclusions',{method:'PUT',body:exclusion,owner:true})).status,200);
const excluded=await call('/api/admin',{owner:true});assert.equal(excluded.data.sessions.find(p=>p.id===s.id).eye_excluded,1);assert.equal(excluded.data.records.length,1);assert.equal(excluded.data.exclusionAudit.length,1);
assert.equal((await call('/api/sessions',{method:'POST',origin:'https://other.example',body:{mode:'test'}})).status,403);
console.log('PASS online session assignment, per-session authorization, idempotent persistence, conflict prevention, owner-only admin, reversible exclusions and 500 px metadata');
