import unittest
from execution.lesson_metadata import describe_source


class MetadataTests(unittest.TestCase):
    def test_expression_and_augmented_assignment(self):
        info = describe_source('x = 2\ntotal = x + 3\ntotal += x')
        self.assertEqual(info[2]['expression']['left']['name'], 'x')
        self.assertEqual(info[2]['expression']['right']['value'], 3)
        self.assertEqual(info[3]['expression']['left']['name'], 'total')

    def test_body_lines_define_observed_path(self):
        info = describe_source('if x:\n    y = 1\nelse:\n    y = 2')
        self.assertEqual(info[1]['body_lines'], [2])

    def test_analysis_never_runs_source(self):
        info = describe_source('raise RuntimeError("do not execute")')
        self.assertEqual(info[1]['kind'], 'raise')

    def test_invalid_source_preserves_execution_error(self):
        self.assertEqual(describe_source('if :'), {})

    def test_matlab_multiplication_description(self):
        info = describe_source('A = [1 2; 3 4];\nC = A * A;', 'matlab')
        self.assertEqual(info[2]['expression']['op'], '×')
        self.assertEqual(info[2]['expression']['left']['name'], 'A')

    def test_matlab_powers_description(self):
        info = describe_source('B = A ^ 2;\nC = A .^ 2;\nx = 2 ^ 3 ^ 2;', 'matlab')
        self.assertEqual(info[1]['expression']['op'], '^')
        self.assertEqual(info[2]['expression']['op'], '.^')
        self.assertEqual(info[3]['expression']['left']['op'], '^')
