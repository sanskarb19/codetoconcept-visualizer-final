"""Describe source syntax without evaluating it or changing its execution."""
import ast

OPS = {ast.Add: '+', ast.Sub: '−', ast.Mult: '×', ast.Div: '÷', ast.FloorDiv: '//',
       ast.Mod: '%', ast.Pow: '^', ast.MatMult: '×', ast.Eq: '==', ast.NotEq: '!=',
       ast.Lt: '<', ast.LtE: '≤', ast.Gt: '>', ast.GtE: '≥', ast.Is: 'is', ast.IsNot: 'is not',
       ast.In: 'in', ast.NotIn: 'not in'}


def expression(node):
    helpers = {'__multiply': '×', '__divide': '÷', '__power': '^', '__element_power': '.^'}
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in helpers:
        return {'kind': 'binary', 'op': helpers[node.func.id],
                'left': expression(node.args[0]), 'right': expression(node.args[1])}
    if isinstance(node, ast.Name):
        return {'kind': 'name', 'name': node.id}
    if isinstance(node, ast.Constant):
        return {'kind': 'literal', 'value': node.value if isinstance(node.value, (str, int, float, bool, type(None))) else str(node.value)}
    if isinstance(node, ast.BinOp):
        return {'kind': 'binary', 'op': OPS.get(type(node.op), '?'),
                'left': expression(node.left), 'right': expression(node.right)}
    if isinstance(node, ast.Compare) and len(node.ops) == 1:
        return {'kind': 'binary', 'op': OPS.get(type(node.ops[0]), '?'),
                'left': expression(node.left), 'right': expression(node.comparators[0])}
    return {'kind': 'code', 'text': ast.unparse(node),
            'names': sorted({n.id for n in ast.walk(node) if isinstance(n, ast.Name)})}


def describe_source(source, language='python'):
    if language == 'matlab':
        from execution.matlab import translate
        try:
            source = translate(source)
        except SyntaxError:
            return {}
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}
    result = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.stmt) or node.lineno in result:
            continue
        info = {'kind': type(node).__name__.lower(), 'line': node.lineno,
                'end': getattr(node, 'end_lineno', node.lineno)}
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            info['targets'] = [ast.unparse(t) for t in targets]
            value = node.value
            if isinstance(node, ast.AugAssign):
                value = ast.BinOp(left=node.target, op=node.op, right=node.value)
            info['expression'] = expression(value) if value else None
        elif isinstance(node, (ast.If, ast.While, ast.For)):
            info['expression'] = expression(node.iter if isinstance(node, ast.For) else node.test)
            info['body_lines'] = sorted({n.lineno for item in node.body for n in ast.walk(item) if isinstance(n, ast.stmt)})
            if isinstance(node, ast.For): info['target'] = ast.unparse(node.target)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            info['name'] = node.name
        elif isinstance(node, ast.Return):
            info['expression'] = expression(node.value) if node.value else {'kind': 'literal', 'value': None}
        elif isinstance(node, ast.Expr):
            info['expression'] = expression(node.value)
            if isinstance(node.value, ast.Call):
                info['call'] = ast.unparse(node.value.func)
                info['arguments'] = [expression(a) for a in node.value.args]
        result[node.lineno] = info
    return result
