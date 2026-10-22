/* A small lesson inside each recorded instruction. Results always come from the trace. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S=window.Storyboard, plain=window.LearningStudio.unwrap;
  const names=expr=>!expr?[]:expr.kind==='name'?[expr.name]:expr.kind==='binary'?[...names(expr.left),...names(expr.right)]:expr.names||[];
  const sourceExpr=expr=>!expr?'this instruction':expr.kind==='name'?expr.name:expr.kind==='literal'?JSON.stringify(expr.value):expr.kind==='binary'?`(${sourceExpr(expr.left)} ${expr.op} ${sourceExpr(expr.right)})`:/__mat\(/.test(expr.text)?'matrix entries from your code':/__colon\(/.test(expr.text)?'the range written in your loop':expr.text;
  const expressionText=(expr,step)=>expr?.text?.includes('__')?step.code.trim():S.expressionText(expr,step.before);
  function sync(state,step) {
    state.study ||= {mode:'guided',phase:0};
    if(state.study.step!==step)Object.assign(state.study,{step,phase:0,revealed:false,answer:'',feedback:null,node:null});
    return state.study;
  }
  function inputs(step) {
    if(step.kind==='enter')return Object.entries(step.parameters||{}).filter(([name,value])=>name!=='self'&&value?.__type__!=='object').map(([name,value])=>({name,value}));
    const referenced=[...new Set([...names(step.meta.expression),...(step.meta.arguments||[]).flatMap(names)])];
    return referenced.filter(name=>step.before[name]!==undefined&&step.before[name].__type__!=='object').map(name=>({name,value:step.before[name]}));
  }
  function task(step) {
    if(step.exception || step.kind==='enter')return null;
    if(step.meta.kind==='if' && step.decision!==null)return {question:'Will the program take the YES branch?',answer:step.decision,type:'boolean',label:'YES or NO'};
    const c=step.changes.find(change=>step.meta.targets?.includes(change.name));
    if(c && ['int','float','str','bool'].includes(c.after?.__type__))return {question:`What value will ${c.name} hold after this line?`,answer:plain(c.after),type:c.after.__type__,label:'Your predicted value'};
    if(c && ['list','tuple','set','matrix'].includes(c.after?.__type__))return {question:`How many ${c.after.__type__==='matrix'?'rows':'items'} will ${c.name} contain after this line?`,answer:c.after.value.length,type:'int',label:'Your predicted count'};
    return null;
  }
  function grade(task,answer) {
    if(!task)return null;
    const raw=answer.trim();
    if(!raw)return {correct:false,message:'Enter a prediction first, or reveal the result.'};
    let guess=raw;
    if(['int','float'].includes(task.type))guess=Number(raw);
    if(['boolean','bool'].includes(task.type))guess=/^(yes|true|1)$/i.test(raw)?true:/^(no|false|0)$/i.test(raw)?false:raw;
    if(task.type==='str' && /^(["']).*\1$/s.test(raw))guess=raw.slice(1,-1);
    const correct=typeof task.answer==='number'?Number.isFinite(guess)&&Math.abs(guess-task.answer)<=Math.max(1,Math.abs(task.answer))*1e-9:guess===task.answer;
    return {correct,message:correct?'You got it. Compare your reasoning with the recorded result below.':`Your prediction was ${raw}. The recorded answer is ${String(task.answer)}. Compare the inputs and the work below.`};
  }
  function read(step) {
    const values=inputs(step);
    return `<div class="input-deck">${values.map(({name,value})=>`<div><small>READ ${esc(name)}</small><strong>${esc(S.valueText(value))}</strong><span>value before this line</span></div>`).join('')||`<div><small>START WITH THE CODE</small><strong>${esc(sourceExpr(step.meta.expression||step.meta.arguments?.[0]))}</strong><span>${['functiondef','classdef'].includes(step.meta.kind)?'Save these instructions for later.':'These inputs are written directly in the instruction.'}</span></div>`}</div>`;
  }
  function working(step) {
    const expr=step.meta.expression, op=expr?.op;
    let explanation='Carry out the instruction using the input values above.';
    if(['assign','annassign','augassign'].includes(step.meta.kind))explanation='Work out the right side first. Then store that result in the name on the left. The = sign stores a value.';
    if(step.meta.kind==='if')explanation='Compare the two sides. YES enters the if block; NO follows the other path.';
    if(['for','while'].includes(step.meta.kind))explanation='Check whether another round is possible. Run the indented body for that round, then come back to this line.';
    if(step.kind==='enter')explanation='Pass the inputs into the function. The caller waits until that function finishes.';
    if(step.output)explanation='Send the expression to the printed output. Printing displays values; it does not put them into a new variable.';
    const words={'+':'add','−':'subtract','×':'multiply','÷':'divide','^':'raise to a power','.^':'raise each cell to a power','==':'compare for equality','>':'check greater than','<':'check less than','≥':'check at least','≤':'check at most','%':'find the remainder'};
    let extra='';
    if(['^','.^'].includes(op) && expr.right.kind==='literal' && Number.isInteger(expr.right.value) && expr.right.value>=1 && expr.right.value<=8 && expr.left.kind!=='binary') {
      const base=S.expressionText(expr.left,step.before);
      extra=`<p class="worked-expansion">${Array(expr.right.value).fill(esc(base)).join(' <b>×</b> ')}${op==='.^'?' <small>independently in each cell</small>':''}</p>`;
    }
    function tree(node,depth=0) {
      if(!node||depth>4)return '';
      if(node.kind==='binary')return `<div class="expression-branch"><div class="expression-children">${tree(node.left,depth+1)}${tree(node.right,depth+1)}</div><div class="expression-operator">${esc(node.op)}</div></div>`;
      return `<div class="expression-leaf"><small>${esc(sourceExpr(node))}</small><strong>${esc(expressionText(node,step))}</strong></div>`;
    }
    const diagram=expr?.kind==='binary'?`<div class="expression-map"><span class="figure-label">EXPRESSION MAP · FOLLOW THE BRANCHES DOWN</span>${tree(expr)}<p>Resolve inner branches first. Their results feed the next operation.</p></div>`:'';
    const meanings={'=':'Store the right-side value in the left-side variable.','+':'Add numbers, or join strings and lists.','−':'Subtract the right value from the left.','×':'Multiply values; MATLAB * uses matrix multiplication.','÷':'Divide the left value by the right.','^':'Raise to a power. In MATLAB, A^2 means A * A.','.^':'Raise each matrix cell independently.','==':'Ask whether the values are equal.','!=':'Ask whether the values differ.','>':'Ask whether the left is greater.','<':'Ask whether the left is smaller.','≥':'Ask whether the left is greater or equal.','≤':'Ask whether the left is smaller or equal.','%':'Return the remainder after division.'};
    const symbols=[...new Set([...(['assign','annassign','augassign'].includes(step.meta.kind)?['=']:[]),...(op&&meanings[op]?[op]:[])])];
    const glossary=symbols.length?`<details class="symbol-help"><summary>Explain the symbols in this line</summary>${symbols.map(symbol=>`<div><b>${esc(symbol)}</b><p>${esc(meanings[symbol])}</p></div>`).join('')}</details>`:'';
    return `<div class="working-card"><small>${esc(words[op]||'FOLLOW THE INSTRUCTION')}</small><code>${esc(expressionText(expr,step)||step.code.trim())}</code>${extra}<p>${esc(explanation)}</p></div>${diagram}${glossary}`;
  }
  function view(step,study) {
    const quiz=task(step), hidden=study.mode==='guided'?study.phase<2:study.mode==='predict'&&!study.revealed;
    let html='';
    if(study.mode==='guided')html=`<div class="micro-road">${['Read inputs','Do the work','See result'].map((label,i)=>`<button data-study-action="phase" data-phase="${i}" aria-pressed="${study.phase===i}"><b>${i+1}</b>${label}</button>`).join('')}</div>${study.phase===0?read(step):study.phase===1?working(step):'<p class="revealed-note">This is the result captured from the actual run. Compare it with the inputs.</p>'}${study.phase<2?`<button class="study-primary" data-study-action="advance">${study.phase===0?'Now show the work':'Now show the result'} →</button>`:''}`;
    if(study.mode==='predict')html=`<div class="prediction-card"><span class="figure-label">PAUSE AND THINK</span><h3>${esc(quiz?.question||'What do you expect this instruction to do?')}</h3>${read(step)}${study.feedback?`<p class="prediction-feedback ${study.feedback.correct?'correct':''}" role="status">${esc(study.feedback.message)}</p>`:''}${!study.revealed?`${quiz?`<label>${esc(quiz.label)}<input id="prediction-answer" autocomplete="off" value="${esc(study.answer)}" placeholder="Make your prediction"></label><button class="study-primary" data-study-action="check">Check my prediction</button>`:''}<button class="study-secondary" data-study-action="reveal">Reveal the result</button>`:working(step)}</div>`;
    return {html,hidden};
  }
  function history(state,name=state.historyName||'') {
    const current=state.teachingSteps[state.lessonIndex],frame=current.kind==='resume'?current.next.frame_id:current.event.frame_id;
    const rows=[];
    state.teachingSteps.slice(0,state.lessonIndex+1).forEach((step,i)=>{
      const f=step.kind==='resume'?step.next.frame_id:step.event.frame_id;
      if(f!==frame)return;
      for(const c of step.changes)rows.push({index:i,line:step.line,...c});
    });
    const variables=[...new Set(rows.map(r=>r.name))];
    if(!variables.includes(name))name='';
    const filtered=rows.filter(r=>!name||r.name===name), numeric=filtered.filter(r=>['int','float'].includes(r.after?.__type__)&&Number.isFinite(r.after.value)).slice(-30);
    let trend='';
    if(name&&numeric.length>1){
      const min=Math.min(...numeric.map(r=>r.after.value)),max=Math.max(...numeric.map(r=>r.after.value));
      const points=numeric.map((r,i)=>`${25+i*550/(numeric.length-1)},${110-(r.after.value-min)*80/(max-min||1)}`).join(' ');
      trend=`<svg class="value-trend" viewBox="0 0 600 145" role="img" aria-label="${esc(name)} changed through ${esc(numeric.map(r=>r.after.value).join(', '))}"><polyline points="${points}" fill="none" stroke="#5968cc" stroke-width="3"/>${numeric.map((r,i)=>`<circle cx="${25+i*550/(numeric.length-1)}" cy="${110-(r.after.value-min)*80/(max-min||1)}" r="4" fill="#5968cc"><title>Line ${r.line}: ${r.after.value}</title></circle>`).join('')}<text x="25" y="140">Earlier changes</text><text x="470" y="140">Current change</text></svg>`;
    }
    return `<div class="history-intro"><h3>How values got here</h3><p>Each row records a change in this function, up to the selected instruction. Click a row to revisit it.</p><label>Follow a variable <select id="history-variable"><option value="">All changes</option>${variables.map(n=>`<option value="${esc(n)}" ${n===name?'selected':''}>${esc(n)}</option>`).join('')}</select></label></div>${trend}<div class="history-table"><div><b>LINE</b><b>NAME</b><b>BEFORE → AFTER</b></div>${filtered.slice(-30).map(r=>`<button data-history-index="${r.index}"><span>${r.line}</span><strong>${esc(r.name)}</strong><span>${esc(S.valueText(r.before))} <b>→</b> ${esc(S.valueText(r.after))}</span></button>`).join('')||'<p>No recorded changes here yet.</p>'}</div>${filtered.length>30?'<p>Showing the latest 30 changes.</p>':''}`;
  }
  function graphInspector(state,step) {
    const selected=document.querySelector('#structure-variable').value, value=step.after[selected];
    const topology=window.LearningStudio.topology(value,state.concept);
    if(!topology.nodes.length)return '';
    const id=state.study.node, node=topology.nodes.find(n=>n.id===id);
    const legend='<div class="connection-help"><b>Read this diagram</b><span>A circle is a node. A line connects two nodes. Yellow means current; green means visited. Click a node to inspect its connections.</span></div>';
    if(!node)return legend;
    const neighbors=topology.edges.filter(e=>e.from===id || !document.querySelector('#directed-toggle').checked&&e.to===id).map(e=>topology.nodes.find(n=>n.id===(e.from===id?e.to:e.from))?.label).filter(Boolean);
    return `${legend}<div class="node-inspector"><h3>Node ${esc(node.label)}</h3><p>${esc(state.concept==='Tree'?'Connected parent / children':'Connected neighbors')}: ${esc([...new Set(neighbors)].join(', ')||'none')}</p>${node.depth!==undefined?`<p>Level ${node.depth}: ${node.depth===0?'the root':'distance from the root in this tree'}.</p>`:''}</div>`;
  }
  function programMap(state) {
    const source=state.execution?.source_code?.split(/\r?\n/)||[],statements=state.execution?.statements||{};
    const labels={assign:'Store a value',annassign:'Store a value',augassign:'Update a value',if:'Choose a branch',for:'Repeat for each item',while:'Repeat while the condition holds',functiondef:'Define instructions for a function',classdef:'Define an object blueprint',return:'Send a result to the caller',expr:'Call an operation',break:'Leave the loop',continue:'Start the next loop round',pass:'Close / continue this block'};
    const entries=Object.entries(statements).sort((a,b)=>Number(a[0])-Number(b[0]));
    return `<div class="history-intro"><h3>The program at a glance</h3><p>Read each block to understand its purpose. Counts describe this recorded run; unvisited lines are marked. Click a reached line to explore its first instruction.</p></div><div class="program-map">${entries.slice(0,80).map(([line,meta])=>{
      const reached=state.teachingSteps.map((s,i)=>({s,i})).filter(({s})=>s.line===Number(line)&&s.kind!=='resume'),indent=(source[Number(line)-1]?.match(/^\s*/)?.[0].length||0);
      const purpose=['print','__disp'].includes(meta.call)?'Display output':labels[meta.kind]||'Run an instruction';
      return `<button ${reached.length?`data-history-index="${reached[0].i}"`:'disabled'} class="${Number(line)===state.teachingSteps[state.lessonIndex]?.line?'current':''}" style="margin-left:${Math.min(indent*4,64)}px"><span>${esc(line)}</span><div><strong>${esc(purpose)}</strong><code>${esc(source[Number(line)-1]?.trim())}</code></div><small>${reached.length?`${reached.length} instruction${reached.length===1?'':'s'}`:'Not reached'}</small></button>`;
    }).join('')}</div>${entries.length>80?'<p>Showing the first 80 source instructions.</p>':''}`;
  }
  function enhance(state) {
    const step=state.teachingSteps?.[state.lessonIndex],study=sync(state,step);
    const controls=document.querySelector('#study-controls'),work=document.querySelector('#guided-work');
    if(!controls||!work)return;
    controls.innerHTML=`<span>LEARN THIS LINE</span><div>${[['guided','Walk me through'],['predict','Let me predict'],['all','Show everything']].map(([mode,label])=>`<button data-study-action="mode" data-mode="${mode}" aria-pressed="${study.mode===mode}">${label}</button>`).join('')}</div>`;
    controls.hidden=!step;work.hidden=!step;
    document.body.classList.remove('conceal-outcome');
    document.querySelector('#instruction-figure').hidden=false;document.querySelector('#structure-view').hidden=false;
    document.querySelector('.picture-tabs').hidden=false;
    if(!step){work.innerHTML='';return;}
    const lesson=view(step,study);work.innerHTML=lesson.html;
    document.body.classList.toggle('conceal-outcome',lesson.hidden);
    for(const selector of ['#instruction-figure','#structure-view','.picture-tabs','.visual-toolbar'])document.querySelector(selector).hidden=lesson.hidden||selector==='.visual-toolbar'&&document.querySelector(selector).hidden;
    if(lesson.hidden){
      document.querySelector('#learning-story').innerHTML=`<div class="story-kicker">INSTRUCTION ${state.lessonIndex+1} / ${state.teachingSteps.length}</div><h2>${study.mode==='predict'?'Can you work it out?':study.phase===0?'What does this line use?':'What does the computer do?'}</h2><div class="taught-line"><span>LINE ${step.line}</span><code>${esc(step.code.trim())}</code></div>`;
      document.querySelector('#run-summary').textContent='Explore this line, then reveal its recorded result.';
    } else if(state.visualMode==='history')document.querySelector('#structure-view').innerHTML=history(state);
    else if(state.visualMode==='code')document.querySelector('#structure-view').innerHTML=programMap(state);
    else if(state.visualMode==='picture'){
      document.querySelector('#structure-view').insertAdjacentHTML('beforeend',graphInspector(state,step));
      document.querySelectorAll('[data-node-id]').forEach(node=>node.classList.toggle('inspected',node.dataset.nodeId===study.node));
    }
    const next=document.querySelector('#next-button');
    next.disabled=state.busy||!lesson.hidden&&state.lessonIndex>=state.teachingSteps.length-1;
    const label=lesson.hidden?study.mode==='predict'?'Reveal result':study.phase===0?'Show the work':'Show the result':'Next instruction';
    next.textContent=label;next.setAttribute('aria-label',label);
  }
  function advance(state) {
    const study=sync(state,state.teachingSteps[state.lessonIndex]);
    if(study.mode==='guided'&&study.phase<2){study.phase++;return true;}
    if(study.mode==='predict'&&!study.revealed){study.revealed=true;return true;}
    return false;
  }
  function handle(button,state) {
    const step=state.teachingSteps[state.lessonIndex],study=sync(state,step);
    switch(button.dataset.studyAction) {
      case 'mode': Object.assign(study,{mode:button.dataset.mode,phase:0,revealed:false,feedback:null});break;
      case 'phase': study.phase=Number(button.dataset.phase);break;
      case 'advance': advance(state);break;
      case 'reveal': study.revealed=true;break;
      case 'check': study.feedback=grade(task(step),study.answer||'');study.revealed=!!study.answer?.trim();break;
    }
  }
  const original=window.LearningStudio.render;
  window.LearningStudio.render=(state,...args)=>{original(state,...args);enhance(state);};
  window.GuidedLesson={sync,inputs,task,grade,view,history,programMap,advance,handle};
})();
