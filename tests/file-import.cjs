const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    value: '', dataset: {}, selectionStart: 0, scrollTop: 0, scrollLeft: 0,
    listeners: {}, classes: new Set(),
    classList: {
      add(name) { element(selector).classes.add(name); },
      remove(name) { element(selector).classes.delete(name); },
    },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setSelectionRange(start) { this.selectionStart = start; },
    focus() { this.focused = true; },
    click() { this.clicked = true; },
  });
  return elements.get(selector);
}
const windowListeners = {};
const source = fs.readFileSync('frontend/js/app.js', 'utf8').replace(
  /  installFallbackEditing\(\);[\s\S]*?\n\}\)\(\);\s*$/,
  '  renderStep = () => {}; globalThis.test = { importCodeFile, bindFileImport, bindEvents, downloadCode, state, el, loadExample, loadConcepts };\n})();'
);
const downloads = [];
const blobs = [];
const revoked = [];
const timers = [];
const context = {
  document: {
    querySelector: element, querySelectorAll() { return []; }, addEventListener() {},
    body: { appendChild() {} },
    createElement() { return { click() { downloads.push(this); }, remove() { this.removed = true; } }; },
  }, TextDecoder, Blob,
  URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:download'; }, revokeObjectURL(url) { revoked.push(url); } },
  window: { clearTimeout() {}, setTimeout(callback) { timers.push(callback); }, addEventListener(name, handler) { windowListeners[name] = handler; } },
};
vm.runInNewContext(source, context);
const { importCodeFile, bindFileImport, bindEvents, downloadCode, loadExample, loadConcepts, state, el } = context.test;
const file = (name, text) => ({ name, size: Buffer.byteLength(text), async arrayBuffer() { return Buffer.from(text); } });

(async () => {
  state.events = [{ line_number: 1 }];
  state.explanationText = 'Old explanation';
  await importCodeFile([file('example.py', '\ufeffprint(42)\r\n')]);
  assert.equal(el.textarea.value, 'print(42)\n');
  assert.equal(el.filename.textContent, 'example.py');
  assert.equal(state.events.length, 0);
  assert.equal(state.explanationText, '');
  assert.equal(state.imported, true);
  assert.equal(state.conceptRequest, 1);
  assert.equal(el.textarea.focused, true);
  downloadCode();
  assert.equal(downloads[0].download, 'example.py');
  assert.equal(await blobs[0].text(), 'print(42)\n');
  assert.equal(downloads[0].removed, true);
  timers.splice(0).forEach(callback => callback());
  assert.deepEqual(revoked, ['blob:download']);
  bindEvents();
  el.concept.value = 'Lists';
  el.concept.listeners.change();
  assert.equal(el.textarea.value, 'print(42)\n');
  assert.equal(el.filename.textContent, 'example.py');
  assert.equal(state.concept, 'Lists');
  let resolveExample;
  context.fetch = () => new Promise(resolve => { resolveExample = resolve; });
  const pendingExample = loadExample('Lists');
  el.textarea.value = 'print("edited during startup")';
  resolveExample({ ok: true, json: async () => ({ code: 'starter code' }) });
  await pendingExample;
  assert.equal(el.textarea.value, 'print("edited during startup")');
  const original = el.textarea.value;
  for (const files of [[], [file('a.py', 'a'), file('b.py', 'b')], [file('image.png', 'image')], [file('binary.py', '\0')], [file('large.txt', 'x'.repeat(100001))], [{ name: 'huge.py', size: 400001 }], [{ name: 'bad.py', size: 1, arrayBuffer: async () => Buffer.from([255]) }], [{ name: 'unreadable.py', size: 1, arrayBuffer: async () => { throw Error('Read failed'); } }]]) {
    await importCodeFile(files);
    assert.equal(el.textarea.value, original);
    assert.equal(state.importing, false);
  }
  state.busy = true;
  await importCodeFile([file('blocked.py', 'changed')]);
  assert.equal(el.textarea.value, original);
  state.busy = false;
  let monacoValue;
  state.editorReady = true;
  state.editor = { getValue() { return monacoValue; }, setValue(value) { monacoValue = value; }, setPosition() {}, revealLine() {}, focus() {} };
  await importCodeFile([file('monaco.pyw', 'print("Monaco")')]);
  assert.equal(monacoValue, 'print("Monaco")');
  el.downloadButton.listeners.click();
  assert.equal(downloads[1].download, 'monaco.py');
  assert.equal(await blobs[1].text(), 'print("Monaco")');
  el.concept.value = 'Recursion';
  el.concept.listeners.change();
  assert.equal(monacoValue, 'print("Monaco")');
  assert.equal(el.filename.textContent, 'monaco.pyw');
  state.importing = true;
  downloadCode();
  assert.equal(downloads.length, 2);
  state.importing = false;
  bindFileImport();
  el.importButton.listeners.click();
  assert.equal(el.importFile.clicked, true);
  const event = { dataTransfer: { types: ['Files'], files: [file('drop.txt', 'print("drop")')] }, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  el.editorPanel.listeners.dragenter(event);
  assert.equal(el.editorPanel.classes.has('drag-over'), true);
  el.editorPanel.listeners.drop(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(monacoValue, 'print("drop")');
  assert.equal(event.prevented && event.stopped, true);
  assert.equal(el.editorPanel.classes.has('drag-over'), false);
  const outside = { ...event, prevented: false };
  windowListeners.drop(outside);
  assert.equal(outside.prevented, true);
  state.editorReady = false; state.imported = false; el.textarea.value = '';
  const startupRequests = [];
  context.fetch = url => new Promise(resolve => startupRequests.push({url, resolve}));
  const startup = loadConcepts();
  state.concept = 'Graph'; el.concept.value = 'Graph';
  const launch = loadExample('Graph');
  startupRequests[0].resolve({ok:true, json:async()=>({concepts:['Variables & Assignment','Graph']})});
  await startup;
  assert.equal(state.concept, 'Graph', 'startup must preserve a user-chosen lesson');
  assert.equal(startupRequests.length, 2, 'startup must not launch a competing default example');
  startupRequests[1].resolve({ok:true, json:async()=>({code:'graph = {"A": []}'})});
  assert.equal(await launch, true, 'the requested lesson must finish loading');
  assert.equal(el.textarea.value, 'graph = {"A": []}');
  console.log('Passed: imports, drag/drop, validation, both editor downloads, concept preservation, and delayed starter protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
