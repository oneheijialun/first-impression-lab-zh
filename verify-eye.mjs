import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
// Math source is UMD, evaluated independently of the package's ESM setting.
const mathContext=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(new URL('./public/gaze-math.js',import.meta.url),'utf8'),mathContext);
const nodes=new Map(),calls=[];let now=1000,stopped=0;
function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,dataset:{},disabled:false,children:[],append(...children){this.children.push(...children);},addEventListener(){},getBoundingClientRect(){return {left:100,top:50,x:100,y:50,width:800,height:500};}});return nodes.get(id);}
const gaze={getTracker:()=>({getPositions:()=>[1]}),resume:async()=>{},pause(){calls.push(['pause']);},clearGazeListener(){},end(){},recordScreenPosition(){calls.push(['train']);}};
for(const method of ['showVideoPreview','showVideo','showFaceOverlay','showFaceFeedbackBox','showPredictionPoints'])gaze[method]=value=>calls.push([method,value]);
let context;
const window={addEventListener(){},scrollTo(){},getSelection:()=>({removeAllRanges(){calls.push(['clearSelection']);}}),webgazer:gaze};
context=vm.createContext({window,webgazer:gaze,document:{createElement:tag=>node('created-'+tag+'-'+Math.random()),body:{dataset:{}},getElementById(id){if(id==='webgazerVideoFeed')return {srcObject:{getTracks:()=>[{stop(){stopped++;}}]}};return node(id);},querySelector(selector){return node(selector);},addEventListener(){},removeEventListener(){}},
localStorage:{getItem:()=>null,setItem(){}},location:{protocol:'http:'},innerWidth:1000,innerHeight:800,devicePixelRatio:1,performance:{now:()=>now},crypto:webcrypto,
Image:class{},URL,Blob,console,setTimeout:callback=>{callback();return 1;},clearTimeout(){},cancelAnimationFrame(){},requestAnimationFrame(callback){now+=500;vm.runInContext('if(S.stage==="stimulus")Eye.sample({x:500,y:300})',context);callback(now);return 1;},GazeVisual:{draw(){calls.push(['personalHeat']);},png(){}},GazeMath:mathContext.window.GazeMath});
vm.runInContext(fs.readFileSync(new URL('./public/eye-tracker.js',import.meta.url),'utf8'),context);
context.ExperimentEye=window.ExperimentEye;
vm.runInContext(fs.readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),context);
vm.runInContext("S.camera=true;S.local=true;S.session={id:'test',exposure:2};S.stage='ready';S.calibration={complete:true,passed:true,meanErrorPx:50};S.meanError=50;Eye.viewport={width:1000,height:800,dpr:1};Eye.started=true;assets[names[6]]={naturalWidth:1600,naturalHeight:1000};",context);
await vm.runInContext('present()',context);
assert.equal(vm.runInContext('S.stage',context),'questions');
assert.ok(vm.runInContext('S.gaze.length',context)>0);
assert.equal(vm.runInContext('S.gaze[0].x',context),.5);
assert.equal(vm.runInContext('S.gaze[0].y',context),.5);
assert.equal(vm.runInContext('S.trial.gazeSummary.strongest',context),4);
assert.equal(vm.runInContext('S.trial.eyeQuality.meanErrorPx',context),50);
assert.equal(vm.runInContext('Eye.phase',context),'ready');
assert.ok(calls.some(([name])=>name==='pause'));
for(const method of ['showVideoPreview','showVideo','showFaceOverlay','showFaceFeedbackBox','showPredictionPoints'])assert.ok(calls.some(([name,value])=>name===method&&value===false),method);
const rows=vm.runInContext('Eye.rows.length',context);vm.runInContext('Eye.sample({x:500,y:300})',context);assert.equal(vm.runInContext('Eye.rows.length',context),rows,'questions must not be recorded');
vm.runInContext("Eye.viewport.width=900;S.stage='ready'",context);await vm.runInContext('present()',context);assert.equal(vm.runInContext('S.stage',context),'viewportChanged','resized window requires an explicit recovery');
for(const quality of [{complete:true,meanErrorPx:500},{complete:true,meanErrorPx:501},{complete:false,meanErrorPx:50},{complete:true,meanErrorPx:null}]){
 context.testQuality=quality;vm.runInContext("S.stage='ready';S.calibration=testQuality",context);await vm.runInContext('present()',context);assert.equal(vm.runInContext('S.stage',context),'qualityFailed');
}
assert.equal(context.ExperimentEye.accepts({complete:true,meanErrorPx:499.9}),true);
assert.equal(context.ExperimentEye.accepts({complete:true,meanErrorPx:500}),false);
vm.runInContext("S.calibration={complete:true,passed:true,meanErrorPx:50};Eye.viewport.width=1000;S.index=0;S.order=[0];assets[names[0]]={naturalWidth:1600,naturalHeight:1000};go('ready')",context);
assert.ok(!node('app').innerHTML.includes('重新校准'),'no per-image validation button');
await vm.runInContext('present()',context);assert.equal(vm.runInContext('S.stage',context),'questions');
assert.equal(calls.filter(([name])=>name==='personalHeat').length,0,'no heatmaps while collecting answers');
vm.runInContext("S.ownTrials=names.slice(0,6).map(stimulus=>({stimulus,actualMs:100,camera:true,gaze:[{x:.5,y:.5,t:0,valid:true}]}));for(const name of names)assets[name]={naturalWidth:1600,naturalHeight:1000};go('done')",context);
assert.equal(calls.filter(([name])=>name==='personalHeat').length,6,'end shows exactly six own heatmaps');
vm.runInContext('Eye.stop()',context);assert.ok(stopped>0);
const source=fs.readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
assert.ok(!source.includes('https://webgazer.cs.brown.edu'));
assert.ok(source.includes('不录制、不保存、不上传'));
assert.ok(source.includes('draggable="false"'));
console.log('PASS integrated exposure, per-image normalized coordinates, nine-grid summary, quality metadata, hidden camera overlays, capture stops between trials, viewport recalibration gate and media track release');
