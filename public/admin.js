'use strict';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=value=>Number.isFinite(value)?(100*value).toFixed(1)+'%':'—';
const seconds=value=>Number.isFinite(value)?(value/1000).toFixed(1)+' s':'—';
const elapsed=value=>Number.isFinite(value)?(value/60000).toFixed(1)+' 分钟':'—';
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'—';
let onlineAuth=false;
let dataset,manifest=[],people=[],selectedPerson='',drawVersion=0,playTimer;
const pictures=new Map();
const ratingLabels=['复杂 — 简单','不实用 — 实用','难以预料 — 容易预料','混乱 — 结构清晰','俗气 — 有格调','廉价 — 高档','缺乏想象 — 富有创意','乏味 — 引人入胜','难看 — 有吸引力','差 — 好'];
function ratingSummary(){const rows=ResearchData.trials(dataset);return ratingLabels.flatMap((label,index)=>[2,5,10].map(group=>{const ids=new Set(dataset.sessions.filter(s=>s.exposure===group).map(s=>s.id));const values=rows.filter(r=>ids.has(r.session_id)).map(r=>r.ratings?.[index]).filter(v=>Number.isFinite(v)&&v>=1&&v<=7);return {dimension:label,group_seconds:group,n:values.length,mean:ResearchData.average(values)};}));}
async function picture(id){if(!pictures.has(id)){const image=new Image();image.src='./stimuli/'+id+'.png';pictures.set(id,image.decode().then(()=>image).catch(error=>{pictures.delete(id);throw error;}));}return pictures.get(id);}
function message(text){$('#message').textContent=text||'';}
async function api(url,options={}){const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+$('#token').value,...options.headers},signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error||'请求失败');return data;}
async function load(){
 $('#refresh').disabled=true;message('');
 try{
   const next=await api('./api/admin');
   if(!manifest.length){const response=await fetch('./stimuli/manifest.json');if(!response.ok)throw Error('图片清单加载失败，请完整解压新版。');manifest=await response.json();}
   dataset=next;people=ResearchData.participants(dataset);sessionStorage.setItem('first-impression-admin-token',$('#token').value);
   $('#login-card').hidden=true;$('#panel').hidden=false;$('#refresh').hidden=false;$('#connection-state').textContent='已连接本机研究数据';$('#updated-at').textContent='更新于 '+date(dataset.exportedAt);
   renderOverview();renderRatings();renderParticipants();renderFilters();
   if(selectedPerson)await renderPerson(selectedPerson);
   await drawHeat();
 }catch(error){$('#connection-state').textContent='连接失败';message(onlineAuth?'在线后台连接失败：'+error.message:error.name==='TimeoutError'?'连接超时。请确认服务窗口仍在运行，或双击“打开研究后台.cmd”。':error.message+'；如服务已停止，请双击“打开研究后台.cmd”重新打开正确地址。');}
 finally{$('#refresh').disabled=false;}
}
function renderOverview(){
 const groups=ResearchData.groups(dataset),rows=ResearchData.trials(dataset),eyeRows=rows.filter(r=>ResearchData.eligible(r)&&!dataset.sessions.find(s=>s.id===r.session_id)?.eye_excluded);
 const samples=eyeRows.flatMap(r=>r.gaze||[]),valid=samples.filter(r=>r.valid&&Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.x>=0&&r.x<=1&&r.y>=0&&r.y<=1).length;
 const eyePeople=new Set(eyeRows.filter(r=>GazeMath.summarize(r.gaze||[],r.actualMs).effectiveMs>0).map(r=>r.session_id));
 const metrics=[['已开始测试',people.length,'匿名会话总数'],['已完成测试',people.filter(r=>r.completed).length,'完成率 '+pct(people.length?people.filter(r=>r.completed).length/people.length:null)],['可用眼动被试',eyePeople.size,'手动排除 '+people.filter(r=>r.eye_excluded).length+' 人'],['眼动有效采样率',pct(samples.length?valid/samples.length:null),'符合质量条件且未手动排除的试次']];
 $('#metrics').innerHTML=metrics.map(([label,value,note])=>`<article class="metric"><span>${label}</span><b>${value}</b><small>${note}</small></article>`).join('');
 $('#group-rows').innerHTML=groups.map(g=>`<tr><td><b>${g.seconds} 秒</b></td><td>${g.enrolled} / ${g.completed}</td><td>${g.eyeParticipants}</td><td>${g.eyeTrials}</td><td>${pct(g.purposeAccuracy)}</td><td>${pct(g.brandAccuracy)}</td><td>${elapsed(g.medianDurationMs)}</td><td>${seconds(g.medianAnswerMs)}</td><td>${g.interruptedTrials}</td></tr>`).join('');
 const sessions=new Map(dataset.sessions.map(s=>[s.id,s]));
 $('#image-summary').innerHTML=manifest.filter(m=>m.complexity!=='practice').flatMap(m=>[2,5,10].map(group=>{
  const t=rows.filter(r=>r.stimulus===m.id&&sessions.get(r.session_id)?.exposure===group),samples=t.filter(r=>r.camera).flatMap(r=>r.gaze||[]);
  return `<tr><td>${esc(m.sourceFile)}</td><td>${group} 秒</td><td>${t.length}</td><td>${pct(ResearchData.average(t.map(r=>r.purposeScore).filter(Number.isFinite)))}</td><td>${pct(ResearchData.average(t.map(r=>r.brandScore).filter(Number.isFinite)))}</td><td>${pct(t.length?t.filter(r=>r.familiar).length/t.length:null)}</td><td>${seconds(ResearchData.median(t.map(r=>r.answerDurationMs)))}</td><td>${pct(samples.length?samples.filter(r=>r.valid).length/samples.length:null)}</td></tr>`;
 })).join('');
}
function renderRatings(){const rows=ratingSummary();$('#ratings-summary').innerHTML=ratingLabels.map(label=>'<tr><td>'+label+'</td>'+[2,5,10].map(group=>{const r=rows.find(r=>r.dimension===label&&r.group_seconds===group);return '<td>'+(r.n?r.mean.toFixed(2)+' / '+r.n:'— / 0')+'</td>';}).join('')+'</tr>').join('');}
function renderParticipants(){
 const search=$('#participant-search').value.trim().toLowerCase();
 $('#participant-rows').innerHTML=people.filter(p=>p.id.toLowerCase().includes(search)).map(p=>`<tr data-person="${p.id}" class="${p.eye_excluded?'excluded':''}"><td><code>${p.id}</code><small>${p.eye_excluded?'已从眼动汇总排除':p.camera?'摄像头眼动':'无眼动记录'}</small></td><td>${date(p.startedAt)}<small>服务器建档 ${date(p.created)}</small></td><td>${date(p.completedAt)}<small>${elapsed(p.durationMs)}</small></td><td>${p.exposure} 秒 · ${p.completed?'已完成':'进行中'}<small>正式图 ${p.trialCount} / 6</small></td><td>${Number.isFinite(p.meanErrorPx)?p.meanErrorPx.toFixed(1)+' px':'—'}<small>中断 ${p.interruptedTrials} 次</small></td><td>${pct(p.validRate)}</td><td><label><input type="checkbox" class="include-eye" ${p.eye_excluded?'':'checked'}>纳入眼动</label><input class="reason-input" maxlength="1000" placeholder="可填写排除 / 恢复原因" value="${esc(p.exclusion_reason)}"><button class="secondary" data-save-person="${p.id}">保存设置</button></td><td><button class="secondary" data-detail-person="${p.id}">查看明细</button></td></tr>`).join('')||'<tr><td colspan="8">暂无匹配被试。</td></tr>';
}
async function saveExclusion(id,button){const row=button.closest('tr'),excluded=!row.querySelector('.include-eye').checked,reason=row.querySelector('.reason-input').value.trim();button.disabled=true;
 try{await api('./api/admin/exclusions',{method:'PUT',body:JSON.stringify({sessionId:id,excluded,reason})});await load();message('已保存眼动纳入设置，原始数据未删除。');}catch(error){message(error.message);button.disabled=false;}
}
async function renderPerson(id){
 selectedPerson=id;const person=people.find(p=>p.id===id);if(!person)return;
 const rows=ResearchData.trials(dataset).filter(r=>r.session_id===id).sort((a,b)=>a.trialIndex-b.trialIndex),quality=dataset.records.filter(r=>r.session_id===id&&r.kind==='calibration'&&r.record_key.startsWith('validation-'));
 const detail=$('#person-detail');detail.hidden=false;
 detail.innerHTML=`<p class="eyebrow">PARTICIPANT DETAIL</p><h3>匿名编号 ${esc(id)}</h3><div class="person-metrics"><span>${person.exposure} 秒组</span><span>开始 ${date(person.startedAt)}</span><span>结束 ${date(person.completedAt)}</span><span>总时长 ${elapsed(person.durationMs)}</span><span>符号任务 ${person.speedCorrect??'—'} / ${person.speedAttempted??'—'} 正确</span></div><h3>逐图作答与时间</h3><div class="table-scroll"><table><thead><tr><th>图片 / 呈现时间</th><th>用途答案 / 评分</th><th>品牌答案 / 评分</th><th>十项评分</th><th>答题时间</th><th>眼动质量</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.stimulusSourceFile||r.stimulus)}<small>${date(r.startedAt)} 至 ${date(r.endedAt)}</small><small>计划 ${seconds(r.plannedMs)} / 实际 ${seconds(r.actualMs)}</small></td><td>${esc(r.purpose)}<small>${r.purposeScore===1?'正确':r.purposeScore===0?'错误':'未评分'}</small></td><td>${esc(r.brand)||'（未填写）'}<small>${r.brandScore===1?'正确':r.brandScore===0?'错误':'未评分'}</small></td><td>${esc((r.ratings||[]).join(' / '))}<small>熟悉：${r.familiar?'是':'否'}</small></td><td>${seconds(r.answerDurationMs)}<small>提交 ${date(r.submittedAt||r.savedAt)}</small></td><td>${pct((r.totalSamples||r.gaze?.length)?(r.validSamples??(r.gaze||[]).filter(p=>p.valid).length)/(r.totalSamples||r.gaze.length):null)} 有效<small>误差 ${Number.isFinite(r.calibrationErrorPx)?r.calibrationErrorPx.toFixed(1)+' px':'—'}${r.interrupted?' · 中断':''}</small></td></tr>`).join('')||'<tr><td colspan="6">暂未提交正式图片作答。</td></tr>'}</tbody></table></div><p class="caption">十项评分依次为：复杂—简单、不实用—实用、难以预料—容易预料、混乱—结构清晰、俗气—有格调、廉价—高档、缺乏想象—富有创意、乏味—引人入胜、难看—有吸引力、差—好（每项 1–7，保持问卷原始方向）。</p><h3>个人六张视线图</h3><div class="personal-grid" id="person-map-grid"></div><details><summary>校准与验证历史（${quality.length} 次）</summary><pre id="quality-detail"></pre></details><details><summary>本人的完整原始记录</summary><pre id="record-detail"></pre></details>`;
 $('#quality-detail').textContent=JSON.stringify(quality.map(r=>({savedAt:r.created,...r.data})),null,2);$('#record-detail').textContent=JSON.stringify(dataset.records.filter(r=>r.session_id===id),null,2);
 const grid=$('#person-map-grid');
 for(let i=0;i<6;i++){
  const row=rows[i],card=document.createElement('article');card.className='map-card';card.innerHTML=`<h3>第 ${i+1} 张</h3><canvas></canvas><p></p>`;grid.append(card);if(!row){card.querySelector('p').textContent='该试次尚未提交。';continue;}
  try{const image=await picture(row.stimulus);if(selectedPerson!==id)return;const summary=GazeMath.summarize(row.gaze||[],row.actualMs);GazeVisual.draw(card.querySelector('canvas'),image,{points:summary.points});card.querySelector('p').textContent=(row.stimulusSourceFile||row.stimulus)+' · '+(summary.effectiveMs?`有效估计停留 ${seconds(summary.effectiveMs)}`:'暂无有效眼动，显示原图')+(person.eye_excluded?' · 已排除汇总':'');}catch(error){card.querySelector('p').textContent=error.message;}
 }
}
function renderFilters(){
 const image=$('#heat-stimulus'),person=$('#heat-participant'),oldImage=image.value,oldPerson=person.value;
 image.replaceChildren();for(const row of manifest.filter(r=>r.complexity!=='practice'))image.append(new Option(row.sourceFile,row.id));if([...image.options].some(o=>o.value===oldImage))image.value=oldImage;
 person.replaceChildren(new Option('全部被试（等权汇总）',''));for(const p of people)person.append(new Option(p.id.slice(0,12)+' · '+p.exposure+'s'+(p.eye_excluded?' · 已排除':''),p.id));if(people.some(p=>p.id===oldPerson))person.value=oldPerson;
 $('#heat-path').disabled=!person.value;if(!person.value)$('#heat-path').checked=false;
}
function heatOptions(progress=true){return {stimulus:$('#heat-stimulus').value,participant:$('#heat-participant').value,seconds:$('#heat-time').value,qualityOnly:$('#heat-quality').checked,threshold:500,includeExcluded:$('#heat-include-excluded').checked,progress:progress?Number($('#heat-timeline').value)/100:1};}
async function drawHeat(){
 if(!dataset||!$('#heat-stimulus').value)return;
 const version=++drawVersion,options=heatOptions(),result=ResearchData.aggregate(dataset,options);$('#heat-progress').textContent=Math.round(options.progress*100)+'%';
 try{const image=await picture(options.stimulus);if(version!==drawVersion)return;
  GazeVisual.draw($('#heat-canvas'),image,result,{paths:!!options.participant&&$('#heat-path').checked});
  $('#heat-summary').textContent=result.used?`${result.used} 人纳入本图 · 有效采样 ${result.valid} / ${result.total}（${pct(result.total?result.valid/result.total:null)}） · 累计图片内估计停留 ${seconds(result.effectiveMs)} · 当前候选 ${result.candidates} 人，其中手动排除标记 ${result.excluded} 人。`:'当前筛选暂无可用眼动；显示原图。可检查是否启用摄像头、校准质量、分组及排除设置。';
  $('#heat-region-shares').innerHTML=GazeMath.labels.map((label,i)=>`<div>${label}<strong>${result.used?pct(result.shares[i]):'—'}</strong></div>`).join('');
  const groups=$('#group-maps');groups.replaceChildren();
  for(const seconds of [2,5,10]){const data=ResearchData.aggregate(dataset,{...options,participant:'',seconds}),card=document.createElement('article');card.className='map-card';card.innerHTML=`<h3>${seconds} 秒组</h3><canvas></canvas><p>${data.used} 人 · ${data.valid} 有效采样 · ${data.used?'按人等权叠加':'暂无有效眼动，显示原图'}</p>`;groups.append(card);GazeVisual.draw(card.querySelector('canvas'),image,data);const button=document.createElement('button');button.className='secondary';button.textContent='保存本组图';button.onclick=()=>GazeVisual.png(card.querySelector('canvas'),`${options.stimulus}-${seconds}s.png`);card.append(button);}
 }catch(error){$('#heat-summary').textContent='图片显示失败：'+error.message;}
}
function download(name,content,type){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([content],{type}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
function csv(name,rows){const columns=[...new Set(rows.flatMap(Object.keys))];const cell=value=>{let text=typeof value==='object'?JSON.stringify(value):String(value??'');if(/^[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};download(name,'\ufeff'+[columns.map(cell).join(','),...rows.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n'),'text/csv;charset=utf-8');}
function gazeRows(rows){return rows.flatMap(row=>(row.gaze||[]).map(point=>({session_id:row.session_id,trial:row.record_key,stimulus:row.stimulus,group_seconds:dataset.sessions.find(s=>s.id===row.session_id)?.exposure,eye_excluded:!!dataset.sessions.find(s=>s.id===row.session_id)?.eye_excluded,trial_started_at:row.startedAt,...point})));}
$('#login').onsubmit=event=>{event.preventDefault();void load();};$('#refresh').onclick=load;$('#participant-search').oninput=renderParticipants;
$('#participant-rows').onclick=event=>{const save=event.target.closest('[data-save-person]'),detail=event.target.closest('[data-detail-person]');if(save)void saveExclusion(save.dataset.savePerson,save);else if(detail)void renderPerson(detail.dataset.detailPerson).then(()=>$('#person-detail').scrollIntoView({behavior:'smooth',block:'start'}));};
for(const id of ['heat-stimulus','heat-participant','heat-time','heat-quality','heat-include-excluded','heat-path'])$('#'+id).onchange=()=>{$('#heat-path').disabled=!$('#heat-participant').value;if(!$('#heat-participant').value)$('#heat-path').checked=false;$('#heat-timeline').value=100;void drawHeat();};
$('#heat-timeline').oninput=()=>void drawHeat();
$('#heat-play').onclick=()=>{if(playTimer){clearInterval(playTimer);playTimer=null;$('#heat-play').textContent='播放回放';return;}if(Number($('#heat-timeline').value)>=100)$('#heat-timeline').value=0;$('#heat-play').textContent='暂停回放';playTimer=setInterval(()=>{$('#heat-timeline').value=Math.min(100,Number($('#heat-timeline').value)+2);void drawHeat();if(Number($('#heat-timeline').value)>=100){clearInterval(playTimer);playTimer=null;$('#heat-play').textContent='播放回放';}},150);};
$('#heat-export').onclick=()=>GazeVisual.png($('#heat-canvas'),$('#heat-stimulus').value+'-gaze.png');
$('#export-json').onclick=()=>download('research-all.json',JSON.stringify(dataset,null,2),'application/json');
$('#export-people').onclick=()=>csv('participants-and-times.csv',people);
$('#export-trials').onclick=()=>csv('answers-and-trials.csv',ResearchData.trials(dataset).map(({gaze,eyeQuality,...row})=>({...row,quality:eyeQuality})));
$('#export-gaze').onclick=()=>csv('all-raw-gaze.csv',gazeRows(ResearchData.trials(dataset)));
$('#export-current-gaze').onclick=()=>{const o=heatOptions(false),sessions=new Map(dataset.sessions.map(s=>[s.id,s]));const rows=ResearchData.trials(dataset).filter(r=>r.stimulus===o.stimulus&&(!o.participant||r.session_id===o.participant)&&(!o.seconds||sessions.get(r.session_id)?.exposure===Number(o.seconds))&&(o.includeExcluded||!sessions.get(r.session_id)?.eye_excluded)&&(!o.qualityOnly||ResearchData.eligible(r))&&r.camera&&!r.interrupted);csv('filtered-gaze-full-duration.csv',gazeRows(rows));};
$('#export-quality').onclick=()=>csv('quality-and-symbol-task.csv',dataset.records.filter(r=>['calibration','speed'].includes(r.kind)).map(r=>({session_id:r.session_id,kind:r.kind,key:r.record_key,savedAt:r.created,...r.data})));
$('#export-ratings').onclick=()=>csv('group-item-ratings.csv',ratingSummary());
$('#export-summary').onclick=()=>csv('image-group-distributions.csv',manifest.filter(m=>m.complexity!=='practice').flatMap(m=>[2,5,10].map(seconds=>{const a=ResearchData.aggregate(dataset,{stimulus:m.id,seconds,qualityOnly:true,threshold:500});return {stimulus:m.id,group_seconds:seconds,participants:a.used,valid_samples:a.valid,total_samples:a.total,estimated_ms:a.effectiveMs,...Object.fromEntries(GazeMath.labels.map((label,i)=>[label,a.used?a.shares[i]:null]))};})));
$('#token').value=sessionStorage.getItem('first-impression-admin-token')||'';
async function initializeAdminAuth(){
 try{const response=await fetch('./api/admin-auth');if(response.ok){const auth=await response.json();if(auth.mode==='chatgpt'){onlineAuth=true;$('#login').hidden=true;$('#local-help').hidden=true;$('#online-login').hidden=false;$('#connection-state').textContent='在线研究数据库';if(auth.authorized)await load();return;}}}catch{}
 if($('#token').value)void load();
}
void initializeAdminAuth();
