import unittest

from examples import EXAMPLES
from execution.executor import execute_code
from execution.matlab import EXAMPLE


class ExecutionTests(unittest.TestCase):
    def test_all_lessons_execute(self):
        for concept, code in EXAMPLES.items():
            with self.subTest(concept=concept):
                result = execute_code(code)
                self.assertIsNone(result['error'])
                self.assertTrue(result['events'])

    def test_line_events_are_before_execution(self):
        result = execute_code('x = 1\nx = 2\nprint(x)')
        lines = [e for e in result['events'] if e['event'] == 'line']
        self.assertNotIn('x', lines[0]['locals'])
        self.assertEqual(lines[1]['locals']['x']['value'], 1)
        self.assertEqual(lines[2]['locals']['x']['value'], 2)

    def test_recursion_has_distinct_frames(self):
        result = execute_code(EXAMPLES['Recursion'])
        calls = [e for e in result['events'] if e['event'] == 'call' and e['function'] == 'factorial']
        self.assertEqual(len({e['frame_id'] for e in calls}), 4)
        deepest = max(result['events'], key=lambda e: e['call_depth'])
        self.assertEqual(len(deepest['stack']), deepest['call_depth'])
        self.assertEqual([f['function'] for f in deepest['stack']], ['<module>'] + ['factorial'] * 4)

    def test_tree_fields_are_serialized(self):
        result = execute_code('class Node:\n    def __init__(self, value, left=None):\n        self.value = value\n        self.left = left\nroot = Node(8, Node(3))')
        root = result['events'][-1]['locals']['root']
        self.assertEqual(root['__type__'], 'instance')
        self.assertEqual(root['value']['left']['value']['value']['value'], 3)
        recursive = [e for e in execute_code(EXAMPLES['Tree'])['events'] if e['function'] == 'inorder']
        self.assertTrue(any(len(e['globals']['visited']['value']) > 0 for e in recursive))

    def test_matlab_multiplication_and_line_mapping(self):
        result = execute_code(EXAMPLE, language='matlab')
        self.assertIsNone(result['error'])
        final = result['events'][-1]['locals']
        self.assertEqual(final['C']['value'], [[4, 4], [10, 8]])
        self.assertEqual(final['D']['value'], [[2, 0], [3, 8]])
        self.assertEqual(final['T']['value'], [[1, 3], [2, 4]])
        self.assertEqual(final['total']['value'], 10)
        self.assertFalse(any(name.startswith('__') for name in final))
        lines = [e for e in result['events'] if e['event'] == 'line']
        self.assertEqual(lines[0]['line_number'], 2)

    def test_matlab_shape_and_index_errors(self):
        for code in ['A = [1 2];\nB = [1 2];\nC = A * B;', 'A = [1 2];\nx = A(0,1);']:
            with self.subTest(code=code):
                result = execute_code(code, language='matlab')
                self.assertIsNotNone(result['error'])
                self.assertIn(result['error']['type'], ['ValueError', 'IndexError'])

    def test_matlab_elementwise_division(self):
        result = execute_code('A = [2 4; 6 8];\nB = [2 2; 3 4];\nC = A ./ B;', language='matlab')
        self.assertIsNone(result['error'])
        self.assertEqual(result['events'][-1]['locals']['C']['value'], [[1, 2], [2, 2]])

    def test_matlab_scalar_precedence_and_control(self):
        result = execute_code('x = 2 + 3 * 4;\nfor i = 3:-1:1\n x = x + i;\nend\nif x == 20\n disp("ok%");\nelse\n disp("bad");\nend', language='matlab')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], 'ok%\n')

    def test_matlab_unsupported_syntax_reports_original_line(self):
        result = execute_code('% comment\nx = s.field;', language='matlab')
        self.assertEqual(result['error']['type'], 'SyntaxError')
        self.assertEqual(result['error']['line'], 2)
        self.assertIn('Field access', result['error']['message'])

    def test_matlab_scalar_power_precedence(self):
        code = 'a = 2^3;\nb = 2^3^2;\nc = 2^(3^2);\nd = -2^2;\ne = 2^-2;\nf = 2 + 3^2 * 4;\ng = (2^3)^2;\nh = 1e3^2;\ni = 2^(3^2)^2;\nj = 2^3^(2^2);\nk = 2^(-2)^2;\ndisp("power ^ and .^ stay text");'
        result = execute_code(code, language='matlab')
        self.assertIsNone(result['error'])
        final = result['events'][-1]['locals']
        for name, value in dict(a=8, b=64, c=512, d=-4, e=0.25, f=38, g=64, h=1000000, i=262144, j=4096, k=0.0625).items():
            self.assertEqual(final[name]['value'], value)
        self.assertEqual(result['stdout'], 'power ^ and .^ stay text\n')

    def test_matlab_matrix_and_elementwise_powers(self):
        result = execute_code('A = [1 2; 3 4];\nB = A^2;\nC = A.^2;\nD = A^0;\nE = 2.^A;\nF = A.^[2 1; 1 2];\nG = A.^-1;\nH = A.^2^2;', language='matlab')
        self.assertIsNone(result['error'])
        final = result['events'][-1]['locals']
        for name, value in dict(B=[[7, 10], [15, 22]], C=[[1, 4], [9, 16]], D=[[1, 0], [0, 1]], E=[[2, 4], [8, 16]], F=[[1, 2], [3, 16]], G=[[1, .5], [1 / 3, .25]], H=[[37, 68], [153, 292]]).items():
            self.assertEqual(final[name]['value'], value)

    def test_matlab_unsupported_matrix_powers_have_guidance(self):
        for code, message in [('A = [1 2];\nB = A^2;', 'square matrix'), ('A = [1 2; 3 4];\nB = A^-1;', 'nonnegative integer'), ('A = [1 2; 3 4];\nB = A^0.5;', 'nonnegative integer'), ('A = [1 2];\nB = A.^[1; 2];', 'matching dimensions')]:
            with self.subTest(code=code):
                result = execute_code(code, language='matlab')
                self.assertIsNotNone(result['error'])
                self.assertIn(message, result['error']['message'])
                self.assertEqual(result['error']['line'], 2)


if __name__ == '__main__':
    unittest.main()
