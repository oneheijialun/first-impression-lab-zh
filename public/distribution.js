'use strict';
const distribution = document.createElement('section');
distribution.innerHTML = `<h2>每张图片的视线分布</h2>
<p>热区颜色表示相对停留密度。按相邻采样的时间间隔加权，每段最多计入 150 毫秒，追踪空缺不累计。</p>
<label>图片 <select id="heat-stimulus"></select></label>
<label>被试 <select id="heat-participant"><option value="">全部被试（每人等权）</option></select></label>
<label>呈现时长 <select id="heat-time"><option value="">全部</option><option>2</option><option>5</option><option>10</option></select></label>
<label><input id="heat-calibrated" type="checkbox" checked>仅校准误差小于 120 px 的试次（预试阈值）</label>
<label><input id="heat-path" type="checkbox">叠加个人视线路径</label><label>回放进度 <input id="heat-timeline" type="range" min="0" max="100" value="100"><output id="heat-progress">100%</output></label><button id="heat-play">播放路径</button><button id="heat-export">导出热力图 PNG</button><p id="heat-summary" role="status"></p>
<canvas id="heat-canvas" style="width:100%;height:auto;border:1px solid #bbc9c5"></canvas>
<div id="heat-region-shares"></div><p><small>摄像头估计视线分布，采用归一化图片坐标。热图经过平滑处理，热点范围受到校准误差影响。区域尚按顶部、中央、底部粗分。</small></p>`;
document.querySelector('#panel').prepend(distribution);
let heatManifest = [];
let heatPlayback;
let renderVersion = 0;
async function updateDistribution() {
  if (!heatManifest.length) {
    heatManifest = await (await fetch('./stimuli/manifest.json')).json();
    const select = document.querySelector('#heat-stimulus');
    for (const stimulus of heatManifest) {
      const option = document.createElement('option');
      option.value = stimulus.id;
      option.textContent = stimulus.sourceFile;
      select.append(option);
    }
  }
  const participant = document.querySelector('#heat-participant');
  const previous = participant.value;
  participant.replaceChildren(new Option('全部被试（每人等权）', ''));
  for (const session of dataset.sessions) participant.append(new Option(session.id, session.id));
  participant.value = previous;
  await drawDistribution();
}
async function drawDistribution() {
  const version = ++renderVersion;
  const stimulus = document.querySelector('#heat-stimulus').value;
  const participant = document.querySelector('#heat-participant').value;
  const seconds = document.querySelector('#heat-time').value;
  const calibrated = document.querySelector('#heat-calibrated').checked;
  const progress=Number(document.querySelector('#heat-timeline').value)/100;
  document.querySelector('#heat-progress').textContent=Math.round(progress*100)+'%';
  const regionWeights=Array(9).fill(0);
  const candidates = dataset.records.filter(record => record.kind === 'trial' && record.data.stimulus === stimulus &&
    (!participant || record.session_id === participant) &&
    (!seconds || Number(record.data.plannedMs) === Number(seconds) * 1000));
  const trials = candidates.filter(record => !record.data.interrupted && record.data.camera &&
    (!calibrated || (Number.isFinite(record.data.calibrationErrorPx) && record.data.calibrationErrorPx < 120)));
  const picture = new Image();
  picture.src = './stimuli/' + stimulus + '.png';
  await picture.decode();
  if (version !== renderVersion) return;
  const canvas = document.querySelector('#heat-canvas');
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(picture, 0, 0);
  const gridWidth = 100;
  const gridHeight = Math.max(1, Math.round(gridWidth * canvas.height / canvas.width));
  const grid = new Float64Array(gridWidth * gridHeight);
  let validCount = 0;
  let totalCount = 0;
  let used = 0;
  let effectiveMs = 0;
  for (const trial of trials) {
    const samples = (trial.data.gaze || []).filter(row=>row.t<=trial.data.actualMs*progress);
    const weighted = [];
    totalCount += samples.length;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      if (!sample.valid || !Number.isFinite(sample.x) || !Number.isFinite(sample.y) || sample.x < 0 || sample.x > 1 || sample.y < 0 || sample.y > 1) continue;
      validCount++;
      const next = samples[index + 1];
      const end = next ? next.t : trial.data.actualMs*progress;
      const weight = Math.min(150, Math.max(0, end - sample.t));
      if (weight > 0) weighted.push({x:sample.x,y:sample.y,weight});
    }
    const total = weighted.reduce((sum, point) => sum + point.weight, 0);
    if (!total) continue;
    used++;
    const summary=GazeMath.summarize(samples,trial.data.actualMs*progress);
    summary.shares.forEach((value,index)=>{regionWeights[index]+=value;});
    effectiveMs += total;
    for (const point of weighted) {
      const x = Math.min(gridWidth - 1, Math.floor(point.x * gridWidth));
      const y = Math.min(gridHeight - 1, Math.floor(point.y * gridHeight));
      grid[y * gridWidth + x] += point.weight / total;
    }
  }
  const overlay = document.createElement('canvas');
  overlay.width = gridWidth;
  overlay.height = gridHeight;
  const overlayContext = overlay.getContext('2d');
  const pixels = overlayContext.createImageData(gridWidth,gridHeight);
  const smoothed = new Float64Array(grid.length);
  for(let y=0;y<gridHeight;y++) for(let x=0;x<gridWidth;x++) {
    const value=grid[y*gridWidth+x];
    if (!value) continue;
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++) {
      if(y+dy<0 || y+dy>=gridHeight || x+dx<0 || x+dx>=gridWidth) continue;
      smoothed[(y+dy)*gridWidth+x+dx] += value*Math.exp(-(dx*dx+dy*dy)/8);
    }
  }
  const maximum = Math.max(...smoothed);
  if(maximum>0) {
    smoothed.forEach((value,index)=>{
      const relative=value/maximum;
      pixels.data[index*4]=255;
      pixels.data[index*4+1]=Math.round(220*(1-relative));
      pixels.data[index*4+2]=0;
      pixels.data[index*4+3]=Math.round(Math.min(.8,relative)*255);
    });
    overlayContext.putImageData(pixels,0,0);
    context.imageSmoothingEnabled=true;
    context.drawImage(overlay,0,0,canvas.width,canvas.height);
  }
  if(participant && document.querySelector('#heat-path').checked) {
    context.strokeStyle='rgba(255,255,255,.9)';context.lineWidth=Math.max(2,canvas.width/600);
    for(const trial of trials){let previous=null;context.beginPath();for(const row of trial.data.gaze||[]){if(row.t>trial.data.actualMs*progress)break;if(!row.valid){previous=null;continue;}const x=row.x*canvas.width,y=row.y*canvas.height;if(previous&&row.t-previous.t<=200)context.lineTo(x,y);else context.moveTo(x,y);previous=row;}context.stroke();}
  }
  const labels=['左上','中上','右上','左中','中央','右中','左下','中下','右下'];
  const regions=document.querySelector('#heat-region-shares');regions.replaceChildren();
  for(let i=0;i<9;i++){const cell=document.createElement('div');const label=document.createElement('span');label.textContent=labels[i];const value=document.createElement('strong');value.textContent=used?(100*regionWeights[i]/used).toFixed(1)+'%':'—';cell.append(label,value);regions.append(cell);}
  document.querySelector('#heat-summary').textContent = used ?
    `纳入 ${used} 个试次，有效采样 ${validCount} / ${totalCount}（${totalCount ? (100*validCount/totalCount).toFixed(1) : 0}%），估计有效停留 ${(effectiveMs/1000).toFixed(2)} 秒。每张图独立归一化，颜色用于比较图内分布。` :
    '当前筛选条件下暂无可用眼动数据。请完成摄像头校准与看图测试后刷新。';
}
for (const id of ['heat-stimulus','heat-participant','heat-time','heat-calibrated','heat-path']) {
  document.getElementById(id).addEventListener('change',()=>drawDistribution().catch(error=>{document.querySelector('#heat-summary').textContent=error.message}));
}
document.querySelector('#heat-export').onclick = () => {
  const canvas=document.querySelector('#heat-canvas');
  if(!canvas.width)return;
  const link=document.createElement('a');
  link.download=document.querySelector('#heat-stimulus').value+'-gaze.png';
  link.href=canvas.toDataURL('image/png');
  link.click();
};
const originalLoad = load;
load = async function() {
  await originalLoad();
  if (dataset?.sessions && !document.querySelector('#panel').hidden) await updateDistribution();
};
document.querySelector('#refresh').onclick = load;

document.querySelector('#heat-timeline').oninput=()=>drawDistribution().catch(error=>{document.querySelector('#heat-summary').textContent=error.message;});
document.querySelector('#heat-play').onclick=()=>{if(heatPlayback){clearInterval(heatPlayback);heatPlayback=null;document.querySelector('#heat-play').textContent='播放路径';return;}const slider=document.querySelector('#heat-timeline');if(Number(slider.value)>=100)slider.value=0;document.querySelector('#heat-play').textContent='暂停回放';heatPlayback=setInterval(()=>{slider.value=Math.min(100,Number(slider.value)+2);slider.oninput();if(Number(slider.value)>=100){clearInterval(heatPlayback);heatPlayback=null;document.querySelector('#heat-play').textContent='播放路径';}},150);};
