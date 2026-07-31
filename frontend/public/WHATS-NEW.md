# What's New in Version 2.2

<div align="center"><img src="icon-512.png" width="128"/><br><br></div>
<div align="center">

[Korean (한국어)](WHATS-NEW-ko-KR.md) | [Spanish (Español)](WHATS-NEW-es-ES.md) | [Simplified Chinese (中国语)](WHATS-NEW-zh-CN.md) | [Japanese (日本語)](WHATS-NEW-ja-JP.md)

</div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;"> Lightweight and elegant cross-platform<br>Markdown viewer and editor!</div>

<div align="center">DKST Markdown Browser has become even more powerful!<br>Check out the major features added in this version.</div>

## 🚀 Key Changes

## 2.2.0 - 2026. 07. 31 
- **Removed Beta Badge**: Removed the beta label as the application has reached full stability.
- macOS **CJK IME Enter Fix Line Break Improvement**: When the `CJK IME Enter Fix` option is enabled in Settings → Editor, pressing Enter once during CJK character input now properly creates a line break.


## Changes during Version 2.1

### Highlights
- **Integrated Sidebar Introduced**: Added an integrated sidebar featuring File Tree, Outline, and Search functions (CTRL+ALT+S / macOS: CMD+OPT+S)
- **Markdown Syntax Highlighting**: Added syntax highlighting for code blocks such as Python, Bash, etc.

#### New Features
- **Sidebar Dedicated Shortcuts**: Added shortcuts for File Tree (ALT+1), Outline (ALT+2), and Search (ALT+3)
- **Enhanced Editor Insertion**: Added functionality to directly insert hyperlinks and images from the file tree into the currently edited document
- **Table Insertion Visualization**: Added an intuitive table insertion feature using keyboard arrow keys after typing the `/table` command
- **Advanced Emoji Insertion**: Added a modal window for emoji insertion supporting keyboard navigation and organized by categories
- **AI Multilingual Translation & Spell Check**: Added features to translate the document being edited into a desired language in batch or check and correct spelling
- **Viewer-Only Translation**: Added functionality to temporarily view translations of current documents without editing, or save translated documents
- **List & Formatting Options**: Added options to choose Ordered List numbering styles (1. 1. 1. or 1. 2. 3.) and custom highlighter colors
- **Tiered Toolbar Sets**: Added the ability to choose from 3 editor toolbar sets (Beginner, Rookie, Pro) based on user Markdown proficiency
- **Viewer Display Settings**: Added options to change default font and adjust margins in 3 levels for the Markdown viewer
- **Tab & File Management**: Added features for reopening closed tabs (CTRL+SHIFT+T), Save As, and bookmarking (pinning) recent files in the recent files list

#### Improvements
- **Popup Tooltip & UI Improvements**: Display destination address on hyperlink hover with multilingual support, and changed emoji toast notifications to Google Material Symbols
- **Enhanced Sidebar Usability**: Added keyboard Tab and arrow key navigation support, and improved Outline formatting to distinguish bold text and font size based on heading levels
- **File Tree Convenience**: Display only supported files when filter is clicked, automatically close tab when open file is deleted, and added 'Open in New Tab' to the right-click menu in read mode
- **Editing & Tab Experience Improvements**: Display warning icon for unsaved state, open files in a new tab when opening another file, added tab close animation, and restore previous scroll and cursor position when returning to an edited tab
- **Advanced AI & Task Handling**: Remember last selected language during translation, and display real-time streaming (Delta) responses from LLM in OpenAI and LM Studio modes
- **Multi-tasking Stability**: Completely isolated task history between tabs during multi-tab editing; maintained translation/spell-check operations across tab switching with continuous status display via a universal progress bar
- **Task Scheduling**: Queue and process new LLM requests sequentially after current operation completes
- **Start Page Settings**: Improved settings to allow users to manually customize the number of displayed recent items
- **Feature Integration & Visual Stabilization**: Grouped and integrated similar features, and eliminated screen flickering during read/edit mode transitions
- **Design Consistency**: Fine-tuned document icon design for consistency with DKST series documents

#### Bug Fixes
- **Performance Optimization**: Fixed an issue where startup speed degraded due to reloading fonts on every app launch in environments with many installed fonts
- **AI Prompt Error**: Fixed a visibility issue where the AI prompt window remained on screen even after being closed in the editor
- **AI Spell Check Error**: Fixed an issue where Spell Check intermittently failed by improving LLM response parsing logic
- **Rendering Error**: Fixed an issue where an unnecessary '•' symbol was displayed when rendering TASK format
- **Diagram Readability**: Fixed a class diagram rendering issue where low contrast between background and text colors made text hard to read
- **Shortcut Conflict Resolution**: Resolved shortcut conflicts caused by expanded features and adjusted related shortcuts comprehensively (reflected in document at the bottom of the start page)

---
© 2026 DINKI'ssTyle.
