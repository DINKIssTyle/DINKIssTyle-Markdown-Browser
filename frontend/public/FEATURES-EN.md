# FEATURES

This document describes the features of DKST Markdown Browser.
DKST Markdown Browser allows you to read, edit, or create new Markdown documents.

## Common

- **Open Markdown**: You can open Markdown documents.
- **Sidebar - File Tree**: Navigate the directory structure of the opened document.
- **Sidebar - Search**: Search for keywords within the opened documents and subfolders.
- **Image Viewer**: Provides basic functions such as browsing and zooming in on opened images via the file tree.
- **Keyboard Accessibility**: Most functions can be accessed or navigated using the keyboard.


## Reader
#### DKST Markdown Browser excels at browsing hyperlinked Markdown documents and offers the following features:

- **Sidebar - Outline**: Visually displays the structure of a Markdown document and organizes it like a table of contents, allowing quick navigation to specific locations.
- **Hyperlink Navigation**: Browse hyperlinked Markdown documents like a web browser.
- **Home Function**: The initially opened document serves as the home, allowing you to easily return there even after navigating to other documents via hyperlinks.
- **Font Size Adjustment**: Easily adjust the font size of the document using buttons or keyboard shortcuts.
- **Light/Dark Themes**: Choose between light and dark themes according to your preference.
- **Print Function**: Print the document.
- **Rendering Engines**: Select between `Marked` and `Remark`.
  - Rendered items:
    - **Formulas**: Renders LaTeX formulas to HTML using `katex*`.
    - **Diagrams**: Renders Mermaid code blocks to SVG using `Mermaid`.
    - **Syntax Highlight**: Renders code blocks using `highlight.js`.




## Editor

#### DKST Markdown Browser provides a modern Markdown document editing environment by embedding `CodeMirror`.

- **Syntax Highlight**: Supports Syntax Highlighting to improve editing readability. You can select presets or configure custom color palettes in the settings.
- **`/` Shortcut**: Pressing `/` while editing allows you to use toolbar tools without mouse clicks.
- **Link Insertion**: Easily insert `URLs` or `local documents`. Inserting a `local document` uses relative paths, making document creation convenient.
- **Image Insertion**: Easily insert `URLs` or `local images`. Inserting a `local image` uses relative paths, making document creation convenient.
- **Insert via Sidebar - File Tree**: Select a document, file, or image from the file tree and use the right-click menu to insert that item directly at the cursor position in the editor.
- **Intelligent Insertion Path Judgment**: When inserting a document or image, if the path contains spaces, it is enclosed in `<` and `>` for universality.
- **Documents Linked from Editor**: If you click a hyperlink in the document being edited, that document is displayed in the viewer. A floating button is provided to return to the editing document or open it in a new tab.
- **Editor and Viewer Scroll Synchronization**: Synchronizes the scroll position between the editing screen and the rendered viewer. This can be disabled in options.
- **Find and Replace**: Search or batch replace text within the document being edited.
- **CJK Compatibility Mode**: Provided in a mode compatible with `CodeMirror` and the "Marked Text" input method of East Asian input methods, preventing unnecessary blank lines.
- **Editor Font Size Adjustment**: Easily adjust the font size of the editor window using buttons or keyboard shortcuts.


>[!TIP] Learn about [Default Shortcuts](SHORTCUTS.md). Using shortcuts is very convenient.


## Editor with AI Assist
DKST Markdown Browser offers AI assistance utilizing a Local LLM. Please check the AI section in the editor settings to configure and toggle this feature.

- **AI Feature Toolbar**: When activated, an `AI` floating button appears in the bottom left of the editor.
  - Click the AI button to temporarily pause the feature.
  - Click the expand button to show or hide the entire AI feature toolbar.
     - **Temperature**: Adjust the temperature to control the creativity of the AI response. Higher temperatures result in more creative responses from the AI.
     - **Autocomplete**: Toggle Fill-in-the-Middle (FIM). Proper operation requires selecting an appropriate LLM model.
     - **Context+**: Uses parts of the text before and after the selected text as context to assist the user. This may require more context budget and processing time.
     - **Github Compatible**: If writing a GitHub document, the AI attempts assistance compliant with the GitHub Flavored Markdown (GFM) specification.
     - **Talk to me**: The AI processes the user's response and reports on the processing content briefly **every time**.



### Trying out AI Feature Usage

#### Getting AI Assist with Text Selection
1. Select the sentence you are editing. The AI prompt window appears upon selecting a sentence.
1. Press `/` to directly input the prompt into the prompt window.
1. Try starting lightly like this: `Improve sentence`, `Translate to English`
1. The selected sentence will be improved or translated.

Prompt Examples: "Organize into a table", "Wrap in div and center align with width 128px", "Change to lowercase", "Rewrite the sentence in simpler terms", "Spell check", "Draw as a diagram"

#### Getting AI Assist without Text Selection
1. Press `/` and select `Ask AI` (Enter key) to bring up the AI prompt window.
1. You can also call the AI prompt using a shortcut: `CTRL+/` or `⌘+/`
1. Try starting lightly like this: `Enter a table with 10 fruits and vegetables each`, `Write the benefits of apples briefly in Markdown format`
1. You will see a table of fruits and vegetables, or the benefits of apples in an LLM-like response.

Prompt Examples: "Draw a cat inside a code block", "Write a Python Hello World example"

>[!Note] The LLM operating in DKST Markdown Browser does not save the context of the conversation. This is to remain faithful to its role as a tool, and it does not remember previous conversations. Furthermore, it cannot refer to any external information such as the internet, current time, or location.

- **Recommended LLM Models**
   - Use an LLM model in the `3B~4B` range that does not have or can disable `Reasoning`.
   - **AI Assist Quality** can vary greatly depending on the LLM model used.
