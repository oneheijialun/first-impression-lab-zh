import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=await mkdtemp(path.join(tmpdir(),'impression-launch-'));
const children=[];
function launch(admin=false){
 const child=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url)),...(admin?['--admin']:[])],{env:{...process.env,RESEARCH_DATA_DIR:directory,EYE_NO_OPEN:'1',ADMIN_TOKEN:''},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);
 return new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Service launch timed out')),8000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match&&output.includes('管理口令')){clearTimeout(timer);resolve({child,address:match[0]});}});child.on('error',reject);child.on('exit',code=>{if(!output.includes('管理口令')){clearTimeout(timer);reject(Error('Service exited '+code));}});});
}
try{
 const first=await launch();
 const health=await (await fetch(first.address+'/api/health')).json();assert.equal(health.version,6);
 for(const route of ['/admin','/admin.html','/admin.js','/admin.css'])assert.equal((await fetch(first.address+route)).status,200,route);
 const key=await readFile(path.join(directory,'admin-key.txt'),'utf8');
 assert.equal((await fetch(first.address+'/api/admin',{headers:{Authorization:'Bearer '+key}})).status,200);
 const second=await launch(true);assert.equal(second.address,first.address,'admin launcher must reuse an active service');
 await new Promise(resolve=>{first.child.once('exit',resolve);first.child.kill();});
 const restarted=await launch(true);assert.equal(await readFile(path.join(directory,'admin-key.txt'),'utf8'),key,'restarting must preserve the management key');
 assert.equal((await (await fetch(restarted.address+'/api/health')).json()).installationId,health.installationId);
 console.log('PASS live HTTP admin routes, active-service reuse, stopped-service recovery and persistent management key');
}catch(error){
 if(error.cause?.code==='EACCES'||error.code==='EACCES'){console.log('SKIP live HTTP launcher: execution environment denies loopback networking');}
 else throw error;
}finally{for(const child of children)if(child.exitCode===null)child.kill();}
