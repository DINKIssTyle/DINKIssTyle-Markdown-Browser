# DKST Markdown Browser 소개

<p align="center">
  <img src="frontend/public/icon-192.png" width="128">
</p>

<p align="center">
  <strong>轻巧优雅的跨平台<br>Markdown 查看器和编辑器！</strong>
</p>

<div align="center"><b>iOS/iPadOS</b><br><a href="https://apps.apple.com/kr/app/dkst-markdown-browser/id6799445013" target="blank"><img src="doc/appstore2.png" alt="" width="120"></a><br><br></div>

## 新闻

### ✨ 全新！2.0 版本！
- **AI 支持**：可撰写和编辑 Markdown 文档的 AI 助手功能。
- **心流状态 (Flow State)**：不打断工作流程的连续写作 Markdown 编辑器。
<p align="center">
  <img src="frontend/public/img/200_ai_01.gif" width="90%">
</p>
<p align="center">
  <img src="frontend/public/img/200_ai_02.gif" width="90%">
</p>
<p align="center">
  <img src="frontend/public/img/200_ai_03.gif" width="90%">
</p>

---
# 功能特性

本文档介绍了 DKST Markdown Browser 的功能。
DKST Markdown Browser 可用于阅读、编辑或新建 Markdown 文档。

## 通用功能

- **打开 Markdown**：可以打开 Markdown 文件。
- **侧边栏 - 文件树**：可浏览已打开文档的目录结构。
- **侧边栏 - 搜索**：可在打开的文档及子文件夹中搜索关键词。
- **图像查看器**：通过文件树可浏览打开的图像，并提供缩放等基本功能。
- **键盘访问**：大多数功能都可以通过键盘访问或操作。
- **支持的扩展名**：`.md`, `.markdown`

## 阅读器 (Reader)
#### DKST Markdown Browser 非常适合浏览超链接的 Markdown 文档，并提供以下功能：

- **侧边栏 - 大纲**：直观地展示 Markdown 文档的结构，像目录一样组织内容，可快速跳转到相应位置。
- **超链接导航**：如同网页浏览器一样浏览超链接的 Markdown 文档。
- **主页功能**：首次打开的文档作为主页，即使通过超链接跳转到其他文档，也可以轻松返回主页。
- **字体大小调整**：可通过按钮或键盘快捷键轻松调节文档的字体大小。
- **亮/暗主题**：可根据个人喜好选择亮色或暗色主题。
- **打印功能**：可以将文档进行打印。
- **渲染引擎**：可以选择 `Marked` 或 `Remark`。
  - 渲染项
    - **数学公式**：使用 `katex*` 将 LaTeX 公式渲染为 HTML。
    - **图表**：使用 `Mermaid` 将 Mermaid 代码块渲染为 SVG。
    - **语法高亮**：使用 `highlight.js` 渲染代码块。

## 编辑器 (Editor)

#### DKST Markdown Browser 内置了 `CodeMirror`，提供了现代化的 Markdown 文档编辑环境。

- **语法高亮**：支持提升编辑可读性的语法高亮功能，可在设置中选择预设或配置自定义调色板。
- **`/` 快捷键**：编辑过程中输入 `/` 键即可使用工具栏功能，无需鼠标点击。
- **插入链接**：可轻松插入 `URL` 或 `本地文档`。插入“本地文档”时会使用相对路径，方便撰写文档。
- **插入图像**：可轻松插入 `URL` 或 `本地图像`。插入“本地图像”时会使用相对路径，方便撰写文档。
- **通过文件树插入**：可在文件树中选择文档、文件或图像，并利用鼠标右键菜单将其直接插入到编辑器光标位置。
- **智能路径判断**：当插入文档或图像时，如果路径包含空格，为了通用性会被用 `<` 和 `>` 包裹。
- **编辑中跳转的超链接文档**：在编辑过程中点击超链接时，目标文档会在查看器中显示；同时提供返回编辑中的文档或在新标签页打开该文档的浮动按钮。
- **编辑器与查看器滚动同步**：同步编辑屏幕和渲染查看器的滚动位置。可在选项中禁用此功能。
- **查找与替换**：可搜索或批量替换编辑中的文本。
- **CJK 兼容模式**：提供了一种与 `CodeMirror` 和中日韩输入法 `Marked Text` 输入方式兼容的模式，可防止出现不必要的空行。
- **编辑器字体大小调整**：可通过按钮或键盘快捷键轻松调节编辑窗口的字体大小。

>[!TIP] 了解 [基本快捷键](frontend/public/SHORTCUTS.md)。使用快捷键会非常方便。

## AI 辅助编辑 (Editor with AI Assist)
DKST Markdown Browser 利用本地 LLM 提供 AI 助手功能，如需设置或开关此功能，请查看编辑器设置中的 AI 项。

- **AI 功能工具栏**：当功能激活时，编辑器的左下角会出现 `AI` 浮动按钮。
  - 点击 AI 按钮可暂停功能。
  - 点击展开按钮可显示或隐藏完整的 AI 功能工具栏。
     - **温度 (Temperature)**：调节温度可控制 AI 回答的创造性。温度越高，AI 生成的内容越具创意。
     - **自动完成 (Autocomplete)**：开关 Fill-in-the-Middle (FIM) 功能。为确保正常工作，请选择合适的 LLM 模型。
     - **上下文+ (Context+)**：为了协助用户，会使用所选文本前后部分内容作为上下文。这可能需要更多的上下文预算和处理时间。
     - **GitHub 兼容 (Github Compatible)**：如果正在为 GitHub 文档撰写，AI 将尝试提供符合 GitHub Flavored Markdown (GFM) 规范的协助。
     - **跟我聊聊 (Talk to me)**：AI 会处理用户的回复，并**每次**都简要报告处理内容。

### AI 功能使用教程

#### 获取文本选择的 AI 协助
1. 选择您正在编辑的句子。选中句子也会弹出 AI 提示框。
1. 按 `/` 键可直接在提示框中输入提示词。
1. 可以轻松地从以下方式开始：`改进句子`、`翻译成英文`
1. 您选择的句子将被改进或翻译。

提示词示例：“请整理成表格”、“用 div 包裹并居中对齐，宽度 128px”、“改为小写”、“用简单的语言重述句子”、“拼写检查”、“请绘制成图表”

#### 获取无文本选择的 AI 协助
1. 输入 `/` 并选择 `Ask AI` (按回车键) 即可弹出 AI 提示框。
1. 您也可以使用快捷键调用 AI 提示词：`CTRL+/` 或 `⌘+/`
1. 可以轻松地从以下方式开始：`请用表格列出水果和蔬菜各 10 个`、`请以 Markdown 格式简短地写下苹果的功效`
1. 您将看到整理好的水果蔬菜表格，或者 LLM 回答的苹果功效。

提示词示例：“请在代码块中画一只猫”、“编写 Python Hello World 示例”

>[!Note] DKST Markdown Browser 中使用的 LLM 不会保存对话的上下文。这是为了忠实于其作为工具的角色，它也不会记住先前的对话内容。此外，它也无法参考互联网、当前时间或位置等任何外部信息。

- **推荐的 LLM 模型**
   - 请使用规模在 `3B~4B` 左右、且可关闭或不具备复杂推理能力的 LLM 模型。
   - **AI 助手的质量**可能因所使用的 LLM 模型而异。

## 下载
请点击 [此处下载](https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases) 获取最新发布的可执行文件。

## 安装

### Windows
请将可执行文件移动到您想要的位置使用。

### macOS
挂载DMG文件并将应用程序移到“应用程序”文件夹即可使用。

### Linux (Ubuntu, CentOS 等)
运行可执行文件后，请点击启动页面底部的安装链接以完成安装。

## 赞助
<div>
<a href="https://github.com/sponsors/DINKIssTyle">
    <img src="https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor">
  </a>
  <br> 您的赞助能帮助我持续改进这个项目。——而且还能让我有一个完美的借口，可以在家不惹麻烦的情况下，在床上熬夜工作。
</p><br></div>

## 高级用户

### 先决条件

- **Go**：版本 1.23 或更高
- **Wails**：版本 v3.0.0-beta.3（Wails 3 目前为预发布版）
- **Node.js**：版本 18 或更高（包含 npm）
- **CGO 工具**：编译原生代码所需的工具（例如 GCC 或 Clang）

### 从源码构建

#### macOS
macOS 构建脚本会生成通用二进制文件（如果选择）并处理应用程序包 (`.app`)。
```bash
chmod +x build-macOS.sh
./build-macOS.sh [arm64 | amd64 | universal]
```

#### Windows
Windows 构建脚本会生成包含图标的可执行文件 (`.exe`)。
```cmd
build-Windows.bat [amd64 | arm64 | 386]
```

#### Linux
Linux 构建脚本会生成特定架构的二进制文件。
```bash
chmod +x build-Linux.sh
./build-Linux.sh [amd64 | arm64 | arm]
```

## 许可证

**由 DINKIssTyle 制作。**
Copyright (c) 2026 DINKI'ssTyle. 保留所有权利。
开源库的许可证请参阅 `THIRD-PARTY-NOTICES.md`。
