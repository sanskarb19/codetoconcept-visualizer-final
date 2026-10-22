# Code to Concept — Execution Studio

Click **Adding numbers**, **Loops**, **Sorting**, **Recursion**, **Trees**,
**Graphs**, or **Matrices** to load and execute an example in one click. Or edit
your own source and click **Visualize code**. **Next instruction** shows one
instruction and its observed result together: operand figures, before/after
boxes, decision branches, loop rounds, function inputs/returns and printed text.
Use **Value columns** to compare numbers, **Named boxes** to inspect memory, and
**Execution path** to follow repeated lines. The slider moves between teaching
instructions, rather than raw debugger events. Playback allows time to read.

**Walk me through** breaks each instruction into reading inputs, doing the work,
and revealing its captured result. The work view includes an expression tree
and expanded small powers. **Let me predict** asks for a value, branch choice or
collection count, then checks it against the trace. Output and developer details
stay hidden until the result is revealed. **Show everything** keeps the full
instruction view. **Value history** follows recorded changes within the current
function, with a numeric trend and clickable rows. **Code map** labels each source
line's purpose and shows which instructions this run reached. The work view also
explains the current expression's symbols. Graph/tree nodes can be
clicked or focused with the keyboard to inspect connections; tree edges label
left/right relationships.

The figures use actual captured snapshots, with source syntax analyzed through
Python's AST without evaluating it. Underlying Python line events occur before
execution; the teaching model pairs each instruction with the following snapshot
to show its effects. A function call is shown as pending until its result is
captured. Raw events and call frames are in a collapsible **Developer details**
panel; Expert mode opens it. Teaching explanations work without an AI key.

Graphs use adjacency dictionaries (neighbor lists or dictionaries of weights).
Trees use objects/dictionaries with `value`, `val`, `data` or `key` labels and
`left`/`right`/`children` connections; linked lists use `next`. Select a variable
to inspect, toggle arrows for directed connections, and zoom the diagram.
Traversal highlights use `node`/`current`/`vertex` and `visited`/`seen` variables.
Nested numeric lists and MATLAB matrices show indexed grids. Diagrams are bounded
for readability; arbitrary structures outside these conventions stay in the
variable inspector. Captured values also have depth and item limits.

## MATLAB learning mode

Click **Matrices**, or select **MATLAB learning mode**, then **Load example**.
Click a matrix multiplication result cell to see its row-by-column calculation.
Import/export supports
`.m` files. This is an educational dialect executed through a line-preserving
Python translation, **not a full MATLAB runtime**. It supports numeric matrix
literals, scalar arithmetic and `^`, matrix `*` and nonnegative integer `^`, element-wise `.*`, `./` and `.^`, one-based
`A(row,col)` reads, `transpose`, `size`, `zeros`, `ones`, `eye`, `disp`, colon
`for` loops, `while`, and `if`/`else`/`end`. Use one statement per source line.
For example, `2^3` gives 8, `A^2` multiplies a square matrix by itself, and
`A.^2` squares each cell. Powers of the same precedence group from left to right;
parentheses preserve explicit grouping. Use parentheses around signed exponents
in a chain. Negative/fractional matrix powers, field access, indexed assignment,
functions, plotting and MATLAB toolboxes are outside
this mode. Unsupported syntax reports the original source line. No NumPy,
MATLAB license, or extra dependency is required.

Validate with `python -m unittest discover -s tests -v`,
`node tests/file-import.cjs`, `node tests/learning.cjs`, and
`node tests/storyboard.cjs`, and `node tests/guided.cjs`. The teaching suites check real execution results
against the figures, including calls, branches, mutations and matrix cells.

A local browser-based Python learning tool. Write Python in the editor, run it
through the existing subprocess tracer, then inspect the captured events,
variables, call frames, output, and errors one step at a time.

The trace is the source of truth. Gemini is an optional explanation service and
does not execute or determine the result of a program.

## Run locally

```bash
pip install -r requirements.txt
python main.py
``` 

Open <http://localhost:8000>. The browser editor uses Monaco when its CDN is
reachable and falls back to a keyboard-editable editor if it is not.

Use the **Import** icon above the editor to open a `.py`, `.pyw`, or `.txt`
file, or drag one onto the editor. Import replaces the current source and clears
the previous trace. Files must be UTF-8 text within the 100,000-character code
limit. Imported code is ready to edit; click **Run code** to execute it.

Use **Download** beside Import to save the current code as a `.py` file.
Switching concepts preserves your code and trace while updating the concept
view. See `DEMO_GUIDE.md` for a short submission demo.

## Optional Gemini explanations

Set `GEMINI_API_KEY` to enable explanations. On Replit, add it through Replit
Secrets; when running locally, copy `.env.example` to `.env` and set it there.
The key is read by the Python backend and is never sent to the browser. Source
code and the selected step's variable snapshots are sent only when you request
an explanation; requests use Google's stateless Interactions API mode. The
visualizer, editor, and execution controls work without Gemini. A rejected key
or unavailable model is reported without interrupting execution.

## API

- `GET /api/health` — application and Gemini availability
- `GET /api/concepts` — supported visualization concepts
- `GET /api/examples?concept=...` — starter code for a concept
- `POST /api/execute` — run source in a separate Python process and return trace data
- `POST /api/explain` — explain one captured trace step with Gemini

## Execution note

User code runs in a subprocess with a time limit, but a subprocess is **not** a
complete security sandbox. This project is for local educational use; do not
use it to run untrusted programs on a shared or public service.
