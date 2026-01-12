import codecs
import sys

path = r'assets/app.js'
try:
    with codecs.open(path, 'r', 'utf-8') as f:
        lines = f.readlines()

    # Check line 275 (index 274)
    if len(lines) > 274 and "emptyTitle" in lines[274]:
        print("Found expected garbage at line 275.")
        new_lines = lines[:274] + lines[428:]
        with codecs.open(path, 'w', 'utf-8') as f:
            f.writelines(new_lines)
        print("Successfully removed garbage lines.")
    else:
        print("Line 275 content mismatch or file too short")
        if len(lines) > 274:
            print("Actual line 275:", lines[274])
except Exception as e:
    print(e)
