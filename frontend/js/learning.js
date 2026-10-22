/* Trace-driven views. No source evaluation and no guessed execution results. */
(() => {
  "use strict";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const unwrap = v => {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(unwrap);
    if (["dict", "instance"].includes(v.__type__)) return Object.fromEntries(Object.entries(v.value || {}).map(([k,x]) => [k,unwrap(x)]));
    if (["list", "tuple", "set", "matrix"].includes(v.__type__)) return (v.value || []).map(unwrap);
    return v.value;
  };
  function previousFrame(events, index) {
    const event = events[index];
    for (let i = index - 1; i >= 0; i--) {
      if (events[i].frame_id === event.frame_id && event.frame_id != null) return events[i];
    }
    return null;
  }
  function changes(events, index) {
    const event = events[index], previous = previousFrame(events,index);
    const now = {...event?.globals,...event?.locals}, before = {...previous?.globals,...previous?.locals};
    return [...new Set([...Object.keys(before),...Object.keys(now)])].filter(k => JSON.stringify(now[k]) !== JSON.stringify(before[k]))
      .map(name => ({name,before:before[name],after:now[name]}));
  }
  function topology(value, kind) {
    const nodes = [], edges = [], seen = new Set();
    if (value?.__type__ === "dict" && Object.values(value.value || {}).every(v => ["list","tuple","set","dict"].includes(v?.__type__))) {
      const data = unwrap(value);
      for (const [from, neighbors] of Object.entries(data)) {
        seen.add(from);
        for (const [to, weight] of (Array.isArray(neighbors) ? neighbors.map(n => [String(n),null]) : Object.entries(neighbors))) {
          seen.add(to); edges.push({from,to,weight});
        }
      }
      for (const id of seen) nodes.push({id,label:id});
    } else if (kind === "Tree" || kind === "Linked List") {
      function walk(v, parent, depth=0, relationship='') {
        if (!v || depth > 10 || nodes.length >= 60 || !["instance","dict"].includes(v.__type__)) return;
        const attrs = v.value || {}, id = v.id || `${parent || "root"}/${nodes.length}`;
        if (parent) edges.push({from:parent,to:id,relationship});
        if (seen.has(id)) return;
        seen.add(id);
        const label = unwrap(attrs.value ?? attrs.val ?? attrs.data ?? attrs.key) ?? v.class ?? id;
        nodes.push({id,label:String(label),depth});
        for (const name of ["left","right","next"]) walk(attrs[name],id,depth+1,name);
        for (const child of attrs.children?.value || []) walk(child,id,depth+1,'child');
      }
      walk(value,null);
    }
    return {nodes,edges};
  }
  function diagram(value, kind, locals, directed=false) {
    const {nodes:allNodes,edges:allEdges} = topology(value,kind);
    if (!allNodes.length) return "";
    const nodes = allNodes.slice(0,40), ids = new Set(nodes.map(n=>n.id));
    const edgeKeys=new Set();
    const connections=directed?allEdges:allEdges.filter(edge=>{
      const key=JSON.stringify([edge.from,edge.to].sort());
      if(edgeKeys.has(key))return false;
      edgeKeys.add(key);return true;
    });
    const edges = connections.filter(e=>ids.has(e.from)&&ids.has(e.to)).slice(0,120);
    const positions = new Map(), levels = new Map();
    if (kind === "Tree" && nodes.every(n=>n.depth != null)) {
      nodes.forEach(n => { if (!levels.has(n.depth)) levels.set(n.depth,[]); levels.get(n.depth).push(n); });
      levels.forEach((row,depth)=>row.forEach((n,i)=>positions.set(n.id,{x:40+(i+1)*620/(row.length+1),y:45+depth*85})));
    } else nodes.forEach((n,i)=>positions.set(n.id,{x:350+240*Math.cos(2*Math.PI*i/nodes.length-Math.PI/2),y:200+145*Math.sin(2*Math.PI*i/nodes.length-Math.PI/2)}));
    const height = levels.size ? Math.max(230,levels.size*85) : 400;
    const active = unwrap(locals.node ?? locals.current ?? locals.vertex);
    const activeLabel = active && typeof active === "object" ? active.value ?? active.val ?? active.data : active;
    const visited = unwrap(locals.visited ?? locals.seen ?? {value:[]});
    const visitedSet = new Set((Array.isArray(visited) ? visited : Object.keys(visited || {})).map(String));
    const lines = edges.map(e=>{
      const a=positions.get(e.from),b=positions.get(e.to);
      return `<path d="${e.from===e.to ? `M ${a.x-10} ${a.y-20} c -55 -60 75 -60 20 0` : `M ${a.x} ${a.y} L ${b.x} ${b.y}`}" class="structure-edge" ${directed?'marker-end="url(#arrow)"':''}/>${e.weight!=null||e.relationship?`<text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-8}" class="edge-label">${esc(e.weight??e.relationship)}</text>`:""}`;
    }).join("");
    return `<div class="diagram-scroll"><svg class="structure-svg" viewBox="0 0 700 ${height}" role="group" aria-label="${esc(kind)}: ${nodes.length} nodes and ${edges.length} connections"><defs><marker id="arrow" viewBox="0 0 10 10" refX="25" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8191a5"/></marker></defs>${lines}${nodes.map(n=>{const p=positions.get(n.id);return `<g role="button" tabindex="0" aria-label="Inspect node ${esc(n.label)}" data-node-id="${esc(n.id)}" class="structure-node ${String(activeLabel)===n.label?'active':visitedSet.has(n.label)?'visited':''}"><title>${esc(n.label)}</title><circle cx="${p.x}" cy="${p.y}" r="24"/><text x="${p.x}" y="${p.y+5}">${esc(n.label.slice(0,12))}</text></g>`;}).join("")}</svg></div><div class="visual-legend"><span>● Current node</span><span>● Visited</span><span>${allNodes.length} nodes · ${connections.length} connections${allNodes.length>40 || connections.length>120?' · diagram limited to 40 nodes / 120 edges':''}</span></div>`;
  }
  function collection(value, name, locals, kind, before=null) {
    let data = unwrap(value);
    if (!Array.isArray(data)) return "";
    const matrix = value.__type__ === "matrix" || data.length && data.every(Array.isArray);
    if (matrix) {
      const rows = data.slice(0,12), width = Math.max(1,...rows.map(r=>r.length));
      const numbers = rows.flat().filter(v=>typeof v === "number"), max = Math.max(1,...numbers.map(Math.abs));
      return `<div class="matrix-caption">${esc(name)} · ${data.length} × ${data[0]?.length || 0} · ${value.__type__==='matrix'?'indices start at 1':'indices start at 0'}</div><div class="matrix-scroll"><div class="matrix-grid" style="grid-template-columns:repeat(${Math.min(width,12)},minmax(42px,1fr))">${rows.map((r,i)=>r.slice(0,12).map((v,j)=>`<div class="matrix-cell" style="--intensity:${typeof v==='number'?Math.abs(v)/max:0}"><small>${i+(value.__type__==='matrix'?1:0)},${j+(value.__type__==='matrix'?1:0)}</small>${esc(typeof v==='object'?JSON.stringify(v):v)}</div>`).join("")).join("")}</div></div>${data.length>12||width>12?'<p>Showing the first 12 rows and columns.</p>':''}`;
    }
    const index = unwrap(locals.i ?? locals.index);
    const old=unwrap(before);
    const pointers=Object.entries(locals).filter(([key,v])=>['i','j','index','left','right','mid','front','rear'].includes(key) && Number.isInteger(unwrap(v)) && unwrap(v)>=0 && unwrap(v)<data.length);
    return `<div class="array-pointers">${pointers.map(([key,v])=>`<span>${esc(key)} points to position ${unwrap(v)}</span>`).join('')}</div><div class="array-cells ${kind==='Stack'?'stack-cells':''}">${data.slice(0,60).map((v,i)=>`<div class="array-cell ${index===i?'active':''} ${Array.isArray(old)&&JSON.stringify(old[i])!==JSON.stringify(v)?'changed':''}"><small>position ${i}</small><strong>${esc(typeof v==='object'?JSON.stringify(v):v)}</strong>${kind==='Queue'&&i===0?'<em>front</em>':kind==='Stack'&&i===data.length-1?'<em>top</em>':''}</div>`).join("") || '<p>Empty collection</p>'}</div>${data.length>60?'<p>Showing the first 60 items.</p>':''}`;
  }
  window.LearningStudio={changes,topology,unwrap,diagram,collection};
})();
