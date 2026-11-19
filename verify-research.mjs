import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context=vm.createContext({window:{}});
for(const name of ['gaze-math.js','research-data.js'])vm.runInContext(fs.readFileSync(new URL('./public/'+name,import.meta.url),'utf8'),context);
const R=context.window.ResearchData;
const session=(id,exposure,excluded=0)=>({id,exposure,eye_excluded:excluded,created:'2026-11-19T09:00:00Z',completed:1});
const record=(id,points,error=100,extra={})=>({session_id:id,kind:'trial',record_key:'0',created:'2026-11-19T09:01:00Z',data:{stimulus:'test',practice:false,camera:true,calibrationErrorPx:error,eyeQuality:{complete:true},actualMs:1000,plannedMs:1000,purposeScore:1,brandScore:0,answerDurationMs:2000,gaze:points,...extra}});
const sample=(x,y,t)=>({x,y,t,valid:true});
const dataset={sessions:[session('a',2),session('b',5),session('c',10),session('d',2,1),session('e',10)],records:[
record('a',[sample(.1,.1,0),sample(.1,.1,100)]),record('b',Array.from({length:10},(_,i)=>sample(.9,.9,i*100))),record('c',[sample(.5,.5,0)],500),record('d',[sample(.5,.5,0)]),record('e',[]),
{session_id:'a',kind:'trial',record_key:'practice',data:{practice:true,gaze:[sample(.5,.5,0)]}},
{session_id:'a',kind:'complete',created:'2026-11-19T09:10:00Z',data:{completedAt:'2026-11-19T09:10:00Z',totalDurationMs:600000}}
]};
assert.equal(R.trials(dataset).length,5);
const all=R.aggregate(dataset,{stimulus:'test',qualityOnly:true});
assert.equal(all.used,2);assert.equal(all.shares[0],.5);assert.equal(all.shares[8],.5,'different sampling volumes must not change participant weight');
assert.equal(R.aggregate(dataset,{stimulus:'test',qualityOnly:true,seconds:2}).used,1);
assert.equal(R.aggregate(dataset,{stimulus:'test',qualityOnly:true,includeExcluded:true}).used,3);
assert.equal(R.aggregate(dataset,{stimulus:'test',qualityOnly:false}).used,3);
assert.equal(R.aggregate(dataset,{stimulus:'test',qualityOnly:true,participant:'d'}).used,0);
assert.equal(R.eligible(dataset.records[2].data),false,'500 px is not strictly below the threshold');
const groups=R.groups(dataset);assert.equal(groups.find(g=>g.seconds===10).eyeTrials,0,'empty or failed eye data is not counted as usable');
assert.equal(R.participants(dataset).find(p=>p.id==='a').durationMs,600000);
assert.equal(R.participants(dataset).find(p=>p.id==='b').durationMs,null,'unknown completion time is missing, not zero');
assert.equal(R.aggregate(dataset,{stimulus:'unknown',qualityOnly:true}).used,0);
assert.equal(R.aggregate(dataset,{stimulus:'test',qualityOnly:true,progress:0}).effectiveMs,0);
console.log('PASS 500 px boundary, missing data, equal participant weighting, 2/5/10 groups, reversible exclusions, practice separation, time summaries and timeline filtering');
