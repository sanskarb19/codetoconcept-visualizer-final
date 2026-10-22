const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('frontend/js/learning.js','utf8'), context);
const { changes, topology } = context.window.LearningStudio;
const val = x => ({__type__:'int',value:x});
const events = [
 {frame_id:1,locals:{x:val(1)}},
 {frame_id:2,locals:{x:val(100)}},
 {frame_id:1,locals:{x:val(2)}},
];
assert.equal(changes(events,2)[0].before.value,1);
assert.equal(changes(events,2)[0].after.value,2);
const graph = {__type__:'dict',value:{A:{__type__:'list',value:[{__type__:'str',value:'B'}]}, B:{__type__:'list',value:[]}}};
assert.equal(topology(graph,'Graph').nodes.length,2);
assert.equal(topology(graph,'Graph').edges[0].to,'B');
const leaf = {__type__:'instance',id:'2',value:{value:val(3)}};
const root = {__type__:'instance',id:'1',value:{value:val(8),left:leaf}};
assert.equal(topology(root,'Tree').nodes.length,2);
assert.equal(topology(root,'Tree').edges.length,1);
assert.equal(topology(root,'Tree').nodes[1].depth,1);
assert.equal(topology({__type__:'dict',value:{x:val(1)}},'Graph').nodes.length,0);
console.log('Passed: frame-specific changes, graph edges, tree hierarchy and structure recognition.');
