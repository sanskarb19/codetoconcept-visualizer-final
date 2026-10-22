/* Integration test: real Chrome encoder + downloads + video decoding, fixture API only.
 * Requires Playwright and installed Chrome (PLAYWRIGHT_CHANNEL can select Edge).
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const cases=JSON.parse(execFileSync('python',['tests/storyboard_cases.py'],{encoding:'utf8',maxBuffer:5*1024*1024}));
const root=path.resolve('frontend'),artifacts=path.resolve('tests/.artifacts/video-export');
fs.mkdirSync(artifacts,{recursive:true});
const json=(response,value)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));};
const server=http.createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');
  if(url.pathname==='/api/health')return json(response,{success:true,gemini:{available:false,status:'Test'}});
  if(url.pathname==='/api/concepts')return json(response,{success:true,concepts:['Variables & Assignment','Graph','Tree']});
  if(url.pathname==='/api/examples')return json(response,{code:cases[url.searchParams.get('concept')==='Graph'?'graph':url.searchParams.get('concept')==='Tree'?'tree':'addition'].source_code});
  if(url.pathname==='/api/execute'){
    let body='';for await(const chunk of request)body+=chunk;
    const input=JSON.parse(body),result=Object.values(cases).find(c=>c.source_code===input.code);
    return json(response,{...result,success:!result.error});
  }
  const file=path.resolve(root,url.pathname==='/'?'index.html':'.'+url.pathname.replace(/^\/static/,''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){response.statusCode=404;return response.end();}
  response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  fs.createReadStream(file).pipe(response);
});
async function readVideo(page,file,expectedDuration){
  const base64=fs.readFileSync(file).toString('base64');
  const meta=await page.evaluate(async({base64,expectedDuration})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));
    const video=document.createElement('video');video.muted=true;
    try{
      await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Downloaded video cannot be decoded'));video.src=url;});
      const result={duration:video.duration,width:video.videoWidth,height:video.videoHeight};
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Seeking timed out')),10000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=expectedDuration-.1;});
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;canvas.getContext('2d').drawImage(video,0,0);
      result.poster=canvas.toDataURL('image/png');return result;
    }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  },{base64,expectedDuration});
  assert.ok(Math.abs(meta.duration-expectedDuration)<.05,`duration ${meta.duration} should be ${expectedDuration}`);
  assert.equal(meta.width,1280);assert.equal(meta.height,900);
  fs.writeFileSync(file.replace('.webm','-last-frame.png'),Buffer.from(meta.poster.split(',')[1],'base64'));
}
(async()=>{
  if(!process.env.VISUALIZER_LIVE_URL)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=process.env.VISUALIZER_LIVE_URL?new URL(process.env.VISUALIZER_LIVE_URL).origin:`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1080},acceptDownloads:true});
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/?v=20261022-video-controls-1');
    assert.equal(await page.locator('meta[name="app-version"]').getAttribute('content'),'20261022-video-controls-1');
    assert.ok((await page.locator('script[src*="/static/js/app.js"]').getAttribute('src')).includes('?v='));
    await page.getByRole('button',{name:'01 · Adding numbers',exact:true}).click();
    await page.locator('#study-controls').waitFor({state:'visible'});
    assert.equal(await page.locator('#pause-button').count(),0);
    await page.getByRole('button',{name:'Show everything',exact:true}).click();
    const toggle=page.locator('#play-button'),before=await toggle.boundingBox();
    await toggle.click();await page.getByRole('button',{name:'Pause visualization',exact:true}).waitFor();
    assert.equal(await toggle.isEnabled(),true);
    const during=await toggle.boundingBox();assert.equal(before.x,during.x);assert.equal(before.width,during.width);
    await toggle.click();assert.equal(await toggle.getAttribute('aria-label'),'Play visualization');
    await page.locator('#speed-range').evaluate(input=>{input.value='10';});
    await toggle.click();await page.waitForFunction(()=>document.querySelector('#play-button').getAttribute('aria-pressed')==='false');
    assert.equal(await page.locator('#step-counter').innerText(),'4 / 4');
    await page.locator('#speed-range').evaluate(input=>{input.value='5';});
    const started=Date.now(),downloadEvent=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download visualization',exact:true}).click();
    const download=await downloadEvent,additionFile=path.join(artifacts,download.suggestedFilename());await download.saveAs(additionFile);
    const elapsed=Date.now()-started;
    assert.ok(fs.statSync(additionFile).size>1000);
    await readVideo(page,additionFile,cases.addition.events.filter(e=>e.event==='line').length*2.55);
    await page.screenshot({path:path.join(artifacts,'controls.png'),fullPage:true});
    await page.screenshot({path:path.join(artifacts,'controls-bar.png'),clip:{x:0,y:0,width:1440,height:145}});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await toggle.isVisible(),true);
    await page.getByRole('button',{name:'Download visualization',exact:true}).scrollIntoViewIfNeeded();
    const mobileDownload=await page.locator('#download-visualization-button').boundingBox();
    assert.ok(mobileDownload.x>=0&&mobileDownload.x+mobileDownload.width<=390);
    await page.setViewportSize({width:1440,height:1080});
    // The export must preserve the live instruction / selected view.
    assert.equal(await page.getByRole('button',{name:'Show everything',exact:true}).getAttribute('aria-pressed'),'true');
    const details=await page.evaluate(()=>({hasCapture:!!window.VisualizationVideo,calls:document.querySelector('#step-counter').textContent}));assert.equal(details.hasCapture,true);
    // Exercise guided frames, graph SVGs, tree SVGs and MATLAB matrices with a real encoder.
    for(const [name,guided,mode] of [['addition',true,'picture'],['graph',false,'picture'],['tree',false,'picture'],['matlab_powers',false,'picture'],['addition',false,'columns']]){
      const source=cases[name],file=path.join(artifacts,`${name}-${guided?'guided':mode}.webm`);
      const encoded=await page.evaluate(async({source,guided,mode})=>{
        const steps=window.Storyboard.build(source.events,source.statements,source.source_code);
        const blob=await window.VisualizationVideo.exportVideo({steps,source:source.source_code,concept:source.source_code.includes('graph =')?'Graph':source.source_code.includes('inorder')?'Tree':'Variables & Assignment',language:source.language||'python',guided,mode,holdMs:500,directed:false,variable:''});
        const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return {base64:btoa(text),frames:steps.length*(guided?3:1)};
      },{source,guided,mode});
      fs.writeFileSync(file,Buffer.from(encoded.base64,'base64'));await readVideo(page,file,encoded.frames*.5);
    }
    // Abort and unavailable-codec paths must reject, not return partial downloads.
    const failures=await page.evaluate(async(source)=>{
      const steps=window.Storyboard.build(source.events,source.statements,source.source_code),options={steps,source:source.source_code,concept:'Graph',mode:'picture',guided:false,holdMs:500};
      const controller=new AbortController();let cancelled=false;
      try{await window.VisualizationVideo.exportVideo(options,{signal:controller.signal,onProgress:()=>controller.abort()});}catch(error){cancelled=error.name==='AbortError';}
      const original=window.VideoEncoder;window.VideoEncoder=undefined;let unsupported=false;
      try{await window.VisualizationVideo.exportVideo(options);}catch(error){unsupported=error.message.includes('WebCodecs');}finally{window.VideoEncoder=original;}
      return {cancelled,unsupported};
    },cases.graph);
    assert.deepEqual(failures,{cancelled:true,unsupported:true});assert.deepEqual(errors,[]);
    console.log(`Passed: combined Play/Pause, automatic playback completion, mobile controls, actual WebM download (${elapsed} ms), decoding, duration, seeking to final frame, guided/graph/tree/matrix/columns exports, cancellation and unsupported browsers. Artifacts: ${artifacts}`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(server.listening)server.close();});
