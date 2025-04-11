# Create an empty list
my_list = []

# Append elements: 10, 20, 30, 40
my_list.append(10)
my_list.append(20)
my_list.append(30)
my_list.append(40)

# Insert 15 at the second position (index 1)
my_list.insert(1, 15)

# Extend with another list
my_list.extend([50, 60, 70])

# Remove last element
my_list.pop()

# Sort in ascending order
my_list.sort()

# Find and print index of 30
print("Index of 30:", my_list.index(30))

print("Final list:", my_list)