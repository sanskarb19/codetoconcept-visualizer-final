/* Offline, timestamped frames: no screen capture and no real-time playback wait.
 * WebCodecs: https://www.w3.org/TR/webcodecs/
 * WebM/EBML elements: https://www.matroska.org/technical/elements.html
 */
(() => {
  'use strict';
  const W=1280,H=900,MAX_BYTES=256*1024*1024;
  const abort=signal=>{if(signal?.aborted)throw new DOMException('Export cancelled.','AbortError');};
  const bytes=n=>{const out=[];do{out.unshift(n%256);n=Math.floor(n/256);}while(n);return new Uint8Array(out);};
  function size(n){let width=1;while(n>=2**(7*width)-1)width++;const out=new Uint8Array(width);for(let i=width-1;i>=0;i--){out[i]=n%256;n=Math.floor(n/256);}out[0]|=1<<(8-width);return out;}
  const element=(id,parts)=>{const data=new Blob(Array.isArray(parts)?parts:[parts]);return new Blob([bytes(id),size(data.size),data]);};
  const uint=(id,n)=>element(id,bytes(n));
  const string=(id,s)=>element(id,new TextEncoder().encode(s));
  const float=(id,n)=>{const data=new Uint8Array(8);new DataView(data.buffer).setFloat64(0,n,false);return element(id,data);};

  // One independently decodable key frame per visual state, held by timestamps.
  // Cues and a SeekHead make long videos seekable without encoding duplicate frames.
  function muxWebM(frames,{width=W,height=H,holdMs=2550}={}) {
    if(!frames.length)throw new Error('No video frames were encoded.');
    const header=element(0x1a45dfa3,[uint(0x4286,1),uint(0x42f7,1),uint(0x42f2,4),uint(0x42f3,8),string(0x4282,'webm'),uint(0x4287,2),uint(0x4285,2)]);
    const info=element(0x1549a966,[uint(0x2ad7b1,1000000),string(0x4d80,'Code to Concept'),string(0x5741,'Code to Concept'),float(0x4489,frames.length*holdMs)]);
    const tracks=element(0x1654ae6b,[element(0xae,[uint(0xd7,1),uint(0x73c5,1),uint(0x83,1),uint(0x9c,0),string(0x86,'V_VP8'),uint(0x23e383,holdMs*1000000),element(0xe0,[uint(0xb0,width),uint(0xba,height)])])]);
    const clusters=frames.map((frame,i)=>element(0x1f43b675,[uint(0xe7,i*holdMs),element(0xa3,[new Uint8Array([0x81,0,0,0x80]),frame])]));
    const clusterBytes=clusters.reduce((sum,cluster)=>sum+cluster.size,0);
    let seekHead=new Blob();
    for(let i=0;i<8;i++){
      const offset=seekHead.size+info.size+tracks.size+clusterBytes;
      const next=element(0x114d9b74,[element(0x4dbb,[element(0x53ab,bytes(0x1c53bb6b)),uint(0x53ac,offset)])]);
      const stable=next.size===seekHead.size;seekHead=next;if(stable)break;
    }
    let position=seekHead.size+info.size+tracks.size;
    const cues=element(0x1c53bb6b,clusters.map((cluster,i)=>{
      const cue=element(0xbb,[uint(0xb3,i*holdMs),element(0xb7,[uint(0xf7,1),uint(0xf1,position)])]);position+=cluster.size;return cue;
    }));
    return new Blob([header,element(0x18538067,[seekHead,info,tracks,...clusters,cues])],{type:'video/webm'});
  }

  const plain=value=>window.LearningStudio.unwrap(value);
  function text(value){if(value===undefined)return 'not created';const v=plain(value);return typeof v==='object'?JSON.stringify(v):String(v);}
  const shorten=(s,n=65)=>{s=String(s??'');return s.length>n?s.slice(0,n-1)+'…':s;};
  function box(ctx,x,y,w,h,fill='#ffffff',stroke='#dce3f0'){
    ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.fill();ctx.stroke();
  }
  function write(ctx,s,x,y,{size=18,color='#334664',bold=false,mono=false}={}){
    ctx.font=`${bold?'600':'400'} ${size}px ${mono?'monospace':'system-ui, sans-serif'}`;ctx.fillStyle=color;ctx.fillText(String(s??''),x,y);
  }
  function wrap(ctx,s,x,y,width,{size=18,color='#52647e',lines=4,mono=false}={}){
    ctx.font=`400 ${size}px ${mono?'monospace':'system-ui, sans-serif'}`;
    const words=String(s??'').split(/\s+/);let line='',row=0;
    for(let i=0;i<words.length;i++){
      const next=line?line+' '+words[i]:words[i];
      if(ctx.measureText(next).width>width&&line){write(ctx,line,x,y+row*size*1.5,{size,color,mono});row++;line=words[i];if(row===lines-1){line+=i<words.length-1?' '+words.slice(i+1).join(' '):'';break;}}
      else line=next;
    }
    while(ctx.measureText(line).width>width&&line.length>1)line=line.slice(0,-2)+'…';
    write(ctx,line,x,y+row*size*1.5,{size,color,mono});return (row+1)*size*1.5;
  }
  function valueCard(ctx,label,value,x,y,w=300,h=110){box(ctx,x,y,w,h,'#f7f9ff');write(ctx,label,x+16,y+28,{size:14,color:'#5e7090',bold:true});wrap(ctx,text(value),x+16,y+62,w-32,{size:22,color:'#384c78',lines:2,mono:true});}
  function values(ctx,entries,x,y,w,h){
    const limit=Math.max(1,Math.floor(h/100)),shown=entries.slice(0,limit);
    shown.forEach(([name,v],i)=>valueCard(ctx,name,v,x,y+i*100,w,90));
    if(entries.length>limit)write(ctx,`+ ${entries.length-limit} more named values`,x,y+shown.length*100+16,{size:13});
  }
  function chooseValue(step,options){
    const entries=Object.entries(step.after).filter(([,v])=>['dict','instance','matrix','list','tuple','set'].includes(v?.__type__));
    if(options.variable&&step.after[options.variable])return [options.variable,step.after[options.variable]];
    const structure=entries.find(([name,v])=>['root','tree','graph','head'].includes(name)&&window.LearningStudio.topology(v,options.concept).nodes.length);
    return structure||entries.find(([name])=>step.changes.some(c=>c.name===name))||entries[0]||[];
  }
  function matrix(ctx,name,value,x,y,w,h,before){
    const rows=value.value,shown=rows.slice(0,10),cols=Math.min(10,rows[0]?.length||0),cellW=Math.min(78,(w-20)/Math.max(1,cols)),cellH=Math.min(48,(h-60)/Math.max(1,shown.length));
    write(ctx,`${name} · ${rows.length} rows × ${rows[0]?.length||0} columns`,x,y+20,{size:17,bold:true});
    shown.forEach((row,i)=>row.slice(0,cols).forEach((v,j)=>{
      const changed=JSON.stringify(before?.value?.[i]?.[j])!==JSON.stringify(v);
      box(ctx,x+j*cellW,y+36+i*cellH,cellW-5,cellH-5,changed?'#e8ecff':'#fff');
      write(ctx,shorten(v,8),x+j*cellW+9,y+36+i*cellH+cellH*.62,{size:Math.min(18,cellH*.42),mono:true});
    }));
    if(rows.length>10||rows[0]?.length>10)write(ctx,'Preview: first 10 rows / columns',x,y+h-5,{size:13});
  }
  function array(ctx,name,value,x,y,w,h,before){
    const items=value.value,cols=8,cellW=w/cols,rows=Math.min(5,Math.ceil(items.length/cols));
    write(ctx,`${name} · ${items.length} items · positions start at 0`,x,y+20,{size:17,bold:true});
    items.slice(0,40).forEach((v,i)=>{const px=x+i%cols*cellW,py=y+40+Math.floor(i/cols)*66,changed=JSON.stringify(before?.value?.[i])!==JSON.stringify(v);box(ctx,px,py,cellW-6,58,changed?'#e8ecff':'#fff');write(ctx,i,px+9,py+17,{size:11,color:'#7584a0'});write(ctx,shorten(text(v),6),px+9,py+40,{size:17,mono:true});});
    if(items.length>40)write(ctx,'Preview: first 40 items',x,y+50+rows*66,{size:13});
    if(!items.length)write(ctx,'Empty collection',x,y+60,{size:20});
  }
  async function svgImage(ctx,html,x,y,w,h){
    let svg=html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];if(!svg)return false;
    svg=svg.replace('<svg ',`<svg xmlns="http://www.w3.org/2000/svg" `).replace(/<\/svg>$/,`<style>text{font-family:Arial,sans-serif;text-anchor:middle;fill:#405575;font-size:15px}.structure-edge{fill:none;stroke:#a9b8d0;stroke-width:2}.structure-node circle{fill:#f3f6ff;stroke:#9aafd1;stroke-width:2}.structure-node.active circle{fill:#ffedb8;stroke:#bc9134}.structure-node.visited circle{fill:#d5efe3;stroke:#69a38d}.edge-label,.axis-label{font-size:12px}.bar-name{font-size:12px}.bar-value{font-size:15px;font-weight:bold}</style></svg>`);
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
    const view=svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number)||[0,0,700,400];
    const scale=Math.min(w/view[2],h/view[3]);ctx.drawImage(image,x+(w-view[2]*scale)/2,y,view[2]*scale,view[3]*scale);return true;
  }
  async function outcome(ctx,step,options,x,y,w,h){
    if(step.exception){write(ctx,step.exception.type,x,y+30,{size:24,bold:true,color:'#aa443b'});wrap(ctx,step.exception.message,x,y+70,w,{lines:8});return;}
    if(step.output){write(ctx,'PRINTED OUTPUT',x,y+25,{size:14,bold:true});step.output.split('\n').slice(0,10).forEach((line,i)=>write(ctx,shorten(line,65),x,y+65+i*28,{size:19,mono:true}));return;}
    if(step.kind==='enter'){write(ctx,`Inputs to ${step.next.function}()`,x,y+25,{size:21,bold:true});values(ctx,Object.entries(step.parameters||{}),x,y+50,w,h-50);return;}
    if(step.kind==='resume'||step.meta.kind==='return'){valueCard(ctx,'RETURNED VALUE',step.returnValue??step.next.return_value,x,y,w);return;}
    if(step.meta.kind==='if'){
      const label=step.decision===true?'YES — take this branch':step.decision===false?'NO — follow the other path':'Condition is still running';
      box(ctx,x+40,y+30,w-80,130,step.decision?'#e6f4ec':'#fff1dc');wrap(ctx,window.Storyboard.expressionText(step.meta.expression,step.before),x+65,y+75,w-130,{size:23,lines:2});write(ctx,label,x+65,y+135,{size:20,bold:true});
      if(step.decision!==null)write(ctx,`Continue at line ${step.next.line_number}`,x+65,y+205,{size:21});return;
    }
    const [name,value]=chooseValue(step,options);
    if(options.mode==='columns'&&await svgImage(ctx,window.TutorFigures.columns(step,name),x,y,w,h))return;
    if(options.mode==='memory'){values(ctx,Object.entries(step.after).filter(([,v])=>v?.__type__!=='object'),x,y,w,h);return;}
    const diagram=window.LearningStudio.diagram(value,options.concept,step.after,options.directed);
    if(diagram){
      await svgImage(ctx,diagram,x,y,w,h-65);
      wrap(ctx,['node','queue','visited','seen'].filter(n=>step.after[n]).map(n=>`${n}: ${text(step.after[n])}`).join('   ·   '),x,y+h-45,w,{size:15,lines:2});return;
    }
    if(value?.__type__==='matrix'){matrix(ctx,name,value,x,y,w,h,step.before[name]);return;}
    if(['list','tuple','set'].includes(value?.__type__)){array(ctx,name,value,x,y,w,h,step.before[name]);return;}
    if(['dict','instance'].includes(value?.__type__)){values(ctx,Object.entries(value.value),x,y,w,h);return;}
    if(await svgImage(ctx,window.TutorFigures.columns(step,''),x,y,w,h))return;
    values(ctx,step.changes.map(c=>[c.name,c.after]),x,y,w,h);
  }
  async function renderFrame(canvas,options,index,phase=2){
    const ctx=canvas.getContext('2d'),step=options.steps[index],source=options.source.split(/\r?\n/),S=window.Storyboard;
    ctx.fillStyle='#f2f5fc';ctx.fillRect(0,0,W,H);
    write(ctx,'Code to Concept',32,44,{size:26,bold:true,color:'#364882'});
    write(ctx,`${options.language==='matlab'?'MATLAB':'Python'} · ${options.concept}`,32,74,{size:16});
    write(ctx,`Instruction ${index+1} / ${options.steps.length} · ${['Read inputs','Do the work','See result'][phase]}`,735,48,{size:18,bold:true});
    box(ctx,24,100,440,750,'#202b3e','#202b3e');
    write(ctx,'SOURCE CODE',44,133,{size:13,color:'#adbad0',bold:true});
    const start=Math.max(0,step.line-6),end=Math.min(source.length,start+14);
    for(let i=start;i<end;i++){
      const cy=166+(i-start)*25;
      if(i+1===step.line)box(ctx,35,cy-18,418,25,'#334a58','#334a58');
      write(ctx,String(i+1).padStart(3,' '),43,cy,{size:14,color:'#a8bad2',mono:true});
      write(ctx,shorten(source[i],43),87,cy,{size:14,color:'#e4eaf6',mono:true});
    }
    write(ctx,phase<2?'VALUES BEFORE THIS LINE':'VALUES AFTER THIS LINE',44,566,{size:13,color:'#adbad0',bold:true});
    const scope=phase<2?step.before:step.after,variables=Object.entries(scope).filter(([,v])=>v?.__type__!=='object');
    variables.slice(0,7).forEach(([name,v],i)=>{write(ctx,shorten(name,17),44,600+i*29,{size:15,color:'#bdcbed',mono:true});write(ctx,shorten(text(v),24),215,600+i*29,{size:15,color:'#fff',mono:true});});
    if(variables.length>7)write(ctx,`+ ${variables.length-7} more values`,44,824,{size:13,color:'#adbad0'});
    box(ctx,484,100,772,750);
    const description=S.describe(step),expr=S.expressionText(step.meta.expression,step.before);
    write(ctx,`LINE ${step.line}`,508,133,{size:13,color:'#657595',bold:true});
    wrap(ctx,step.code.trim(),508,165,720,{size:19,color:'#334664',mono:true,lines:2});
    const title=phase===0?'Read the inputs':phase===1?'Work out this instruction':description.title;
    write(ctx,shorten(title,48),508,236,{size:25,bold:true,color:'#344777'});
    const why=phase===0?'Use the values that exist before this line. The result has not been revealed yet.':phase===1?'Resolve the expression, then store its result or follow the chosen instruction.':description.why;
    wrap(ctx,why,508,271,720,{size:17,lines:3});
    if(phase===0){
      const inputs=window.GuidedLesson.inputs(step);
      if(inputs.length)values(ctx,inputs.map(({name,value})=>[name,value]),508,355,720,450);
      else {write(ctx,'Inputs written in the code',508,385,{size:22,bold:true});wrap(ctx,step.code.trim(),508,430,720,{size:22,mono:true,lines:8});}
    } else if(phase===1){
      const visibleExpr=expr?.includes('__')?step.code.trim():expr||step.code.trim();
      box(ctx,508,365,720,150,'#eef2ff');wrap(ctx,visibleExpr,530,410,674,{size:27,color:'#42549a',mono:true,lines:3});
      const inputs=window.GuidedLesson.inputs(step);values(ctx,inputs.slice(0,2).map(({name,value})=>[name,value]),508,545,720,240);
    } else await outcome(ctx,step,options,508,350,720,465);
    ctx.fillStyle='#d9e1f1';ctx.fillRect(24,873,1232,5);ctx.fillStyle='#6474cf';ctx.fillRect(24,873,1232*(index+1)/options.steps.length,5);
    return canvas;
  }
  async function exportVideo(options,{signal,onProgress=()=>{}}={}){
    if(!options.steps?.length)throw new Error('Run some code before downloading its visualization.');
    if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw new Error('Fast video export requires WebCodecs. Open this site in a current Chrome or Edge browser.');
    abort(signal);
    const config={codec:'vp8',width:W,height:H,bitrate:2000000,framerate:1,latencyMode:'realtime'};
    const support=await VideoEncoder.isConfigSupported(config);
    if(!support.supported)throw new Error('This browser cannot encode VP8 video. Try a current Chrome or Edge browser.');
    abort(signal);
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const frames=[],phases=options.guided?3:1,holdMs=Math.max(250,Math.round(options.holdMs||2550)),total=options.steps.length*phases;
    let failure=null,encodedBytes=0;
    const encoder=new VideoEncoder({
      output(chunk){
        encodedBytes+=chunk.byteLength;
        if(encodedBytes>MAX_BYTES){failure=new Error('The video exceeds the 256 MB export limit. Export a shorter execution.');return;}
        const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);frames.push({timestamp:chunk.timestamp,data});
      },error(error){failure=error;},
    });
    try {
      encoder.configure(support.config);
      for(let i=0;i<total;i++){
        abort(signal);if(failure)throw failure;
        await renderFrame(canvas,options,Math.floor(i/phases),options.guided?i%3:2);
        abort(signal);
        const frame=new VideoFrame(canvas,{timestamp:i*holdMs*1000,duration:holdMs*1000});
        try{encoder.encode(frame,{keyFrame:true});}finally{frame.close();}
        // Bound the encode queue and let cancellation / button progress paint.
        if(i%8===7){await encoder.flush();if(failure)throw failure;await new Promise(resolve=>setTimeout(resolve,0));}
        onProgress(Math.min(98,Math.round((i+1)/total*98)));
      }
      await encoder.flush();abort(signal);if(failure)throw failure;
      if(frames.length!==total)throw new Error('The browser did not encode every visualization frame.');
      frames.sort((a,b)=>a.timestamp-b.timestamp);
      const blob=muxWebM(frames.map(f=>f.data),{holdMs});onProgress(100);return blob;
    } finally {if(encoder.state!=='closed')encoder.close();canvas.width=0;canvas.height=0;}
  }
  window.VisualizationVideo={exportVideo,renderFrame,muxWebM};
})();
