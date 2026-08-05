
<div align="left"><img src="img/textflow.png" width="32"/></div>

If you are satisfied with the DKST Markdown Browser, try **DKST Text Flow**. It helps with document creation using shortcuts. With AI support, OCR, floating screenshots, and various other features, it enhances your workflow efficiency. [Learn More](https://github.com/DINKIssTyle/DINKIssTyle-Text-Flow)

# New Features in Version 2.2
[한국어](WHATS-NEW-ko-KR.md) | [Español](WHATS-NEW-es-ES.md) | [中文](WHATS-NEW-zh-CN.md) | [日本語](WHATS-NEW-ja-JP.md)

<div align="center"><img src="icon-512.png" width="128"/></div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;">A Lightweight and Elegant Cross-platform<br>Markdown Viewer & Editor!</div>

<div align="center">DKST Markdown Browser has become more powerful!<br>Check out the major features added in this version.</div>

# Changes

## 2.2.4

#### Improvements
- **Scrollbar Color Change**: The monochrome scrollbar can now be changed to a custom accent color, allowing users to intuitively see their current scroll position.
- **Scrollbar Display Options**: In Appearance → Show scroll bars, you can choose when the scrollbars appear: 'When scrolling' or 'Always'.


## 2.2.3
#### New Features
- **Update Check**: You can check and download updates within the app without going through the web.
  - Available in Settings → Update tab.
  - Limitation: Currently, only download is supported without automatic updates.

#### Improvements
- **Enhanced CJK Compatibility**: Fixed issues where pressing Enter while creating a list caused unintended character commits or list termination. Also fixed the issue where characters would commit and move to the next action even when pressing Enter or arrow keys while using commands (/).
- **Improved History Browsing Feedback**: Enhanced the smoothness of the animation displayed when swiping with a trackpad.

## 2.2.2

#### New Features

- **Front Matter Support**: When opening a Markdown document with Front Matter, an exclamation mark button appears in the address bar, and the tab displays the title defined in the metadata.
- **Inserting Front Matter**: In edit mode, pressing the exclamation mark button inserts a basic template including title, author, date, tags, draft status, etc. Once Front Matter is inserted, the title defaults to the first line of the Markdown document, the author uses the value from Settings → Editor Tab → Author name, and the date is entered upon creation.
- **Customizing Main Toolbar Button Display**: You can configure which buttons (New Document, Edit Mode, Translate, Font Size, Theme) are displayed on the main toolbar in Settings → Appearance. Each function has a unique shortcut key.
- **Improved History Navigation**: Resolved an issue where history navigation (forward/backward) was unresponsive when using trackpad or mouse on macOS. Added visual feedback for trackpad gestures across Windows, macOS, and Linux.

#### Improvements

- **Fixed Text Selection Issue During Editor Cursor Movement**: Resolved an issue where text was selected from the last edit location to a new location when scrolling after actions like tab navigation or opening settings windows, especially when the cursor moved to an unseen area.
- **Enhanced Low Resolution Support**: Addressed an issue where the title bar would not display on low-resolution workspaces like 1280x720 by automatically running in maximized mode when the device resolution is low.

## 2.2.1

#### Added Features (New Features)
- **Toggle Horizontal/Vertical in Edit Mode**: You can now set the preview and split direction in edit mode.
- **Adjust Editor/Preview Position in Edit Mode**: You can change the layout position of the editor and preview in edit mode.
- **Adjust Split Ratio in Edit Mode**: Drag the splitter bar to adjust the ratio between the editor and preview. Tip: Double-clicking the splitter bar resets it to a 1:1 ratio.
- **Disable Preview in Edit Mode**: Easily turn the preview on or off from the editor toolbar. Tip: Shortcut Ctrl+G / CMD+G

#### Improvements
- **Complete Redesign of Preferences Screen**: Newly revamped with a modern and sophisticated design.
- **Recent List Clear Button**: The behavior has changed to clear the list without including pinned files.


## 2.2.0
#### Improvements
- **CJK IME Enter Fix Line Break Improvement**: When the `CJK IME Enter Fix` option is enabled in Settings → Editor, pressing Enter once allows line breaks while inputting CJK characters. (Affected platforms: macOS, Linux)

#### Others
- **Beta Tag Removal**: Removed the beta tag as it is sufficiently stable.



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
