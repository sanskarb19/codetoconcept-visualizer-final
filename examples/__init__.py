EXAMPLES = {
    "Variables & Assignment": """x = 10
y = 20
total = x + y
print("Total:", total)
""",

    "For Loop": """total = 0
for i in range(5):
    total = total + i
    print("i =", i, "total =", total)
print("Done:", total)
""",

    "While Loop": """n = 5
fact = 1
while n > 1:
    fact = fact * n
    n = n - 1
print("5! =", fact)
""",

    "If / Else": """score = 78
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 70:
    grade = "C"
else:
    grade = "F"
print("Grade:", grade)
""",

    "Functions": """def add(a, b):
    return a + b

def mul(a, b):
    return a * b

x = add(5, 10)
y = mul(x, 2)
print(x, y)
""",

    "Recursion": """def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(4)
print("4! =", result)
""",

    "Lists": """numbers = [5, 2, 9, 1, 7]
for i in range(len(numbers)):
    if numbers[i] % 2 == 0:
        numbers[i] = numbers[i] * 10
print(numbers)
""",

    "Stack": """stack = []
stack.append(1)
stack.append(2)
stack.append(3)
top = stack.pop()
print("popped:", top)
""",

    "Queue": """queue = []
queue.append("a")
queue.append("b")
queue.append("c")
front = queue.pop(0)
print("served:", front)
""",

    "Dictionary": """ages = {}
ages["alice"] = 30
ages["bob"] = 25
for name in ages:
    print(name, ages[name])
""",
}


EXAMPLES.update({
    "Graph": '''# Breadth-first search: gold = current, green = visited
graph = {"A": ["B", "C"], "B": ["A", "D"], "C": ["A", "E"], "D": ["B"], "E": ["C"]}
visited = []
queue = ["A"]
while queue:
    node = queue.pop(0)
    if node not in visited:
        visited.append(node)
        for neighbor in graph[node]:
            if neighbor not in visited:
                queue.append(neighbor)
print("BFS order:", visited)
''',
    "Tree": '''# Each node is a value with optional left and right children.
leaf_1 = {"value": 1}
leaf_6 = {"value": 6}
leaf_14 = {"value": 14}
branch_3 = {"value": 3, "left": leaf_1, "right": leaf_6}
branch_10 = {"value": 10, "right": leaf_14}
root = {"value": 8, "left": branch_3, "right": branch_10}
visited = []
def inorder(node):
    if node is None:
        return
    inorder(node.get("left"))
    visited.append(node["value"])
    inorder(node.get("right"))

inorder(root)
print("In-order:", visited)
''',
    "Linked List": '''class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next

head = Node(10, Node(20, Node(30)))
current = head
while current:
    print(current.value)
    current = current.next
''',
    "Sorting": '''# Insertion sort: watch each shift and insertion
numbers = [7, 3, 5, 1, 9]
for i in range(1, len(numbers)):
    key = numbers[i]
    j = i - 1
    while j >= 0 and numbers[j] > key:
        numbers[j + 1] = numbers[j]
        j -= 1
    numbers[j + 1] = key
print(numbers)
''',
    "Searching": '''numbers = [2, 4, 6, 8, 10, 12, 14]
target = 10
left, right = 0, len(numbers) - 1
found = -1
while left <= right:
    i = (left + right) // 2
    if numbers[i] == target:
        found = i
        break
    if numbers[i] < target:
        left = i + 1
    else:
        right = i - 1
print("Found at index:", found)
''',
    "Nested Loops": '''matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
for i in range(3):
    for j in range(3):
        matrix[i][j] = (i + 1) * (j + 1)
print(matrix)
''',
    "Strings": '''word = "visualize"
counts = {}
for letter in word:
    counts[letter] = counts.get(letter, 0) + 1
print(counts)
''',
})


def get_example(concept: str) -> str:
    return EXAMPLES.get(concept, EXAMPLES["Variables & Assignment"])
