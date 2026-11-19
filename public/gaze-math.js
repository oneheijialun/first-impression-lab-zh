(function(root) {
  'use strict';
  const labels = ['左上','上中','右上','左中','中央','右中','左下','下中','右下'];
  function summarize(samples, durationMs) {
    const regions = Array(9).fill(0);
    const points = [];
    let valid = 0;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      if (!sample.valid || !Number.isFinite(sample.x) || !Number.isFinite(sample.y) || sample.x<0 || sample.x>1 || sample.y<0 || sample.y>1) continue;
      valid++;
      const nextTime = index+1<samples.length ? samples[index+1].t : durationMs;
      const weight = Math.min(150,Math.max(0, Math.min(durationMs,nextTime)-sample.t));
      if (!weight) continue;
      const region = Math.min(2,Math.floor(sample.y*3))*3+Math.min(2,Math.floor(sample.x*3));
      regions[region] += weight;
      points.push({x:sample.x,y:sample.y,weight,t:sample.t});
    }
    const effectiveMs = regions.reduce((sum,value)=>sum+value,0);
    return {regions,points,effectiveMs,valid,total:samples.length,
      shares:regions.map(value=>effectiveMs ? value/effectiveMs : 0),
      strongest:effectiveMs ? regions.indexOf(Math.max(...regions)) : -1};
  }
  function grid(points,width=120,height=80) {
    const cells=new Float64Array(width*height);
    for(const point of points) {
      const cx=Math.min(width-1,Math.floor(point.x*width));
      const cy=Math.min(height-1,Math.floor(point.y*height));
      for(let dy=-5;dy<=5;dy++) for(let dx=-5;dx<=5;dx++) {
        const x=cx+dx,y=cy+dy;
        if(x<0 || x>=width || y<0 || y>=height)continue;
        cells[y*width+x] += point.weight*Math.exp(-(dx*dx+dy*dy)/10);
      }
    }
    return cells;
  }
  function regionShares(points,regions) {
    const total=points.reduce((sum,point)=>sum+point.weight,0);
    return regions.map(region=>{
      const estimatedMs=points.filter(point=>point.x>=region.x && point.x<=region.x+region.width && point.y>=region.y && point.y<=region.y+region.height).reduce((sum,point)=>sum+point.weight,0);
      return {...region,estimatedMs,share:total?estimatedMs/total:0};
    });
  }
  root.GazeMath={labels,summarize,grid,regionShares};
  if(typeof module!=='undefined') module.exports=root.GazeMath;
})(typeof window==='undefined'?globalThis:window);
