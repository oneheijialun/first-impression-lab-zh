(function(root){
  'use strict';
  const finite=Number.isFinite;
  const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const median=values=>{const a=values.filter(finite).sort((a,b)=>a-b);return a.length?(a[Math.floor(a.length/2)]+a[Math.ceil(a.length/2)-1])/2:null;};
  function trials(dataset){return dataset.records.filter(r=>r.kind==='trial'&&!r.data.practice&&r.record_key!=='practice').map(r=>({...r.data,session_id:r.session_id,record_key:r.record_key,savedAt:r.created}));}
  function participants(dataset){return dataset.sessions.map(session=>{
    const records=dataset.records.filter(r=>r.session_id===session.id),rows=trials({records,sessions:[]});
    const complete=records.find(r=>r.kind==='complete'),consent=records.find(r=>r.kind==='calibration'&&r.record_key==='consent');
    const speed=records.find(r=>r.kind==='speed');
    const start=consent?.data.startedAt||session.created,end=complete?.data.completedAt||complete?.created||null;
    const duration=complete?.data.totalDurationMs??(end?Date.parse(end)-Date.parse(start):null);
    const samples=rows.flatMap(r=>r.gaze||[]),errors=rows.map(r=>r.calibrationErrorPx).filter(finite);
    return {...session,startedAt:start,completedAt:end,durationMs:duration,trialCount:rows.length,camera:rows.some(r=>r.camera),meanErrorPx:average(errors),validRate:samples.length?samples.filter(r=>r.valid&&finite(r.x)&&finite(r.y)&&r.x>=0&&r.x<=1&&r.y>=0&&r.y<=1).length/samples.length:null,
      purposeAccuracy:average(rows.map(r=>r.purposeScore).filter(finite)),brandAccuracy:average(rows.map(r=>r.brandScore).filter(finite)),interruptedTrials:rows.filter(r=>r.interrupted).length,medianAnswerMs:median(rows.map(r=>r.answerDurationMs)),speedCorrect:speed?.data.correct??null,speedAttempted:speed?.data.responses?.length??null};
  });}
  function eligible(row,threshold=500){return row.camera&&!row.interrupted&&finite(row.calibrationErrorPx)&&row.calibrationErrorPx<threshold&&row.eyeQuality?.complete!==false;}
  function aggregate(dataset,options={}){
    const excluded=new Set(dataset.sessions.filter(s=>s.eye_excluded).map(s=>s.id));
    const sessions=new Map(dataset.sessions.map(s=>[s.id,s]));
    const candidates=trials(dataset).filter(row=>(!options.stimulus||row.stimulus===options.stimulus)&&(!options.participant||row.session_id===options.participant)&&(!options.seconds||sessions.get(row.session_id)?.exposure===Number(options.seconds)));
    const rows=candidates.filter(row=>(options.includeExcluded||!excluded.has(row.session_id))&&(!options.qualityOnly||eligible(row,options.threshold??500))&&row.camera&&!row.interrupted);
    const points=[],shares=Array(9).fill(0),paths=[];let valid=0,total=0,effectiveMs=0,used=0;
    for(const row of rows){
      const duration=row.actualMs*(options.progress??1);const samples=(row.gaze||[]).filter(p=>p.t<=duration);
      const summary=root.GazeMath.summarize(samples,duration);valid+=summary.valid;total+=summary.total;
      if(!summary.effectiveMs)continue;
      used++;effectiveMs+=summary.effectiveMs;
      summary.shares.forEach((v,i)=>shares[i]+=v);
      points.push(...summary.points.map(p=>({...p,weight:p.weight/summary.effectiveMs})));
      paths.push(samples);
    }
    return {points,shares:shares.map(v=>used?v/used:0),paths,used,valid,total,effectiveMs,candidates:candidates.length,excluded:candidates.filter(r=>excluded.has(r.session_id)).length};
  }
  function groups(dataset){const people=participants(dataset),rows=trials(dataset);return [2,5,10].map(seconds=>{
    const p=people.filter(r=>r.exposure===seconds),ids=new Set(p.map(r=>r.id)),t=rows.filter(r=>ids.has(r.session_id));
    const eye=t.filter(r=>eligible(r)&&!p.find(s=>s.id===r.session_id)?.eye_excluded&&root.GazeMath.summarize(r.gaze||[],r.actualMs).effectiveMs>0);
    return {seconds,enrolled:p.length,completed:p.filter(r=>r.completed).length,excluded:p.filter(r=>r.eye_excluded).length,eyeParticipants:new Set(eye.filter(r=>(r.gaze||[]).some(p=>p.valid)).map(r=>r.session_id)).size,eyeTrials:eye.length,trialCount:t.length,purposeAccuracy:average(t.map(r=>r.purposeScore).filter(finite)),brandAccuracy:average(t.map(r=>r.brandScore).filter(finite)),medianDurationMs:median(p.map(r=>r.durationMs)),medianAnswerMs:median(t.map(r=>r.answerDurationMs)),interruptedTrials:t.filter(r=>r.interrupted).length};});}
  root.ResearchData={trials,participants,eligible,aggregate,groups,average,median};
})(typeof window==='undefined'?globalThis:window);
