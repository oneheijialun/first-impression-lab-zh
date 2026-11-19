const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const randomHex=bytes=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
function owner(request,env){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return !!id&&!!email&&!!env.ADMIN_OWNER_EMAIL&&email.toLowerCase()===env.ADMIN_OWNER_EMAIL.toLowerCase();}
async function readBody(request){if(Number(request.headers.get('content-length'))>2000000)throw Error('提交内容过大');const text=await request.text();if(text.length>2000000)throw Error('提交内容过大');return JSON.parse(text);}
export async function researchApi(request,env){
 try{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(method!=='GET'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'来源无效'},403);
  if(path==='/api/health')return json({ok:true,version:7,online:true});
  if(path==='/api/admin-auth')return json({mode:'chatgpt',authorized:owner(request,env),signIn:'/signin-with-chatgpt?return_to=%2Fadmin.html'});
  if(!env.DB)return json({error:'在线数据库尚未就绪'},503);
  const db=env.DB;
  if(path==='/api/sessions'&&method==='POST'){
   const input=await readBody(request);if(input.mode!=='test')return json({error:'当前仅开放预试'},409);
   const rows=await db.prepare('SELECT exposure,COUNT(*) AS count FROM sessions WHERE mode=? GROUP BY exposure').bind('test').all();
   const groups=[2,5,10].map(exposure=>({exposure,count:Number(rows.results.find(r=>r.exposure===exposure)?.count||0)}));
   const minimum=Math.min(...groups.map(r=>r.count)),available=groups.filter(r=>r.count===minimum);
   const exposure=available[crypto.getRandomValues(new Uint32Array(1))[0]%available.length].exposure;
   const id=randomHex(16),token=randomHex(24);
   await db.prepare('INSERT INTO sessions(id,token,mode,exposure,created,completed) VALUES(?,?,?,?,?,0)').bind(id,token,'test',exposure,new Date().toISOString()).run();
   return json({id,token,exposure},201);
  }
  const match=path.match(/^\/api\/sessions\/([a-f0-9]{32})$/);
  if(match&&method==='PUT'){
   const session=await db.prepare('SELECT id,token FROM sessions WHERE id=?').bind(match[1]).first();
   if(!session||!same(request.headers.get('authorization')?.replace(/^Bearer /,''),session.token))return json({error:'会话凭证无效'},403);
   const input=await readBody(request);
   if(!['trial','calibration','speed','complete'].includes(input.kind)||typeof input.key!=='string'||input.key.length>100||!input.data||typeof input.data!=='object')return json({error:'记录格式无效'},400);
   const encoded=JSON.stringify(input.data),at=new Date().toISOString();
   const prior=await db.prepare('SELECT data FROM records WHERE session_id=? AND kind=? AND record_key=?').bind(session.id,input.kind,input.key).first();
   if(prior&&prior.data!==encoded)return json({error:'记录已存在且内容不同'},409);
   const statements=[db.prepare('INSERT OR IGNORE INTO records(session_id,kind,record_key,data,created) VALUES(?,?,?,?,?)').bind(session.id,input.kind,input.key,encoded,at)];
   if(input.kind==='complete')statements.push(db.prepare('UPDATE sessions SET completed=1 WHERE id=?').bind(session.id));
   await db.batch(statements);
   // A concurrent conflicting retry cannot silently replace an existing record.
   const saved=await db.prepare('SELECT data FROM records WHERE session_id=? AND kind=? AND record_key=?').bind(session.id,input.kind,input.key).first();
   return saved.data===encoded?json({saved:true}):json({error:'记录冲突'},409);
  }
  if(path==='/api/admin'&&method==='GET'){
   if(!owner(request,env))return json({error:'请使用站点所有者的 ChatGPT 账号登录研究后台'},401);
   const [sessions,records,audit]=await db.batch([
    db.prepare("SELECT s.id,s.mode,s.exposure,s.created,s.completed,COALESCE(e.excluded,0) AS eye_excluded,COALESCE(e.reason,'') AS exclusion_reason,e.updated AS exclusion_updated FROM sessions s LEFT JOIN eye_exclusions e ON e.session_id=s.id ORDER BY s.created DESC"),
    db.prepare('SELECT * FROM records ORDER BY created'),db.prepare('SELECT * FROM eye_exclusion_audit ORDER BY created')]);
   return json({sessions:sessions.results,records:records.results.map(r=>({...r,data:JSON.parse(r.data)})),exclusionAudit:audit.results,exportedAt:new Date().toISOString(),qualityThresholdPx:500});
  }
  if(path==='/api/admin/exclusions'&&method==='PUT'){
   if(!owner(request,env))return json({error:'仅站点所有者可修改排除设置'},401);
   const input=await readBody(request);if(typeof input.sessionId!=='string'||typeof input.excluded!=='boolean'||typeof input.reason!=='string'||input.reason.length>1000)return json({error:'排除记录格式无效'},400);
   if(!await db.prepare('SELECT id FROM sessions WHERE id=?').bind(input.sessionId).first())return json({error:'被试不存在'},404);
   const at=new Date().toISOString();await db.batch([
    db.prepare('INSERT INTO eye_exclusions(session_id,excluded,reason,updated) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET excluded=excluded.excluded,reason=excluded.reason,updated=excluded.updated').bind(input.sessionId,Number(input.excluded),input.reason,at),
    db.prepare('INSERT INTO eye_exclusion_audit(session_id,excluded,reason,created) VALUES(?,?,?,?)').bind(input.sessionId,Number(input.excluded),input.reason,at)]);
   return json({saved:true});
  }
  return json({error:'接口不存在'},404);
 }catch(error){return json({error:error.message||'请求失败'},400);}
}
