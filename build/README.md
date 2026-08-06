# Build Directory

The build directory is used to house all the build files and assets for your application. 

The structure is:

* bin - Output directory
* darwin - macOS specific files
* windows - Windows specific files

## Mac

The `darwin` directory holds files specific to Mac builds.
These may be customised and used as part of the build. To return these files to the default state, simply delete them
and
build with `wails3 task build`.

The directory contains the following files:

- `Info.plist` - the main plist file used for macOS packaging.
- `Info.dev.plist` - the development plist used by the Wails 3 development workflow.

## Windows

The `windows` directory contains the manifest and resource files used by the Wails 3 build tasks.
These may be customised for your application. To return these files to the default state, simply delete them and
build with `wails3 task build GOOS=windows`.

- `icon.ico` - The icon used for the application. This is used by the Wails 3 Windows build task. If you wish to
  use a different icon, simply replace this file with your own. If it is missing, a new `icon.ico` file
  will be created using the `appicon.png` file in the build directory.
- `installer/*` - The files used to create the Windows installer after the Wails 3 binary build.
- `info.json` - Application details used for Windows builds. The data here will be used by the Windows installer,
  as well as the application itself (right click the exe -> properties -> details)
- `wails.exe.manifest` - The main application manifest file.
