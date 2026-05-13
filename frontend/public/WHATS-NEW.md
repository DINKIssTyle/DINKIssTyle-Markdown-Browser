# What's New in Version 2.1 Beta2

<div align="center"><img src="icon-512.png" width="128"/></div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;"> Lightweight and elegant cross-platform<br>Markdown viewer and editor!</div>

<div align="center">DKST Markdown Browser has become even more powerful! Check out the major features added in this version.</div>

## 🚀 Key Changes

### Introduction of the Sidebar

A button to open the sidebar on the left side of the tab bar has appeared. `Shortcut: CTRL+ALT+S (macOS: CMD+OPT+S)`  
* **Sidebar Composition**:
  * **File Tree**: Displays the home folder of open files as a file directory structure. You can view markdown and image files directly by selecting them.
  * **Outline**: View the outline of your markdown document.
  * **Search**: The search function, previously located in the main toolbar up to version 2.0, has been merged here.

### Small but Changed Things

* **Popup Tooltip**: When hover your mouse cursor over a hyperlink, the destination address is displayed.

---

## New Feature and Improvement Plan

- [ ] Use file tree for hyperlinks and image insertion

To be continued.

# Recent Changes

## 2.1 Beta2
### Added & Bug Fixes & Polish

* **Added: Syntax Highlight for Markdown Rendering**

### Python
```python
# Fibonacci sequence
def fibonacci(n: int) -> list[int]:
    result = []
    a, b = 0, 1

    while len(result) < n:
        result.append(a)
        a, b = b, a + b

    return result


if __name__ == "__main__":
    print("Fibonacci:", fibonacci(10))
```

### Bash

```bash
#!/usr/bin/env bash

set -euo pipefail

NAME="${1:-World}"

if [[ "$NAME" == "admin" ]]; then
  echo "Welcome, administrator."
else
  echo "Hello, $NAME!"
fi

for file in *.txt; do
  [[ -e "$file" ]] || continue
  echo "Found text file: $file"
done
```



---
(C) 2026 DINKI'ssTyle. All rights reserved.
