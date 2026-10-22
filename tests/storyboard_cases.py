"""Real execution fixtures consumed by the browser-model regression tests."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from execution.executor import execute_code
from execution.lesson_metadata import describe_source
from examples import EXAMPLES

cases = {
    'addition': EXAMPLES['Variables & Assignment'],
    'loop': 'total = 0\nfor i in range(3):\n    total += i\nprint(total)',
    'decision': 'score = 78\nif score >= 90:\n    grade = "A"\nelse:\n    grade = "B"\nprint(grade)',
    'recursion': EXAMPLES['Recursion'],
    'mutation': 'items = [3, 1, 2]\nitems[1] = 7\nitems.pop()\nprint(items)',
    'graph': EXAMPLES['Graph'],
    'tree': EXAMPLES['Tree'],
    'error': 'x = 1\ny = x / 0',
    'nested': 'def double(n):\n    return n * 2\nx = double(3)\nprint(x)',
    'loop_last': 'for i in range(2):\n    x = i',
    'nested_loops': 'for i in range(2):\n    for j in range(2):\n        x = i + j\nprint(x)',
    'handled_error': 'def fail():\n    return 1 / 0\ntry:\n    x = fail()\nexcept ZeroDivisionError:\n    x = 9\nprint(x)',
    'matlab': 'A = [1 2; 3 4];\nB = [2 0; 1 2];\nC = A * B;\nD = A .* B;\ndisp(C);',
    'matlab_powers': 'x = 2^3;\nA = [1 2; 3 4];\nB = A^2;\nC = A.^2;\ndisp(C);',
}
results = {}
for name, source in cases.items():
    language = 'matlab' if name.startswith('matlab') else 'python'
    result = execute_code(source, language=language)
    result['statements'] = describe_source(source, language)
    results[name] = result
print(json.dumps(results))
