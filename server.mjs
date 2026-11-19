import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot=process.env.RESEARCH_DATA_DIR||path.join(root,'data');
await mkdir(dataRoot,{recursive:true});
const database=new DatabaseSync(path.join(dataRoot,'research.sqlite'));
database.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token TEXT NOT NULL, mode TEXT NOT NULL, exposure INTEGER NOT NULL, created TEXT NOT NULL, completed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS records(session_id TEXT NOT NULL REFERENCES sessions(id), kind TEXT NOT NULL, record_key TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(session_id,kind,record_key));
CREATE TABLE IF NOT EXISTS eye_exclusions(session_id TEXT PRIMARY KEY REFERENCES sessions(id), excluded INTEGER NOT NULL, reason TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS eye_exclusion_audit(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, excluded INTEGER NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL);`);
async function persistedSecret(name){const filename=path.join(dataRoot,name);try{return (await readFile(filename,'utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;try{const value=randomBytes(24).toString('hex');await writeFile(filename,value,{flag:'wx',mode:0o600});return value;}catch(error){if(error.code==='EEXIST')return (await readFile(filename,'utf8')).trim();throw error;}}}
const adminToken = process.env.ADMIN_TOKEN || await persistedSecret('admin-key.txt');
const installationId = await persistedSecret('installation-id.txt');
function authorized(value, expected) {
  const first = Buffer.from(value || '');
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}
function send(response, status, body) {
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(body));
}
async function body(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 2_000_000) throw new Error('提交数据过大');
  }
  return JSON.parse(text);
}
export async function handler(request, response) {
  try {
    const url = new URL(request.url, 'http://localhost');
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if(url.pathname==='/api/health'&&request.method==='GET')return send(response,200,{ok:true,app:'first-impression-lab',version:6,installationId});
    if (request.method !== 'GET' && request.headers.origin && request.headers.origin !== `http://${request.headers.host}` && request.headers.origin !== `https://${request.headers.host}`) return send(response,403,{error:'来源无效'});
    if (url.pathname === '/api/sessions' && request.method === 'POST') {
      const input = await body(request);
      if (input.mode !== 'test') return send(response,409,{error:'中文版原始素材与预试参数尚待核查，当前开放测试模式'});
      const id = randomBytes(16).toString('hex');
      const secret = randomBytes(24).toString('hex');
      const counts = database.prepare('SELECT exposure, COUNT(*) AS count FROM sessions WHERE mode=? GROUP BY exposure').all('test');
      const totals = [2,5,10].map(exposure => ({exposure,count:Number(counts.find(row=>row.exposure===exposure)?.count || 0)}));
      const minimum = Math.min(...totals.map(group=>group.count));
      const available = totals.filter(group=>group.count===minimum);
      const exposure = available[randomInt(available.length)].exposure;
      database.prepare('INSERT INTO sessions(id,token,mode,exposure,created) VALUES(?,?,?,?,?)').run(id,secret,'test',exposure,new Date().toISOString());
      return send(response,201,{id,token:secret,exposure});
    }
    const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9]{32})$/);
    if (match && request.method === 'PUT') {
      const session = database.prepare('SELECT * FROM sessions WHERE id=?').get(match[1]);
      if (!session || !authorized(token,session.token)) return send(response,403,{error:'会话凭证无效'});
      const input = await body(request);
      if (!['trial','calibration','speed','complete'].includes(input.kind) || typeof input.key !== 'string' || input.key.length > 100 || !input.data || typeof input.data !== 'object') return send(response,400,{error:'记录格式无效'});
      const encoded = JSON.stringify(input.data);
      const prior = database.prepare('SELECT data FROM records WHERE session_id=? AND kind=? AND record_key=?').get(session.id,input.kind,input.key);
      if (prior && prior.data !== encoded) return send(response,409,{error:'记录已存在且内容不同'});
      database.exec('BEGIN IMMEDIATE');
      try {
        database.prepare('INSERT OR IGNORE INTO records VALUES(?,?,?,?,?)').run(session.id,input.kind,input.key,encoded,new Date().toISOString());
        if (input.kind === 'complete') database.prepare('UPDATE sessions SET completed=1 WHERE id=?').run(session.id);
        database.exec('COMMIT');
      } catch(error) { database.exec('ROLLBACK'); throw error; }
      return send(response,200,{saved:true});
    }
    if (url.pathname === '/api/admin/exclusions' && request.method==='PUT') {
      if(!authorized(token,adminToken))return send(response,401,{error:'管理口令无效'});
      const input=await body(request);
      if(typeof input.sessionId!=='string'||typeof input.excluded!=='boolean'||typeof input.reason!=='string'||input.reason.length>1000)return send(response,400,{error:'排除记录格式无效'});
      if(!database.prepare('SELECT id FROM sessions WHERE id=?').get(input.sessionId))return send(response,404,{error:'被试不存在'});
      const at=new Date().toISOString();
      database.exec('BEGIN IMMEDIATE');
      try{database.prepare('INSERT INTO eye_exclusions VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET excluded=excluded.excluded,reason=excluded.reason,updated=excluded.updated').run(input.sessionId,Number(input.excluded),input.reason,at);
        database.prepare('INSERT INTO eye_exclusion_audit(session_id,excluded,reason,created) VALUES(?,?,?,?)').run(input.sessionId,Number(input.excluded),input.reason,at);database.exec('COMMIT');
      }catch(error){database.exec('ROLLBACK');throw error;}
      return send(response,200,{saved:true,sessionId:input.sessionId,excluded:input.excluded,reason:input.reason,updated:at});
    }
    if (url.pathname === '/api/admin' && request.method==='GET') {
      if (!authorized(token,adminToken)) return send(response,401,{error:'管理口令无效'});
      return send(response,200,{
        sessions:database.prepare('SELECT s.id,s.mode,s.exposure,s.created,s.completed,COALESCE(e.excluded,0) AS eye_excluded,COALESCE(e.reason,\'\') AS exclusion_reason,e.updated AS exclusion_updated FROM sessions s LEFT JOIN eye_exclusions e ON e.session_id=s.id ORDER BY s.created DESC').all(),
        records:database.prepare('SELECT * FROM records ORDER BY created').all().map(row=>({...row,data:JSON.parse(row.data)})),
        exclusionAudit:database.prepare('SELECT * FROM eye_exclusion_audit ORDER BY created').all(),
        exportedAt:new Date().toISOString(),qualityThresholdPx:300
      });
    }
    if(url.pathname.startsWith('/api/')) return send(response,404,{error:'接口不存在'});
    const relative = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : decodeURIComponent(url.pathname.slice(1));
    const publicRoot = path.join(root,'public');
    const filename = path.resolve(publicRoot,relative);
    if (!filename.startsWith(publicRoot + path.sep)) return send(response,403,{error:'路径无效'});
    try {
      const data = await readFile(filename);
      const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.wasm':'application/wasm'};
      response.writeHead(200,{'Content-Type':types[path.extname(filename)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      response.end(data);
    } catch { send(response,404,{error:'文件不存在'}); }
  } catch(error) { send(response,400,{error:error.message || '请求失败'}); }
}
const server = http.createServer(handler);
function openBrowser(address){if(process.platform==='win32'&&!process.env.EYE_NO_OPEN){const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',address],{stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}}
function printAddresses(address){console.log('第一印象实验室 v6 · 300 px 首次验证 / 个人回顾 / 研究后台');console.log('实验页面 '+address);console.log('研究后台 '+address+'/admin');console.log('管理口令 '+adminToken);console.log('请保持运行服务的窗口打开。关闭网页不会停止服务；关闭启动窗口会停止服务。');console.log('再次打开后台：双击“打开研究后台.cmd”，将复用服务或自动启动。');}
async function launch(){
 const admin=process.argv.includes('--admin');const connectionFile=path.join(dataRoot,'connection.json');
 try{const previous=JSON.parse(await readFile(connectionFile,'utf8'));const target=new URL(previous.address);if(target.hostname==='127.0.0.1'&&target.protocol==='http:'){
  const check=await fetch(target.origin+'/api/health',{signal:AbortSignal.timeout(800)});const status=await check.json();
  if(status.ok&&status.version===6&&status.installationId===installationId){printAddresses(target.origin);openBrowser(target.origin+(admin?'/admin':''));return;}
 }}catch{}
 server.listen(Number(process.env.PORT||0),'127.0.0.1',async()=>{const address='http://127.0.0.1:'+server.address().port;try{await writeFile(connectionFile,JSON.stringify({address,version:6,startedAt:new Date().toISOString()}));}catch(error){console.error('无法保存启动地址：'+error.message);}printAddresses(address);openBrowser(address+(admin?'/admin':''));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await launch();
server.on('error',error=>{console.error('启动失败：'+error.message);process.exitCode=1;});
