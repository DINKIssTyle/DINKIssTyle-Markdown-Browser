# What's New in Version 2.1 Beta5

<div align="center"><img src="icon-512.png" width="128"/><br><br></div>
<div align="center">
  
[Korean (한국어)](WHATS-NEW-ko-KR.md) | [Spanish (Español)](WHATS-NEW-es-ES.md) | [Simplified Chinese (中国语)](WHATS-NEW-zh-CN.md) | [Japanese (日本語)](WHATS-NEW-ja-JP.md)

</div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;"> Lightweight and elegant cross-platform<br>Markdown viewer and editor!</div>

<div align="center">DKST Markdown Browser has become even more powerful! Check out the major features added in this version.</div>


## 🚀 Version 2.1 Key Changes

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




## 2.1 Beta3
### Added

- **Insert links and images** directly into the edited document from the file tree.
- **Table Insertion Visualization**: Try inserting a table with `/table`. You can insert it intuitively using keyboard arrow keys.
- **Emoji Insertion Advanced** A modal window categorized by category allows you to navigate and select items using only the keyboard for insertion.

### Bug Fixes & Polish


- **Fixed popup tooltip;** added multilingual support.
- **Remove emoji toast**: Now change emojis in toast messages to Google Material Symbols.
- **File tree filter**: Clicking the filter icon will show only supported files.



## 2.1 Beta4

### Bug Fixes & Polish



- **Add Sidebar Shortcuts**: File Tree is ALT+1, Outline is ALT+2, Search is ALT+3.
- **Sidebar Keyboard Navigation**: Tab key moves to child elements; arrow keys move through the entire sidebar.
- **Improve Sidebar - Outline Formatting**: Bold text and font size are differentiated based on headings, which can be toggled on or off using format buttons.
- **TASK format rendering**: Unnecessary • was attached. It has now been removed and renders as intended.


## 2.1 Beta5

### Added

- **Generate Multilingual Document Translation**: By pressing the `Translate Document` button in the editor and selecting your desired language, you can generate a translation of the currently edited document all at once.
- **Ordered List Option**: There is now an Ordered List Continuation option in Settings > Editor > General, and the default is 1. 1. 1. Markdown standard. If you change the option to 1. 2. 3. Incrementing numbers, you can use incrementing numbers like before.
- **Three Editor Toolbars**: You can select from Beginner, Rooki, or Pro toolbar sets based on your Markdown editing proficiency in the options.
- **Reopen Closed Tab**: You can reopen a closed tab with `CTRL+SHIFT+T`.

### Bug Fixes & Polish

- **Shortcut Changes**: Due to expanded functionality, there have been changes to the shortcuts. Please check the shortcut documentation at the bottom of the start page.
- **Edit State Indicator**: Displays a warning icon in the document tab when the document has been edited but not yet saved.
- **Save As**: You can save the document under a different name.
- **File Tree Right-Click Menu**: An "Open in New Tab" option has been added. This only works in read mode.
- **File Tree Right-Click Menu**: An "Open in New Tab" option has been added. This only works in read mode.
- **Tab Closing Animation**: An animation has been added to the tab bar when closing a tab.
---
(C) 2026 DINKI'ssTyle. All rights reserved.
