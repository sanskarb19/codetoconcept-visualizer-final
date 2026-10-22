/* Turn before-line snapshots into actions with observed outcomes. Never eval code. */
(() => {
  'use strict';
  const scope = event => ({...event?.globals, ...event?.locals});
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const delta = (before,after) => [...new Set([...Object.keys(before),...Object.keys(after)])]
    .filter(name=>!equal(before[name],after[name]))
    .filter(name=>![before[name]?.__type__,after[name]?.__type__].includes('object'))
    .map(name=>({name,before:before[name],after:after[name]}));
  function build(events,statements={},source='') {
    const steps=[], lines=source.split(/\r?\n/), visits=new Map();
    events.forEach((event,index)=>{
      const next=events[index+1];
      if(event.event==='line' && next) {
        const meta=statements[event.line_number]||{}, key=`${event.frame_id}:${event.line_number}`;
        const visit=(visits.get(key)||0)+1; visits.set(key,visit);
        const entering=next.event==='call' && next.frame_id!==event.frame_id;
        const same=next.frame_id===event.frame_id;
        const before=scope(event), after=same?scope(next):{...before,...next.globals};
        const decision=['if','while','for'].includes(meta.kind) && same && ['line','return'].includes(next.event)
          ? (meta.body_lines||[]).includes(next.line_number) : null;
        if (['for','while'].includes(meta.kind) && decision===false) visits.set(key,0);
        steps.push({kind:entering?'enter':'line',before,after,changes:delta(before,after),
          line:event.line_number,code:lines[event.line_number-1]||'',meta,visit,decision,
          event,next,rawIndex:index,snapshotIndex:index+1,parameters:entering?next.locals:null,
          output:(next.stdout||'').startsWith(event.stdout||'')?(next.stdout||'').slice((event.stdout||'').length):'',
          exception:next.event==='exception'?next.exception:null});
      } else if(event.event==='return' && next && !['call','exception'].includes(next.event) && !(events[index-1]?.event==='exception'&&events[index-1].frame_id===event.frame_id) && next.call_depth<event.call_depth && event.function!=='<module>' && next.frame_id!==event.frame_id) {
        // The caller's last snapshot is the correct before state for its result assignment.
        let caller=null;
        for(let i=index-1;i>=0;i--)if(events[i].frame_id===next.frame_id){caller=events[i];break;}
        const before=scope(caller),after=scope(next);
        steps.push({kind:'resume',before,after,changes:delta(before,after),line:caller?.line_number||event.line_number,
          code:lines[(caller?.line_number||event.line_number)-1]||'',meta:statements[caller?.line_number]||{},
          event,next,rawIndex:index,snapshotIndex:index+1,returnValue:event.return_value,output:''});
      }
    });
    return steps;
  }
  function valueText(value) {
    if(value===undefined)return 'not created';
    const v=window.LearningStudio ? window.LearningStudio.unwrap(value) : value?.value;
    if(v===null)return 'None';
    if(typeof v==='boolean')return v?'True':'False';
    if(typeof v==='object')return JSON.stringify(v);
    return typeof v==='string'?JSON.stringify(v):String(v);
  }
  function describe(step) {
    const {meta={},changes=[],before,after}=step, target=meta.targets?.join(', '), change=changes.find(c=>meta.targets?.includes(c.name))||changes[0];
    if(step.exception)return {title:'This line hit a problem',why:`${step.exception.type}: ${step.exception.message}`,tag:'ERROR'};
    if(step.kind==='enter')return {title:`Go inside ${step.next.function}()`,why:`To finish this line, the program first runs ${step.next.function}. The values below are its inputs. The caller waits for the result.`,tag:'FUNCTION CALL'};
    if(step.kind==='resume')return step.event.function==='__init__'?{title:'The new object is ready',why:'Initialization finished. Calling the class gives the caller its newly created object; __init__ itself returns None.',tag:'OBJECT CREATED'}:{title:`${step.event.function} sends its result back`,why:`The function returned ${valueText(step.returnValue)}.${change?` The waiting caller now stores ${valueText(change.after)} in ${change.name}.`:' Execution continues in the caller.'}`,tag:'RETURN TO CALLER'};
    if(['assign','annassign','augassign'].includes(meta.kind)) {
      let why='The assignment completed. This snapshot shows the values it left behind.';
      if(change) {
        const v=change.after,verb=change.before===undefined?'Create':'Update';
        why=v?.__type__==='matrix'?`${verb} ${change.name} with ${v.shape?.[0]||v.value.length} rows and ${v.shape?.[1]||v.value[0]?.length} columns. The figure shows how its values are formed.`
          : ['list','tuple','set'].includes(v?.__type__)?`${verb} the collection ${change.name}. It now holds ${v.value.length} items; the picture shows their positions.`
          : ['dict','instance'].includes(v?.__type__)?`${verb} ${change.name}. The figure connects its recorded values so you can see the structure.`
          : `${change.before===undefined?'Create a named box':'Update the named box'} ${change.name}. ${change.before===undefined?'Its value is':`Replace ${valueText(change.before)} with`} ${valueText(v)}.`;
      }
      if(change && ['^','.^'].includes(meta.expression?.op)) {
        const matrix=change.after?.__type__==='matrix';
        const action=meta.expression.op==='.^'?'Raise each input cell to its exponent independently.':matrix?'Use repeated matrix multiplication; exponent zero produces the identity matrix.':'Raise the base to the exponent; for example, 2 ^ 3 means 2 × 2 × 2.';
        why=`${action} Store the recorded result in ${change.name}.`;
      }
      return {title:change?`${change.name} ${change.before===undefined?'gets its first value':'changes'}`:`Store a value in ${target||'memory'}`,why,tag:'ASSIGNMENT'};
    }
    if(meta.kind==='if')return {title:step.decision===true?'The answer is YES':step.decision===false?'The answer is NO':'Check a condition',why:step.decision===true?`The program entered the if block on line ${step.next.line_number}.`:step.decision===false?`The program skipped the if block and moved to line ${step.next.line_number}.`:'The next captured action shows which path execution takes.',tag:'DECISION'};
    if(['for','while'].includes(meta.kind))return {title:step.decision===false?'The loop is finished':`Loop round ${step.visit}`,why:step.decision===false?'There are no more iterations of this loop. Execution moves past its body.':meta.kind==='for'?`${meta.target||'The loop variable'} is ${valueText(after[meta.target])}. Run the body once with this value.`:'The condition allowed another trip through the loop body.',tag:'LOOP'};
    if(meta.kind==='return')return {title:`Send ${valueText(step.next.return_value)} back`,why:'This function finishes here. Its return value goes to the code that called it.',tag:'RETURN'};
    if(['functiondef','asyncfunctiondef'].includes(meta.kind))return {title:`Remember how to run ${meta.name}()`,why:'Defining a function saves its instructions. Its body runs only when the function is called.',tag:'FUNCTION DEFINITION'};
    if(meta.kind==='classdef')return {title:`Build the ${meta.name} blueprint`,why:'This class describes how objects are created and what operations they provide.',tag:'CLASS'};
    if(step.output)return {title:'Write to the output',why:'The program produced the text below. Printing displays a value; it does not change that value.',tag:'OUTPUT'};
    if(change)return {title:`Update ${change.name}`,why:`${change.name} changes from ${valueText(change.before)} to ${valueText(change.after)}. Compare the highlighted cells below.`,tag:'CHANGE'};
    if(meta.kind==='break')return {title:'Leave this loop now',why:'break jumps out of the nearest loop, even if more iterations were possible.',tag:'CONTROL FLOW'};
    if(meta.kind==='continue')return {title:'Skip to the next loop round',why:'continue skips the remaining instructions in this round.',tag:'CONTROL FLOW'};
    if(meta.kind==='pass' && step.code.trim()==='end')return {title:'Continue after this block',why:'end closes this MATLAB loop or condition. Execution moves to the next instruction.',tag:'BLOCK END'};
    return {title:'Run this instruction',why:`Execution moved from this line to ${step.next.function==='<'+'module>'?'the main program':step.next.function} at line ${step.next.line_number}. The captured values show its result.`,tag:'EXECUTION'};
  }
  function expressionText(expr,values) {
    if(!expr)return '';
    if(expr.kind==='name')return values[expr.name]===undefined?expr.name:valueText(values[expr.name]);
    if(expr.kind==='literal')return expr.value===null?'None':typeof expr.value==='boolean'?(expr.value?'True':'False'):typeof expr.value==='string'?JSON.stringify(expr.value):String(expr.value);
    if(expr.kind==='binary') {
      const left=expressionText(expr.left,values),right=expressionText(expr.right,values);
      return `${expr.left.kind==='binary'?`(${left})`:left} ${expr.op} ${expr.right.kind==='binary'?`(${right})`:right}`;
    }
    return expr.text||'';
  }
  window.Storyboard={build,describe,delta,scope,valueText,expressionText};
})();
