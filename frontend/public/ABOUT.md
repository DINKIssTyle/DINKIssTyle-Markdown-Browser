# About DKST Markdown Browser

<div style="display: flex; justify-content: center; align-items: center; width: 100%; padding:20px;"><img src="icon-512.png" alt="" style="width: 128px;"></div>


<div align="center" style="font-size: 1.2rem;"> A lightweight, elegant cross-platform Markdown viewer</div>

## Features

### New! Version 2.0!
- ✨ **AI Assistance**: AI assistant features for writing and editing Markdown documents.
- **Flow State**: Continuous Writing markdown editor that keeps your workflow uninterrupted.
---
- **Dual Rendering Engines**: Choose between `Marked` and `Remark` for your preferred rendering style.
- **Search & Navigation**: Quickly search for keywords within the current folder and navigate through historical files.
- **Modern UI**: Sleek dark-mode interface with smooth transitions and Material Design icons.
- **Customizable**: Adjustable font sizes and live theme switching (Light/Dark).
- **Native Experience**: Native macOS menu bar, About dialog, and window controls.
- **File Management**: Recent files list and support for Drag & Drop to open files instantly.
- **Cross-Platform**: Optimized for macOS, Windows, and Linux.


## File Association Behavior

The app now handles Markdown files from three entry paths with the same open flow:

- **First launch with a file path argument**: `DKST Markdown Browser /path/to/file.md`
- **Open with app while an instance is already running**: the existing window receives the new file path
- **macOS Finder document-open event**: the OS sends the selected file directly to the app

Supported extensions:

- `.md`
- `.markdown`

## OS-specific Setup Guide

### macOS

This repo already includes document type registration in [build/darwin/Info.plist](build/darwin/Info.plist). The runtime side is handled by `Mac.OnFileOpen` plus normal launch-argument parsing, so these cases work:

- double-clicking a `.md` or `.markdown` file
- right-click -> `Open With`
- opening another Markdown file while the app is already running

Recommended release checklist:

- build a fresh `.app` bundle
- replace any previously installed copy so Finder uses the new bundle metadata
- if Finder keeps an old association cache, re-select the app once in `Get Info -> Open with`

### Windows

Runtime support is now in place for both:

- first launch with `DKST Markdown Browser.exe "C:\path\file.md"`
- launching another Markdown file while the app is already open, via Wails single-instance forwarding

For Explorer file association, you still need installer or registry registration. In this repo, the NSIS template already knows how to create associations when `wails.json` contains `info.fileAssociations`.

Recommended Windows packaging steps:

- add an `info.fileAssociations` entry to `wails.json`
- ensure the referenced `.ico` file exists under `build/windows/`
- rebuild the installer so the NSIS association macros run
- verify the generated open command includes `"%1"` quoted

If you prefer manual registration, create an `open` command equivalent to:

```text
"C:\Program Files\DKST Markdown Browser\DKST Markdown Browser.exe" "%1"
```

### Ubuntu / Linux

Runtime support is also in place for Linux:

- first launch with `./DKST Markdown Browser /path/to/file.md`
- opening a second Markdown file while the app is already open, via Wails DBus single-instance forwarding

For desktop integration, Linux still needs a `.desktop` entry and MIME association outside the binary itself.

Recommended Ubuntu packaging steps:

- install the app binary to a stable path such as `/opt/dkst-markdown-browser/`
- install a `.desktop` file under `~/.local/share/applications/` or `/usr/share/applications/`
- set `MimeType=text/markdown;`
- register the desktop file as the default handler with `xdg-mime`

Example desktop entry:

```ini
[Desktop Entry]
Name=DKST Markdown Browser
Exec=/opt/dkst-markdown-browser/DKST\ Markdown\ Browser %F
Type=Application
Terminal=false
Categories=Office;Viewer;
MimeType=text/markdown;
```

Example association command:

```bash
xdg-mime default dkst-markdown-browser.desktop text/markdown
```

## Prerequisites

- **Go**: Version 1.23 or higher
- **Wails**: Version v2.11.0 or higher
- **Node.js**: Version 18 or higher (with npm)
- **CGO Tools**: Required for native compilation (e.g., GCC or Clang)

## Building from Source

### macOS
The macOS build script generates a universal binary (if chosen) and handles the application bundle (`.app`).
```bash
chmod +x build-macOS.sh
./build-macOS.sh [arm64 | amd64 | universal]
```

### Windows
The Windows build script generates the executable (`.exe`) with embedded icons.
```cmd
build-Windows.bat [amd64 | arm64 | 386]
```

### Linux
The Linux build script generates the binary for your specific architecture.
```bash
chmod +x build-Linux.sh
./build-Linux.sh [amd64 | arm64 | arm]
```

## Folder Structure

- `frontend/`: Svelte/React/Vue (standard JS/HTML/CSS) frontend assets.
- `build/`: Project icons, macOS `Info.plist`, and build-related assets.
- `dist/`: Final build output directory.
- `doc/`: Screenshots and documentation assets.

## License

Created by **DINKIssTyle**.
Copyright (c) 2026 DINKI'ssTyle. All rights reserved.
Refer to `THIRD-PARTY-NOTICES.md` for open-source library licenses.