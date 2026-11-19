'use strict';
// The mini-test v3 pipeline, shared with the experiment. No video recording APIs.
window.ExperimentEye = class {
  static accepts(quality){return !!quality&&quality.complete===true&&Number.isFinite(quality.meanErrorPx)&&quality.meanErrorPx<500;}
  constructor(onStatus) {this.status=onStatus;this.phase='off';this.generation=0;this.rows=[];this.lastFace=0;this.lastClick=0;this.quality=null;}
  show(phase) {
    this.phase=phase;document.body.dataset.eyePhase=phase;
    if(!this.started)return;
    const visible=phase==='position'||phase==='calibration';
    for(const method of ['showVideoPreview','showVideo','showFaceOverlay','showFaceFeedbackBox'])webgazer[method](visible);
    webgazer.showPredictionPoints(false);
  }
  async start() {
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('请使用 start.cmd 打开的本机地址，并允许摄像头权限。');
    this.show('loading');this.status('正在加载本地眼动模型…');
    if(!window.webgazer)await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='./vendor/webgazer.js';script.onload=resolve;
      script.onerror=()=>{script.remove();reject(Error('本地 WebGazer 文件缺失，请完整解压安装包。'));};document.head.append(script);
    });
    webgazer.params.faceMeshSolutionPath=new URL('./mediapipe/face_mesh',location.href).href;
    const detector=await webgazer.getTracker().init();
    const probe=document.createElement('canvas');probe.width=128;probe.height=128;await detector.estimateFaces(probe);
    webgazer.saveDataAcrossSessions(false);webgazer.setRegression('ridge');webgazer.applyKalmanFilter(true);
    await webgazer.clearData();webgazer.setGazeListener(data=>this.sample(data));
    this.status('模型就绪，请在浏览器提示中允许摄像头。');
    const generation=++this.generation;let timer;
    const beginning=webgazer.begin();
    beginning.then(()=>{if(generation!==this.generation)this.releaseTracks();},()=>{});
    try {await Promise.race([beginning,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('摄像头启动超时，请检查权限后重试。')),60000);})]);}
    catch(error){this.stop();throw error;}finally{clearTimeout(timer);}
    this.started=true;webgazer.removeMouseEventListeners();webgazer.setVideoViewerSize(186,140);
    this.show('position');this.status('请将脸放入定位框，光线均匀，全程保持身体和头部不动，仅眼睛移动。视频仅在浏览器内处理，不录制、不保存、不上传。');
  }
  sample(data) {
    const now=performance.now();const finite=!!data&&Number.isFinite(data.x)&&Number.isFinite(data.y);
    if(finite||webgazer.getTracker()?.getPositions?.()?.length)this.lastFace=now;
    if(this.phase==='validation'&&now-this.validationStart>=600) {
      const p=this.validationPoint;
      this.validation.push({point:this.validationIndex,t:now-this.validationStart,x:finite?data.x:null,y:finite?data.y:null,errorPx:finite?Math.hypot(data.x-p[0]*innerWidth,data.y-p[1]*innerHeight):null});
    }
    if(this.phase!=='viewing')return;
    const r=this.rect,x=finite?(data.x-r.left)/r.width:null,y=finite?(data.y-r.top)/r.height:null;
    this.rows.push({t:now-this.onset,viewportX:finite?data.x:null,viewportY:finite?data.y:null,x,y,valid:finite&&x>=0&&x<=1&&y>=0&&y<=1});
  }
  async prepareCalibration() {
    await webgazer.clearData();await webgazer.resume();
    this.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};
    this.quality=null;this.lastClick=0;this.show('calibration');
  }
  train(point) {
    const now=performance.now();
    if(now-this.lastClick<250)return false;
    if(!this.lastFace||now-this.lastFace>600){this.status('尚未检测到脸部，请调整光线、正对摄像头后再点击。');return false;}
    this.lastClick=now;webgazer.recordScreenPosition(point[0]*innerWidth,point[1]*innerHeight,'click');return true;
  }
  async validate(points,onPoint) {
    const generation=++this.generation;this.validation=[];this.show('validation');
    for(let i=0;i<points.length;i++) {
      if(generation!==this.generation)return null;
      this.validationPoint=points[i];this.validationIndex=i;this.validationStart=performance.now();onPoint(i);
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(generation!==this.generation)return null;
    const groups=points.map((_,i)=>this.validation.filter(row=>row.point===i&&row.errorPx!==null));
    const means=groups.map(rows=>rows.length?rows.reduce((sum,row)=>sum+row.errorPx,0)/rows.length:null);
    const complete=groups.every(rows=>rows.length>=5);const mean=complete?means.reduce((a,b)=>a+b,0)/means.length:null;
    this.quality={version:'mini-v3-integration-v7',meanErrorPx:mean,pointMeans:means,perPointCounts:groups.map(rows=>rows.length),complete,passed:complete&&mean<500,criterionPx:500,viewport:this.viewport,validation:this.validation,predictionHz:this.validation.length/(points.length*1.4),predictionMissingRate:this.validation.length?this.validation.filter(row=>row.errorPx===null).length/this.validation.length:null};
    this.show('ready');webgazer.pause();return this.quality;
  }
  viewportMatches(){return this.viewport&&innerWidth===this.viewport.width&&innerHeight===this.viewport.height&&devicePixelRatio===this.viewport.dpr;}
  async resume(){await webgazer.resume();this.show('ready');}
  record(rect,onset){this.rows=[];this.rect={left:rect.left,top:rect.top,width:rect.width,height:rect.height};this.onset=onset;this.show('viewing');}
  finish(){this.show('ready');webgazer.pause();return this.rows;}
  releaseTracks(){document.getElementById('webgazerVideoFeed')?.srcObject?.getTracks().forEach(track=>track.stop());}
  stop(){this.generation++;if(window.webgazer){webgazer.pause();webgazer.clearGazeListener();this.releaseTracks();webgazer.end();}this.started=false;this.show('off');}
};
