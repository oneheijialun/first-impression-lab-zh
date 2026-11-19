(function(root){
 'use strict';
 function draw(canvas,image,result,{paths=false}={}){
   canvas.width=Math.min(1600,image.naturalWidth);canvas.height=Math.round(canvas.width*image.naturalHeight/image.naturalWidth);
   const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);
   if(result.points?.length){
     const width=130,height=Math.max(20,Math.round(width*canvas.height/canvas.width));
     const cells=root.GazeMath.grid(result.points,width,height),maximum=Math.max(...cells);
     if(maximum>0){const overlay=document.createElement('canvas');overlay.width=width;overlay.height=height;const ctx=overlay.getContext('2d'),pixels=ctx.createImageData(width,height);
       cells.forEach((value,i)=>{const ratio=value/maximum;if(ratio<.01)return;const hue=(1-ratio)*220;const chroma=1,x=chroma*(1-Math.abs((hue/60)%2-1));const rgb=hue<60?[1,x,0]:hue<120?[x,1,0]:hue<180?[0,1,x]:[0,x,1];rgb.forEach((v,c)=>pixels.data[i*4+c]=Math.round(v*255));pixels.data[i*4+3]=Math.round(Math.min(.8,.18+ratio*.7)*255* Math.min(1,ratio*8));});
       ctx.putImageData(pixels,0,0);context.imageSmoothingEnabled=true;context.drawImage(overlay,0,0,canvas.width,canvas.height);
     }
   }
   if(paths){context.strokeStyle='rgba(255,255,255,.95)';context.lineWidth=Math.max(2,canvas.width/600);for(const rows of result.paths||[]){let prev=null;context.beginPath();for(const p of rows){if(!p.valid){prev=null;continue;}if(prev&&p.t-prev.t<=200)context.lineTo(p.x*canvas.width,p.y*canvas.height);else context.moveTo(p.x*canvas.width,p.y*canvas.height);prev=p;}context.stroke();}}
 }
 function png(canvas,name){canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});}
 root.GazeVisual={draw,png};
})(typeof window==='undefined'?globalThis:window);
