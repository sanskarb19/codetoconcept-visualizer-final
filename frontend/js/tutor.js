/* Figures explain recorded effects, rather than asking learners to read debugger events. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const plain=window.LearningStudio.unwrap;
  const text=window.Storyboard.valueText;
  const visible=values=>Object.entries(values).filter(([,v])=>v && !['object','elided'].includes(v.__type__));
  const number=v=>['int','float'].includes(v?.__type__) && typeof v.value==='number' && Number.isFinite(v.value);
  const typeLabel=v=>({int:'whole number',float:'decimal number',str:'text',bool:'yes / no value',list:'ordered items',tuple:'fixed sequence',set:'unique items',dict:'key → value lookup',matrix:'rows × columns',none:'no value'})[v?.__type__]||v?.class||'value';
  function box(name,value,cls='') {
    return `<div class="named-box ${cls}"><span class="box-name">${esc(name)}</span><strong>${esc(text(value))}</strong><small>${value===undefined?'does not exist yet':esc(typeLabel(value))}</small></div>`;
  }
  function miniValue(value) {
    if(!value)return '<span class="empty-value">not created yet</span>';
    if(['list','tuple','set'].includes(value.__type__))return `<div class="mini-cells">${value.value.slice(0,16).map((v,i)=>`<span><small>${i}</small>${esc(text(v))}</span>`).join('')||'<span>empty</span>'}</div>`;
    if(['dict','instance'].includes(value.__type__)) {
      const attrs=value.value||{};
      if(attrs.value || attrs.val || attrs.data || attrs.key) return `<div class="mini-node"><b>${esc(text(attrs.value??attrs.val??attrs.data??attrs.key))}</b><div>${['left','right','next'].filter(name=>attrs[name]&&attrs[name].__type__!=='none').map(name=>`<span>${name} → ${esc(text(attrs[name].value?.value??attrs[name].value?.val??attrs[name].value?.data))}</span>`).join('')||'<small>No children yet</small>'}</div></div>`;
      return `<div class="mini-lookup">${Object.entries(attrs).slice(0,6).map(([name,v])=>`<div><b>${esc(name)}</b><span>→</span><span>${esc(text(v))}</span></div>`).join('')||'<span>empty lookup</span>'}${Object.keys(attrs).length>6?'<small>More entries appear in the picture below.</small>':''}</div>`;
    }
    if(value.__type__==='matrix')return `<div class="mini-cells">${value.value.slice(0,4).map(row=>`<span>${row.slice(0,4).map(esc).join(' · ')}</span>`).join('')}</div>`;
    return `<strong class="large-value">${esc(text(value))}</strong>`;
  }
  function changedFigure(step) {
    if(!step.changes.length)return '';
    return `<div class="before-after">${step.changes.slice(0,4).map(change=>`<div class="change-pair"><div><span class="figure-label">BEFORE · ${esc(change.name)}</span>${miniValue(change.before)}</div><span class="change-arrow">→</span><div class="change-result"><span class="figure-label">AFTER · ${esc(change.name)}</span>${miniValue(change.after)}</div></div>`).join('')}</div>`;
  }
  function equation(step) {
    const expr=step.meta.expression, change=step.changes.find(c=>step.meta.targets?.includes(c.name));
    if(!expr || !change || !['int','float','str','bool'].includes(change.after?.__type__))return '';
    const inputs=expr.kind==='binary'?[expr.left,expr.right]:[expr];
    return `<div class="equation-figure"><div class="equation-inputs">${inputs.map((input,i)=>`${i?`<span class="math-operator">${esc(expr.op)}</span>`:''}<div class="operand-card"><small>${esc(input.kind==='name'?input.name:'value / expression')}</small><strong>${esc(window.Storyboard.expressionText(input,step.before))}</strong></div>`).join('')}</div><span class="math-operator">→</span>${box(change.name,change.after,'result-box')}</div><p class="figure-caption">Read the inputs → perform this expression → store the recorded result.</p>`;
  }
  function decisionFigure(step) {
    const expr=window.Storyboard.expressionText(step.meta.expression,step.before);
    const result=step.decision;
    return `<div class="decision-figure"><div class="condition-diamond"><div><small>CHECK</small><strong>${esc(expr)}</strong></div></div><div class="decision-branches"><div class="decision-arm ${result===true?'chosen':'skipped'}"><b>YES</b><span>${result===true?`Follow line ${step.next.line_number}`:'Do not take this path'}</span></div><div class="decision-arm ${result===false?'chosen':'skipped'}"><b>NO</b><span>${result===false?`Follow line ${step.next.line_number}`:'Do not take this path'}</span></div></div></div>${result===null?'<p class="figure-caption">The condition is still running; a later instruction will show the chosen path.</p>':'<p class="figure-caption">The solid path is the one the program actually followed.</p>'}`;
  }
  function loopFigure(step) {
    const done=step.decision===false;
    const changes=step.changes.filter(c=>number(c.after)||c.name===step.meta.target);
    return `<div class="loop-figure"><div class="round-badge"><small>${done?'EXIT':'ROUND'}</small><strong>${done?'✓':step.visit}</strong></div><div class="loop-road"><div class="loop-stop ${!done?'chosen':''}"><b>1</b><span>${step.meta.kind==='for'?`Take next ${esc(step.meta.target||'item')}`:'Check the condition'}</span></div><span>→</span><div class="loop-stop ${!done?'chosen':''}"><b>2</b><span>${done?'Skip the body':'Run the body'}</span></div><span>↻</span><div class="loop-stop"><b>3</b><span>${done?'Continue after the loop':'Come back for another check'}</span></div></div></div>${changes.map(c=>`<div class="loop-input">This round: ${box(c.name,c.after,'result-box')}</div>`).join('')}`;
  }
  function functionFigure(step) {
    if(step.kind==='enter')return `<div class="function-figure"><div class="function-caller">${esc(step.event.function==='<module>'?'Main program':step.event.function)}<small>waiting here</small></div><span class="change-arrow">→</span><div class="function-room"><span class="figure-label">${esc(step.next.function)}() · INPUTS</span><div class="memory-boxes">${visible(step.parameters||{}).slice(0,5).map(([name,value])=>box(name,value)).join('')||'<p>No input values</p>'}</div></div></div>`;
    const initializing=step.kind==='resume'&&step.event.function==='__init__';
    const result=initializing?step.changes.find(c=>c.after?.__type__==='instance')?.after:step.returnValue??step.next.return_value;
    return `<div class="function-figure"><div class="function-room"><span class="figure-label">${initializing?'NEW OBJECT':`${esc(step.event.function)}() · RETURN VALUE`}</span>${miniValue(result)}</div><span class="change-arrow">→</span><div class="function-caller">${step.kind==='resume'?'Caller receives this value':'Send to the caller'}</div></div>${changedFigure(step)}`;
  }
  function instructionFigure(step) {
    if(step.exception)return `<div class="problem-figure"><span>!</span><div><b>${esc(step.exception.type)}</b><p>${esc(step.exception.message)}</p><small>The program raised an exception here. A later instruction may handle it.</small></div></div>`;
    if(step.kind==='enter'||step.kind==='resume'||step.meta.kind==='return')return functionFigure(step);
    if(step.meta.kind==='if')return decisionFigure(step);
    if(['for','while'].includes(step.meta.kind))return loopFigure(step);
    if(step.output)return `<div class="print-figure"><div>${step.meta.arguments?.map(a=>`<span>${esc(window.Storyboard.expressionText(a,step.before))}</span>`).join('')||'<span>This line</span>'}</div><span class="change-arrow">→</span><div class="printed-paper"><small>TEXT THE PROGRAM PRINTED</small><pre>${esc(step.output)}</pre></div></div>`;
    const formula=equation(step);if(formula)return formula;
    if(step.changes.length)return changedFigure(step);
    if(['functiondef','classdef'].includes(step.meta.kind))return `<div class="definition-figure"><span>≡</span><div><strong>${esc(step.meta.name)}</strong><p>Instructions saved for later</p></div><span>→</span><div><strong>Ready to use</strong><p>The body has not been called yet</p></div></div>`;
    return `<div class="instruction-path"><span>Line ${step.line}</span><b>→</b><span>${esc(step.next.function)} · line ${step.next.line_number}</span><small>Continue along the recorded execution path</small></div>`;
  }
  function columns(step,selected) {
    const list=step.after[selected];
    let values=visible(step.after).filter(([,v])=>number(v)).map(([name,v])=>({name,value:v.value,before:step.before[name]?.value}));
    if(['list','tuple'].includes(list?.__type__) && list.value.every(number))values=list.value.map((v,i)=>({name:`[${i}]`,value:v.value,before:step.before[selected]?.value[i]?.value}));
    if(list?.__type__==='dict' && Object.values(list.value).every(number))values=Object.entries(list.value).map(([name,v])=>({name,value:v.value,before:step.before[selected]?.value[name]?.value}));
    values=values.slice(0,18);
    if(!values.length)return '<div class="figure-empty">Value columns compare numbers.<br><small>Choose a numeric list, or use Named boxes for strings and objects.</small></div>';
    const max=Math.max(1,...values.flatMap(v=>[Math.abs(v.value),Math.abs(typeof v.before==='number'?v.before:0)]));
    const negative=values.some(v=>v.value<0 || v.before<0), baseline=negative?150:220, scale=(negative?115:180)/max;
    const gap=620/values.length, width=Math.min(48,gap*.65);
    return `<div class="column-chart"><svg viewBox="0 0 680 285" role="img" aria-label="Value columns: ${esc(values.map(v=>`${v.name} ${v.value}`).join(', '))}"><line x1="25" x2="660" y1="${baseline}" y2="${baseline}" stroke="#acb9ca"/><text x="14" y="${baseline-5}" class="axis-label">0</text>${values.map((v,i)=>{
      const x=35+i*gap+(gap-width)/2, h=Math.max(2,Math.abs(v.value)*scale), y=v.value<0?baseline:baseline-h;
      const bh=Math.max(2,Math.abs(typeof v.before==='number'?v.before:0)*scale), by=v.before<0?baseline:baseline-bh;
      const changed=v.before!==v.value;
      return `${typeof v.before==='number'?`<rect x="${x-4}" y="${by}" width="${width+8}" height="${bh}" rx="4" fill="#d7dfe9"/>`:''}<rect x="${x}" y="${y}" width="${width}" height="${h}" rx="4" fill="${changed?'#6874df':'#3a9986'}"/><text x="${x+width/2}" y="${v.value<0?y+h+17:y-9}" class="bar-value">${esc(v.value)}</text><text x="${x+width/2}" y="270" class="bar-name">${esc(v.name)}</text>`;
    }).join('')}</svg><div class="chart-key"><span>■ Current value</span><span>■ Grey bar: value before this instruction</span></div></div>`;
  }
  function memory(step) {
    const changed=new Set(step.changes.map(c=>c.name));
    return `<div class="memory-caption">Variables are named boxes. A highlighted box changed in this instruction.</div><div class="memory-boxes">${visible(step.after).slice(0,20).map(([name,value])=>box(name,value,changed.has(name)?'result-box':'')).join('')||'<p>No named values yet.</p>'}</div>`;
  }
  function path(state) {
    const steps=state.teachingSteps, start=Math.max(0,state.lessonIndex-5);
    return `<div class="execution-road">${steps.slice(start,state.lessonIndex+1).map((s,i)=>`<div class="road-instruction ${i===state.lessonIndex-start?'current':''}"><span>${start+i+1}</span><div><small>${esc(s.event.function)} · line ${s.line}</small><code>${esc(s.code.trim())}</code></div></div>${i<state.lessonIndex-start?'<div class="road-arrow">↓</div>':''}`).join('')}</div><p class="figure-caption">Follow this road in order. Repeated lines show loop rounds or repeated calls.</p>`;
  }
  function matrixProof(step,state) {
    const match=step.code.trim().match(/^(\w+)\s*=\s*(\w+)\s*(\.\*|\*)\s*(\w+)\s*;?$/);
    if(!match)return '';
    const a=step.before[match[2]],b=step.before[match[4]],c=step.after[match[1]];
    if([a,b,c].some(v=>v?.__type__!=='matrix'))return '';
    if([a,b,c].some(v=>v.value.length>8||v.value[0].length>8))return '';
    const row=Math.min(state.proofCell?.[0]||0,c.value.length-1),col=Math.min(state.proofCell?.[1]||0,c.value[0].length-1);
    const elementwise=match[3]==='.*';
    function grid(name,matrix,which){return `<div class="proof-matrix"><span class="figure-label">${esc(name)}</span><div style="grid-template-columns:repeat(${matrix.value[0].length},1fr)">${matrix.value.map((r,i)=>r.map((v,j)=>`<button ${which==='result'?`data-result-cell="${i},${j}"`:''} class="${which==='a'&&(elementwise?i===row&&j===col:i===row)||which==='b'&&(elementwise?i===row&&j===col:j===col)||which==='result'&&i===row&&j===col?'selected':''}" title="Row ${i+1}, column ${j+1}">${esc(v)}</button>`).join('')).join('')}</div></div>`;}
    const products=elementwise?[`${a.value[row][col]} × ${b.value[row][col]}`]:a.value[row].map((v,k)=>`${v} × ${b.value[k][col]}`);
    return `<div class="matrix-proof">${grid(match[2],a,'a')}<b>${elementwise?'⊙':'×'}</b>${grid(match[4],b,'b')}<b>→</b>${grid(match[1],c,'result')}</div><div class="matrix-working"><small>${elementwise?'MULTIPLY MATCHING CELLS':`ROW ${row+1} × COLUMN ${col+1}`}</small><strong>${products.map(p=>`(${esc(p)})`).join(' + ')} = ${esc(c.value[row][col])}</strong><span>Click another result cell to see where its value comes from.</span></div>`;
  }
  function render(state) {
    const host=document.querySelector('#learning-story'),visual=document.querySelector('#structure-view'),figure=document.querySelector('#instruction-figure');
    if(!host||!visual||!figure)return;
    const step=state.teachingSteps?.[state.lessonIndex], timeline=document.querySelector('#timeline'),summary=document.querySelector('#run-summary');
    timeline.max=Math.max(0,(state.teachingSteps?.length||0)-1);timeline.value=Math.max(0,state.lessonIndex||0);timeline.disabled=!step;
    document.querySelectorAll('[data-visual-mode]').forEach(button=>{button.disabled=!step;});
    document.querySelector('#step-over-button').hidden=step?.kind!=='enter';
    document.querySelector('.visual-toolbar').hidden=!step;
    if(!step && state.execution?.error) {
      const error=state.execution.error;
      const hints={SyntaxError:'Check the punctuation on this line: colons, quotes and matching brackets.',IndentationError:'Lines inside a loop, condition or function need consistent indentation.',TimeoutError:'Check that loops make progress toward stopping. The run exceeded its time limit.',NameError:'Create the named value before using it.',IndexError:'Check that this position exists in the collection.'};
      const hint=error.message?.startsWith('MATLAB learning mode:')?'This MATLAB expression is outside the supported learning syntax. Follow the specific message below; open Supported syntax under the editor for examples.':hints[error.type]||'Read the error below, edit the code, then visualize it again.';
      host.innerHTML=`<div class="story-kicker">LET’S FIX THE CODE</div><h2>${error.line?`Check line ${error.line}`:'The program could not complete'}</h2><p>${esc(hint)}</p>`;
      figure.innerHTML=`<div class="problem-figure"><span>!</span><div><b>${esc(error.type)}</b><p>${esc(error.message)}</p></div></div>`;
      visual.innerHTML=''; summary.textContent='Edit the source, then click Visualize code to try again.'; return;
    }
    if(!step){
      host.innerHTML=`<div class="story-kicker">CODE, EXPLAINED WITH PICTURES</div><h2>What does a line of code actually do?</h2><p>Start with Adding numbers above, or run your own code. Each click shows one instruction and the result it produced.</p>`;
      figure.innerHTML='<div class="welcome-equation"><div><small>x</small><b>10</b></div><span>+</span><div><small>y</small><b>20</b></div><span>→</span><div class="welcome-result"><small>total</small><b>30</b></div></div><p class="figure-caption">Example picture: read x and y, add them, store the answer in total.</p>';
      visual.innerHTML='<div class="welcome-steps"><span><b>1</b>Choose an example</span><span><b>2</b>See the first instruction</span><span><b>3</b>Click Next instruction</span></div>';
      summary.textContent=state.execution?.error?`${state.execution.error.type}: ${state.execution.error.message}`:'No debugger knowledge needed. Pictures use values recorded from the actual run.';
      return;
    }
    const explanation=window.Storyboard.describe(step),last=state.lessonIndex===state.teachingSteps.length-1;
    host.innerHTML=`<div class="story-kicker"><span>INSTRUCTION ${state.lessonIndex+1} / ${state.teachingSteps.length}</span><span class="action-tag">${esc(explanation.tag)}</span></div><h2>${esc(explanation.title)}</h2><div class="taught-line"><span>LINE ${step.line}</span><code>${esc(step.code.trim())}</code></div><p>${esc(explanation.why)}</p>`;
    figure.innerHTML=matrixProof(step,state)||instructionFigure(step);
    const select=document.querySelector('#structure-variable'),old=select.value;
    const candidates=visible(step.after),collections=candidates.filter(([,v])=>['dict','instance','list','tuple','set','matrix'].includes(v.__type__));
    select.innerHTML='<option value="">All named values</option>'+collections.map(([name])=>`<option>${esc(name)}</option>`).join('');
    const structural=collections.find(([name,v])=>['root','tree','graph','head'].includes(name)&&window.LearningStudio.topology(v,state.concept).nodes.length)||collections.find(([,v])=>window.LearningStudio.topology(v,state.concept).nodes.length);
    const changedCollection=collections.find(([name])=>step.changes.some(c=>c.name===name));
    if(state.structurePinned && (old===''||collections.some(([name])=>name===old)))select.value=old;
    else if(structural)select.value=structural[0];
    else if(changedCollection)select.value=changedCollection[0];
    else if(collections.some(([name])=>name===old))select.value=old;
    else if(collections.length)select.value=collections[0][0];
    const name=select.value,value=step.after[name],before=step.before[name];
    const mode=state.visualMode||'picture';
    const structuralView=window.LearningStudio.topology(value,state.concept).nodes.length>0 && mode==='picture';
    document.querySelector('#directed-toggle').parentElement.hidden=!structuralView;
    document.querySelector('#zoom-range').parentElement.hidden=!structuralView;
    select.parentElement.hidden=!collections.length;
    document.querySelector('.visual-toolbar').hidden=!collections.length && !structuralView;
    document.querySelectorAll('[data-visual-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.visualMode===mode)));
    const stack=step.next.stack||[];
    let picture=window.LearningStudio.diagram(value,state.concept,step.after,document.querySelector('#directed-toggle').checked);
    if(picture && state.concept==='Graph')picture+=`<div class="traversal-state">${step.after.queue?`<div><span class="figure-label">WAITING TO VISIT · QUEUE</span>${miniValue(step.after.queue)}</div>`:''}${step.after.visited?`<div><span class="figure-label">ALREADY VISITED</span>${miniValue(step.after.visited)}</div>`:''}</div>`;
    if(picture && state.concept==='Tree' && step.after.visited)picture+=`<div class="traversal-state"><div><span class="figure-label">TRAVERSAL ORDER SO FAR</span>${miniValue(step.after.visited)}</div></div>`;
    if(!picture && value && ['list','tuple','set','matrix'].includes(value.__type__)){
      picture=`<div class="data-picture-title">${esc(name)} <small>after this instruction</small></div>`+window.LearningStudio.collection(value,name,step.after,state.concept,before);
      if(before && ['list','tuple'].includes(value.__type__)){
        const indexes=value.value.map((v,i)=>!equal(v,before.value?.[i])?i:null).filter(i=>i!==null);
        picture+=`<p class="figure-caption">${indexes.length?`Changed positions: ${indexes.join(', ')}. Index 0 means the first item.`:value.value.length!==before.value?.length?'The collection length changed.':'The collection stays the same in this instruction.'}</p>`;
      }
    }
    if(!picture && value?.__type__==='dict')picture=`<div class="memory-caption">A dictionary looks up values using keys. Each row connects one key to its recorded value.</div><div class="lookup-table"><div><b>KEY · look for this</b><b>VALUE · get this back</b></div>${Object.entries(value.value).slice(0,25).map(([key,v])=>`<div><span>${esc(key)}</span><span>${esc(text(v))}</span></div>`).join('')||'<p>No keys yet.</p>'}</div>`;
    if(!picture && ['Functions','Recursion'].includes(state.concept)&&stack.length>1)picture=`<div class="call-ladder">${stack.map((f,i)=>`<div><span>${i===0?'Main program':`Call ${i}`}</span><strong>${esc(f.function)}</strong><small>line ${f.line}</small></div>${i<stack.length-1?'<b>↓ calls</b>':''}`).join('')}</div>`;
    visual.innerHTML=mode==='columns'?columns(step,name):mode==='memory'?memory(step):mode==='path'?path(state):picture||columns(step,name);
    const svg=visual.querySelector('.structure-svg');if(svg)svg.style.width=`${document.querySelector('#zoom-range').value}%`;
    summary.innerHTML=`<span>${last?'✓ Walkthrough complete':`Next: ${esc(state.teachingSteps[state.lessonIndex+1]?.code.trim()||'finish')}`}</span><span>${state.teachingSteps.length} instructions${document.querySelector('#experience-select').value==='expert'?` · ${state.events.length} captured events`:''}</span>`;
  }
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  window.LearningStudio.render=render;
  window.TutorFigures={columns,instructionFigure,matrixProof};
})();
