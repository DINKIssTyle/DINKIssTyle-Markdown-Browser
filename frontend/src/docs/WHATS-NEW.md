---
title: "DKST Markdown Browser 3.0"
author: "DINKI'ssTyle"
team: "DKST"
date: "2026-08-06"
tags: ["readme"]
draft: false
---

<div align="left"><img src="img/textflow.png" width="32"/></div>

If you are satisfied with DKST Markdown Browser, try **DKST Text Flow**. It helps with document creation using snippet shortcuts. With AI support, OCR, floating screenshots, and various other features, it enhances your workflow efficiency. [Learn More](https://github.com/DINKIssTyle/DINKIssTyle-Text-Flow)



# 3.0 Expansion to All Platforms

[한국어](WHATS-NEW-ko-KR.md) | [Español](WHATS-NEW-es-ES.md) | [中文](WHATS-NEW-zh-CN.md) | [日本語](WHATS-NEW-ja-JP.md) 

<div align="center"><img src="icon-512.png" width="128"/></div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;"> A Lightweight and Elegant Cross-Platform<br>Markdown Viewer & Editor!<br><br>Now available on Windows, macOS, Linux, iOS, iPadOS, and Android.<br><br></div>

## 3.0.8
### 🎛️ Common
* **Text Selection in Editor**: Fixed an issue where text appeared double-selected.
* **Remember Window Size and Position**: Remembers the last window size and position. You can disable this feature in Settings.

### 📱 Android, iPadOS/iOS
* **Mobile Save Button Behavior Change**: In mobile environments, pressing the save button in the editor no longer exits edit mode.

### 📱 iPadOS/iOS
* **Recalculate Scrollbar Length**: Fixed an issue where the scrollbar length calculated in the previous tab continued to be displayed even after switching tabs.


## 3.0.7

### 🎛️ Common
* **Added Translation & Spell Check Languages**: You can now add and use desired languages in Settings.
* **Code Block Copy Button**: Fixed an issue where the copy button was not pinned to the top right.
* **Main Toolbar Theme Button**: For new users, the theme button is now an optional setting that can be enabled in Settings.

### 🖥️ macOS
* **Edit Mode Bug Fix**: Fixed an issue where the app would freeze when applying changes and exiting.

### 🍎 macOS, iPadOS/iOS
* **Apple Intelligence Support**: In supported environments, you can select Apple Intelligence as the AI provider without needing a separate LLM server. Note that functionality may be limited due to context length constraints.

### 📱 Android, iPadOS/iOS
* **Improved Ask AI Invocation**: Fixed an issue on tablets and mobile devices where the Ask AI prompt window was not triggered for text selected via tap.



## 3.0.6

### 🎛️ Common

* **Ensure Editor Space**: Ensure there is enough space at the bottom of the editor so it is not obscured by the AI toolbar.
* **AI Toolbar Persistence Issue**: Fixes the issue where the AI toolbar does not disappear when not in edit tab.

## 3.0.5

### 🖥️ Windows
- Fix cancel button unresponsive in edit mode toolbar

### 🖥️ Linux
- Fix new document files not created as Markdown

## 3.0.4

### 🎛️ Common

* **Non-intrusive OS File Association**: You can open various plain text and source code files such as .txt, .py, .c, .m using the Non-intrusive File Association feature. This is a file association method with minimal intervention.
* **Code and Script Editing Support**: You can edit and view various code and script sources with syntax highlighting.


### 📱 Android, iPadOS/iOS
* **Adjustable Floating Navigator Size**: The touch area of the floating button used for search or spell check has been enlarged to improve usability on touchscreens.


### 📱 iPadOS
* **Scrollbar Bug Fix**: When the side panel is open, the scrollbar should always be visible, but it was disappearing.


## 3.0.3

### 🎛️ Common
* **Home Button Bug Fix**: Fixed an issue where the home location in the file tree was set to the starting page for open Markdown documents.
* **Mermaid Error Protection**: Added defensive logic to prevent app shell breakage during Mermaid rendering errors, and resolved predictable rendering issues through regression tests.

### 🖥️ Windows, macOS, Linux
* **Executable Details**: Resolved an issue where the current version was not being inserted correctly during builds.

### 📱 Android
* **Document Linking**: Document linking feature has been added.
* **Document Folder**: Updated to match the latest Android standards and specified the document folder used by the app. This may prompt for file access permissions.

### 📱 iPadOS/iOS
* **Changed iCloud Document Opening Method**: When opening iCloud files from Finder, they are now opened directly without going through the app sandbox.

## 3.0.2

### 🎛️ Common

* **Outline Panel**: Removed raw Markdown syntax from the list display and improved it to allow collapsing at higher heading levels.
* **File Tree Panel**: You can rename files through the context menu.

### 🖥️ Windows, macOS, Linux
* **Toolbar Navigation in Edit Mode**: Added scroll buttons to the edit mode toolbar to easily navigate when it is obscured in narrow window widths.

### 📱 iOS/iPadOS & Android
* **File Tree Panel Improvements**: Context menus for file tree items on tablet and mobile can now be opened via long-press or using the dedicated context menu button.
* **New Document Creation**: Files can now be created and saved in the correct location.
* **Context Menu**: Removed the custom desktop context menu on mobile and tablet platforms as it conflicted with native OS context menus.



## 3.0.1

### 🖥️ Common
* **details, summary Tag Rendering**: Fixed a rendering bug with content summary/collapse.

### 📱 iOS/iPadOS & Android
* **iOS, Android UI**: Font sizes for all UI elements in mobile (smartphone) and tablet (iPad/Android Tablet) environments are optimized to comply with Apple Human Interface Guidelines (iOS/iPadOS Typography) standard specifications.





## Previous Changelogs

<details>
<summary><b>Changes during Version 2.2</b></summary>
  
### Highlights
* **Full Support for Front Matter**
  * **Detection and Display:** Opening a document containing Front Matter displays an exclamation mark button in the address bar, and the document tab shows the title defined in the metadata.
  * **Template Insertion:** In edit mode, clicking the exclamation mark button easily inserts a basic template containing title (first line of document), author (linked to settings), date (creation time), tags, draft status, etc.
* **Advanced Edit and Preview Modes**
  * **Split Screen Control:** Freely toggle horizontal/vertical split orientation and switch the layout positions of the editor and preview.
  * **Ratio Adjustment:** Drag the split bar to adjust the ratio, and double-click to reset to a 1:1 ratio.
  * **Preview Toggle:** Easily turn preview on/off via toolbar button or shortcut (`Ctrl+G` / `CMD+G`).
* **In-App Update Support** (Desktop version)
  * Check and download new versions directly within the app (Settings → Update) without visiting the website. (Currently supports manual download instead of automatic update)
#### Improvements
* **Complete Redesign of Settings UI:** The settings screen has been revamped with a more modern and sleek design.
* **Interface Customization:**
  * **Main Toolbar:** Toggle the visibility of New Document, Edit Mode, Translate, Font Size, and Theme buttons in settings.
  * **Scrollbar:** Custom accent color is applied for intuitive scroll position tracking, with display timing options (Always or When scrolling).
* **History Navigation Feedback:** Significantly improved visual feedback and animation smoothness when navigating history (forward/back) via trackpad gestures across Windows, macOS, and Linux.
* **Recent List Management Improvement:** Clicking 'Clear Recent List' now clears the list while preserving pinned files.
* **Enhanced CJK (Chinese, Japanese, Korean) Language Compatibility**
  * **Line Break and Commit Improvement:** When `CJK IME Enter Fix` is enabled (macOS, Linux), pressing Enter once allows smooth line breaks while entering CJK characters.
* **Input Conflict Resolution:** Fixed issues where pressing Enter or arrow keys while creating lists or using commands (`/`) caused characters to be incorrectly committed or failed to advance to the next action.
#### Bug Fixes
* **Text Selection Bug Fix:** Fixed an issue where scrolling after switching tabs or opening settings inadvertently selected text from the last edit position to the new position.
* **Low Resolution Support:** To prevent the title bar from disappearing in low-resolution environments like 1280x720, the app now automatically opens in maximized mode on launch.
* **macOS Navigation Bug Fix:** Fixed an issue where forward/back history navigation using trackpad and mouse was not working on macOS.
</details>


<details>
<summary><b>Changes during Version 2.1</b></summary>
  
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
</details>
---
© 2026 DINKI'ssTyle.
