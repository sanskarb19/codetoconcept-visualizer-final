"""Small, explicit MATLAB learning dialect; no MATLAB installation required.

Keeps one generated line per source line so captured line numbers stay honest.
This is deliberately not a general MATLAB interpreter.
"""
import ast
import re
import operator
import io
import tokenize


class Matrix:
    def __init__(self, rows):
        self.rows = rows
        if not rows or not rows[0] or any(len(r) != len(rows[0]) for r in rows):
            raise ValueError("Matrix rows must have the same nonzero length.")

    def __repr__(self):
        return "\n".join("  ".join(str(v) for v in row) for row in self.rows)

    def elementwise(self, other, op):
        if isinstance(other, Matrix):
            if (len(self.rows), len(self.rows[0])) != (len(other.rows), len(other.rows[0])):
                raise ValueError("Element-wise operands must have matching dimensions.")
            return Matrix([[op(v, other.rows[i][j]) for j, v in enumerate(row)]
                           for i, row in enumerate(self.rows)])
        return Matrix([[op(v, other) for v in row] for row in self.rows])

    def __add__(self, other): return self.elementwise(other, operator.add)
    __radd__ = __add__
    def __sub__(self, other): return self.elementwise(other, operator.sub)
    def __rsub__(self, other): return self.elementwise(other, lambda a, b: b - a)
    def __neg__(self): return self * -1
    def __mul__(self, other): return self.elementwise(other, operator.mul)
    __rmul__ = __mul__
    def __truediv__(self, other): return self.elementwise(other, operator.truediv)
    def __matmul__(self, other):
        if not isinstance(other, Matrix): return self * other
        if len(self.rows[0]) != len(other.rows):
            raise ValueError("A * B requires columns(A) = rows(B). Use .* for element-wise multiplication.")
        return Matrix([[sum(a * b for a, b in zip(row, col))
                        for col in zip(*other.rows)] for row in self.rows])
    def __rmatmul__(self, other): return self * other
    def power(self, exponent):
        if len(self.rows) != len(self.rows[0]):
            raise ValueError("A ^ n requires a square matrix. Use A .^ n to raise each cell to a power.")
        if not isinstance(exponent, (int, float)) or not float(exponent).is_integer() or exponent < 0:
            raise ValueError("Learning mode supports square matrix powers with nonnegative integer exponents. Use A .^ n for cell-by-cell powers; negative or fractional matrix powers require MATLAB.")
        result = Matrix([[int(i == j) for j in range(len(self.rows))] for i in range(len(self.rows))])
        base, exponent = self, int(exponent)
        while exponent:
            if exponent % 2: result = result @ base
            exponent //= 2
            if exponent: base = base @ base
        return result
    def __call__(self, row, col):
        if not isinstance(row, int) or not isinstance(col, int) or row < 1 or col < 1:
            raise IndexError("MATLAB indices are positive integers starting at 1.")
        return self.rows[row - 1][col - 1]


def colon(start, *args):
    step, stop = (1, args[0]) if len(args) == 1 else args
    if step == 0: raise ValueError("Colon step must be nonzero.")
    values = []
    while (start <= stop if step > 0 else start >= stop):
        if len(values) >= 5000: raise ValueError("Range exceeds 5000 values.")
        values.append(start)
        start += step
    return values


def environment():
    def power(a, b):
        if isinstance(a, Matrix): return a.power(b)
        if isinstance(b, Matrix):
            raise ValueError("Learning mode does not support a matrix exponent with ^. Use .^ for cell-by-cell powers.")
        return a ** b
    def element_power(a, b):
        if isinstance(a, Matrix): return a.elementwise(b, operator.pow)
        if isinstance(b, Matrix): return b.elementwise(a, lambda exponent, base: base ** exponent)
        return a ** b
    def divide(a, b):
        if isinstance(b, Matrix):
            raise ValueError("Matrix right division is outside this learning dialect. Use ./ for element-wise division.")
        return a / b
    def filled(n, m=None, value=0):
        m = n if m is None else m
        if not isinstance(n, int) or not isinstance(m, int) or not 1 <= n <= 100 or not 1 <= m <= 100:
            raise ValueError("Learning matrices must have dimensions from 1 to 100.")
        return Matrix([[value] * m for _ in range(n)])
    def eye(n):
        result = filled(n)
        for i in range(n): result.rows[i][i] = 1
        return result
    return {"__mat": Matrix, "__disp": print, "__colon": colon,
            "__multiply": lambda a, b: a.__matmul__(b) if isinstance(a, Matrix) else b.__rmatmul__(a) if isinstance(b, Matrix) else a * b,
            "__divide": divide,
            "__power": power, "__element_power": element_power,
            "__zeros": filled, "__ones": lambda n, m=None: filled(n, m, 1),
            "__eye": eye, "__transpose": lambda a: Matrix([list(r) for r in zip(*a.rows)]),
            "__size": lambda a: Matrix([[len(a.rows), len(a.rows[0])]])}


class MatlabOperators(ast.NodeTransformer):
    def visit_BinOp(self, node):
        if isinstance(node.op, ast.Pow):
            # Python groups powers to the right; MATLAB groups them to the left.
            # Parentheses explicitly enclosing an exponent must retain their meaning.
            while isinstance(node.right, ast.BinOp) and isinstance(node.right.op, ast.Pow) and not node.grouped_exponent:
                right = node.right
                if isinstance(right.right, ast.UnaryOp) and not right.grouped_exponent:
                    raise ValueError("Use parentheses around signed exponents in a power chain, for example (2 ^ 3) ^ (-2).")
                left = ast.BinOp(left=node.left, op=ast.Pow(), right=right.left)
                left.power_kind, left.grouped_exponent = node.power_kind, True
                node.left, node.right = left, right.right
                node.power_kind, node.grouped_exponent = right.power_kind, right.grouped_exponent
        self.generic_visit(node)
        # @ was used as a temporary token for MATLAB .*.
        if isinstance(node.op, ast.Mult):
            return ast.copy_location(ast.Call(func=ast.Name(id="__multiply", ctx=ast.Load()),
                                             args=[node.left, node.right], keywords=[]), node)
        elif isinstance(node.op, ast.Div):
            return ast.copy_location(ast.Call(func=ast.Name(id="__divide", ctx=ast.Load()),
                                             args=[node.left, node.right], keywords=[]), node)
        elif isinstance(node.op, ast.FloorDiv):
            node.op = ast.Div()
        elif isinstance(node.op, ast.MatMult):
            node.op = ast.Mult()
        elif isinstance(node.op, ast.Pow):
            return ast.copy_location(ast.Call(func=ast.Name(id=node.power_kind, ctx=ast.Load()),
                                             args=[node.left, node.right], keywords=[]), node)
        return node


def expression(text):
    def literal(match):
        rows = []
        for row in match.group(1).split(";"):
            cells = [c for c in re.split(r"[\s,]+", row.strip()) if c]
            if not all(re.fullmatch(r"[-+]?\d+(?:\.\d+)?", c) for c in cells):
                raise ValueError("Matrix literals currently accept numbers only.")
            rows.append("[" + ",".join(cells) + "]")
        return "__mat([" + ",".join(rows) + "])"
    text = re.sub(r"\[([^\[\]]*)\]", literal, text)
    # Transform operators only outside strings.
    parts = re.split(r"('(?:[^']|'')*'|\"[^\"]*\")", text)
    power_kinds = []
    for i in range(0, len(parts), 2):
        part = parts[i].replace(".*", "@").replace("./", "//").replace("~=", "!=")
        def power_token(match):
            power_kinds.append("__element_power" if match[0] == ".^" else "__power")
            return "**"
        part = re.sub(r"\.\^|\^", power_token, part)
        if re.search(r"\b[A-Za-z_]\w*\s*\.\s*[A-Za-z_]", part):
            raise ValueError("Field access such as s.field is not supported in learning mode. MATLAB structures require MATLAB; numeric matrices use A(row,col).")
        part = re.sub(r"\b(disp|zeros|ones|eye|transpose|size)\s*\(", r"__\1(", part)
        parts[i] = part
    translated = "".join(parts).strip()
    tree = ast.parse(translated, mode="eval")
    tokens = list(tokenize.generate_tokens(io.StringIO(translated).readline))
    power_tokens = [i for i, token in enumerate(tokens) if token.string == "**"]
    if len(power_tokens) != len(power_kinds):
        raise ValueError("Use ^ for powers in MATLAB, for example x = 2 ^ 3.")
    kinds = dict(zip(power_tokens, power_kinds))
    for node in ast.walk(tree):
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            index = next(i for i in power_tokens if (node.left.end_lineno, node.left.end_col_offset) <= tokens[i].start < (node.right.lineno, node.right.col_offset))
            node.power_kind = kinds[index]
            node.grouped_exponent = False
            if tokens[index + 1].string == "(":
                depth = 0
                for token in tokens[index + 1:]:
                    if token.string == "(": depth += 1
                    elif token.string == ")":
                        depth -= 1
                        if depth == 0:
                            node.grouped_exponent = (node.right.end_lineno, node.right.end_col_offset) <= token.end
                            break
            if isinstance(node.right, ast.UnaryOp) and isinstance(node.right.operand, ast.BinOp) and isinstance(node.right.operand.op, ast.Pow) and tokens[index + 2].string != "(":
                raise ValueError("Use parentheses around signed exponents in a power chain, for example 2 ^ (-(3 ^ 2)).")
    return ast.unparse(MatlabOperators().visit(tree))


def translate(source):
    output, blocks = [], []
    for number, raw in enumerate(source.splitlines(), 1):
        # A percent sign within a quoted string is not a comment.
        parts = re.split(r"('(?:[^']|'')*'|\"[^\"]*\")", raw)
        line = ""
        for i, part in enumerate(parts):
            if i % 2 == 0 and "%" in part:
                line += part.split("%", 1)[0]
                break
            line += part
        line = line.strip().rstrip(";")
        try:
            if not line:
                output.append("")
                continue
            if line == "end":
                if not blocks: raise ValueError("Unexpected end.")
                blocks.pop()
                output.append(" " * (4 * len(blocks)) + "pass")
                continue
            prefix = " " * (4 * len(blocks))
            loop = re.fullmatch(r"for\s+(\w+)\s*=\s*(.+)", line)
            if loop:
                values = loop[2].split(":")
                if len(values) not in (2, 3): raise ValueError("Use for i = start:stop or start:step:stop.")
                output.append(prefix + f"for {loop[1]} in __colon({','.join(expression(v) for v in values)}):")
                blocks.append("for")
            elif line.startswith(("if ", "while ")):
                kind, expr = line.split(" ", 1)
                output.append(prefix + kind + " " + expression(expr) + ":")
                blocks.append(kind)
            elif line == "else":
                if not blocks or blocks[-1] != "if": raise ValueError("else requires if.")
                output.append(" " * (4 * (len(blocks) - 1)) + "else:")
            else:
                assignment = re.fullmatch(r"([A-Za-z]\w*)\s*=\s*(?!=)(.+)", line)
                output.append(prefix + (assignment[1] + " = " + expression(assignment[2]) if assignment else expression(line)))
        except (ValueError, SyntaxError) as exc:
            raise SyntaxError(f"MATLAB learning mode: {exc}", ("<user_code>", number, 1, raw)) from exc
    if blocks:
        raise SyntaxError("MATLAB learning mode: missing end.", ("<user_code>", len(output), 1, ""))
    return "\n".join(output)


EXAMPLE = """% MATLAB learning lab: * is matrix multiplication, .* is element-wise
A = [1 2; 3 4];
B = [2 0; 1 2];
C = A * B;
D = A .* B;
T = transpose(A);
total = 0;
for i = 1:4
    total = total + i;
end
disp(C);
disp(total);
"""
