# Submission demo: about five minutes

## Picture-first walkthrough

1. Click **Adding numbers**. Use **Next instruction** twice to reach
   `total = x + y`. Show the figure **10 + 20 → total 30** and the value columns.
2. Click **Loops**. Show the round badge and changing `i`/`total` boxes.
   Use **Execution path** to show why the same lines run again.
3. Click **Sorting**. Watch before/after list cells. Switch to **Value columns**
   to compare the list values visually. Highlighted positions changed.
4. Click **Graphs**. Follow the current node, waiting queue and visited order.
   Click **Trees** to see the tree built from named nodes and traversed recursively.
5. Click **Matrices**. Move to `C = A * B` and click a result cell. Show the
   highlighted input row and column and the multiplication that produces it.
6. Developer details are optional. Expert mode opens raw events and call frames.

The main highlight now means **the instruction being explained**, and its figure
shows the next observed snapshot. The underlying tracer still pauses before a
line runs; the teaching model pairs these snapshots to explain the result.

The older import-based presentation below can still be used. Its **Run code**
button is now named **Visualize code**, and the main navigation advances teaching
instructions. Raw events remain available under **Developer details**.

## Introduction (30 seconds)

"This project helps learners follow Python execution one step at a time.
It captures an execution trace, shows variable changes and call frames,
and lets the user inspect printed output. Gemini can optionally explain
a selected step."

Start the app with `python main.py` and open http://localhost:8000.
If this app is already running there, use the existing server or stop it
with Ctrl+C in its terminal before restarting.

## 1. Stack and file controls (one minute)

- Select **Stack**, import `01_stack.py`, and click **Run code**.
- Step past each `append` and `pop`; show the collection and printed output.
- Explain that the last item added is the first removed.
- Switch to **Lists** to show the same code and trace in another concept view.
- Click **Download** to save the current source as a Python file.

## 2. Sorting and variable changes (one minute)

- Select **Sorting** and drag `03_bubble_sort.py` onto the editor.
- Run it and use **Play** at a slow tempo, then pause during a swap.
- Point out `left`, `right`, `index`, and the changing `numbers` list.
- Show the final output: `Sorted: [1, 2, 3, 4, 5]`.

## 3. Recursion and call frames (one minute)

- Select **Recursion**, import `05_recursion_factorial.py`, and run it.
- Step through nested calls until `n` reaches 1.
- Show the call stack growing, then shrinking as results return.
- Show the final result: `4! = 24`.
- If Gemini is available, select a multiplication step and click **Ask Gemini**.

## Reliability check and conclusion (one minute)

- Temporarily enter `print(1 / 0)` and run it to show the execution error.
- Re-import one of the samples to restore a successful program.
- Explain that tracing works independently of the optional Gemini service.
- Explain that line events capture state before a line executes, so changes
  appear in the next captured step.

## Before presenting

- Keep your six sample files ready for importing or dragging onto the editor.
- Rehearse the three examples once using the actual app.
- Check downloading edited source and switching concepts without losing code.
- Prepare a local explanation of recursion in case Gemini is unavailable.
- Describe execution accurately: it uses a subprocess and a time limit;
  it is intended for trusted local code and is not a full security sandbox.
