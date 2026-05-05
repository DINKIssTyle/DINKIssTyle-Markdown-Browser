# About DKST Markdown Browser

<p align="center">
  <img src="frontend/public/icon-192.png" width="128">
</p>

<p align="center">
  <strong>Lightweight and elegant cross-platform<br>Markdown viewer and editor!</strong>
</p>


## Features

### New! Version 2.0!
- ✨ **AI Assistance**: AI assistant features for writing and editing Markdown documents.
- **Flow State**: Continuous Writing markdown editor that keeps your workflow uninterrupted.
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
- **Dual Rendering Engines**: Choose between `Marked` and `Remark` for your preferred rendering style.
- **Search & Navigation**: Quickly search for keywords within the current folder and navigate through historical files.
- **Markdown Document Editor**: You can create and edit Markdown documents. AI assistance helps make the document creation process easy and fun by aiding in Markdown document writing.
- **Cross-Platform**: Optimized for macOS, Windows, and Linux.

Supported extensions:

- `.md`
- `.markdown`

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


## Installation Methods

### Windows
Move the executable file to your desired location and use it.

### macOS
The standard method is to move the executable(App Bundle) file to the `Applications` folder or the `~/Applications` directory.

**This app must have its 'Quarantine' attribute removed** because it does not have a trusted developer signature.  By directly removing the 'Quarantine' attribute set on the app, you make the app a trusted file.
> The commands below are for when the app is installed in the Applications folder.

```bash
xattr -cr "/Applications/DKST\ Markdown\ Browser.app"
```
Press `Enter` after entering the command to remove the isolation.

### Linux (Ubuntu, CentOS, etc.)
After launching the executable file, click the Install link at the bottom of the Start page to complete installation.



## License

Created by **DINKIssTyle**.
Copyright (c) 2026 DINKI'ssTyle. All rights reserved.
Refer to `THIRD-PARTY-NOTICES.md` for open-source library licenses.
