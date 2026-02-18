# Cubetris — Mobile Export Guide (Godot 4)

Step-by-step instructions for exporting Cubetris to Android and iOS using Godot 4.2+.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Install Export Templates](#install-export-templates)
3. [Android Export](#android-export)
4. [iOS Export](#ios-export)
5. [Touch Control Testing on Desktop](#touch-control-testing-on-desktop)
6. [Performance Tuning by Device Tier](#performance-tuning-by-device-tier)
7. [App Store Submission Checklist](#app-store-submission-checklist)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Godot 4 | 4.2+ | Use the standard build (not .NET) unless you need C# |
| Android Studio | Latest | Required for Android SDK + NDK |
| Xcode | 15+ | macOS only — required for iOS/tvOS builds |
| Apple Developer Account | $99/yr | Required to publish to the App Store |
| Google Play Developer Account | $25 one-time | Required to publish to Google Play |
| Java JDK | 17 | Required by Gradle/Android toolchain |

---

## Install Export Templates

Every Godot version ships matching export templates that must be installed before you can build.

1. Open Godot → **Editor → Manage Export Templates**
2. Click **Download and Install**
3. Wait for the download to complete (~300 MB)

If you need a specific version, download from:
`https://godotengine.org/download/archive/`

Unzip and place in:
- **Linux/macOS**: `~/.local/share/godot/export_templates/<version>/`
- **Windows**: `%APPDATA%\Godot\export_templates\<version>\`

---

## Android Export

### 1 — Install the Android SDK and NDK

**Via Android Studio (recommended):**

```
Android Studio → SDK Manager
  ✅ Android SDK Platform (API 34)
  ✅ Android SDK Build-Tools 34.x
  ✅ NDK (Side by side) 23.2.x
  ✅ Android SDK Command-line Tools
```

**Via command line (alternative):**
```bash
# macOS / Linux
sdkmanager "platforms;android-34" "build-tools;34.0.0" \
           "ndk;23.2.8568313" "cmdline-tools;latest"
```

### 2 — Configure Godot's Android SDK Path

**Editor → Editor Settings → Export → Android:**
```
Android SDK Path: /Users/<you>/Library/Android/sdk   # macOS
                  C:\Users\<you>\AppData\Local\Android\Sdk  # Windows
                  ~/Android/Sdk                       # Linux
```

Godot will auto-detect the NDK inside that path.

### 3 — Create a Keystore (Sign Your App)

Google Play requires a signed APK/AAB. Create your keystore once and keep it safe.

```bash
keytool -genkey -v \
  -keystore cubetris-release.keystore \
  -alias cubetris \
  -keyalg RSA \
  -keysize 2048 \
  -validity 25000
```

Store this file **outside** version control (add to `.gitignore`).

### 4 — Create the Android Export Preset

**Project → Export → Add → Android**

Key settings:

| Setting | Value |
|---------|-------|
| Package / Unique Name | `com.yourname.cubetris` |
| Version Code | `1` (increment for each Play Store upload) |
| Version Name | `1.0.0` |
| Min SDK | `24` (Android 7.0 — covers 98%+ devices) |
| Target SDK | `34` |
| Orientation | `Landscape` |
| Keystore / Release | path to `cubetris-release.keystore` |
| Keystore / Release User | your alias (`cubetris`) |
| Keystore / Release Password | your password |

**Permissions to enable:**
- `VIBRATE` (haptic feedback on launch)
- `INTERNET` (optional — for future leaderboards)

**Graphics:**
- `Renderer`: Use **Compatibility** renderer for widest device support (OpenGL ES 3.0)
  - Change in `project.godot`:  `renderer/rendering_method="gl_compatibility"`
  - `config/features` should include `"Forward Plus"` **or** `"Mobile"` (pick one)

### 5 — Build and Test

```bash
# Debug APK (install directly to device via USB)
# Project → Export → Android → Export Project → Debug

# Release AAB for Play Store
# Project → Export → Android → Export Project → Release (AAB)
```

Install debug APK via ADB:
```bash
adb install -r cubetris-debug.apk
```

Enable USB Debugging on device:
`Settings → Developer Options → USB Debugging ✅`

### 6 — Recommended `project.godot` Changes for Android

The updated `project.godot` in this repo already includes these. Reference only:

```ini
[display]
window/handheld/orientation=2   ; 2 = SCREEN_LANDSCAPE
window/size/viewport_width=1920
window/size/viewport_height=1080

[input_devices]
pointing/emulate_touch_from_mouse=true

[rendering]
renderer/rendering_method="gl_compatibility"
```

---

## iOS Export

> **Requires macOS with Xcode installed.**

### 1 — Install Xcode and Command Line Tools

```bash
xcode-select --install
```

Open Xcode once to accept the license:
```bash
sudo xcodebuild -license accept
```

### 2 — Apple Developer Setup

1. Enroll at [developer.apple.com](https://developer.apple.com) — $99/yr
2. Create an **App ID**: `com.yourname.cubetris`
3. Create a **Distribution Certificate** (App Store Connect)
4. Create a **Provisioning Profile** (App Store distribution)
5. Download and double-click the `.mobileprovision` file to install it

### 3 — Create the iOS Export Preset

**Project → Export → Add → iOS**

| Setting | Value |
|---------|-------|
| Bundle Identifier | `com.yourname.cubetris` |
| App Store Team ID | Your 10-character Team ID from developer.apple.com |
| Version | `1.0` |
| Build | `1` |
| Orientation | `Landscape Left` + `Landscape Right` |
| Min iOS Version | `13.0` |
| Code Sign Identity | `iPhone Distribution: Your Name` |
| Provisioning Profile | path to your `.mobileprovision` |

### 4 — Export to Xcode Project

```
Project → Export → iOS → Export Project
```

This creates an Xcode `.xcodeproj` folder. Open it in Xcode:

```bash
open cubetris/cubetris.xcodeproj
```

### 5 — Build and Archive in Xcode

1. Select your provisioning profile in **Signing & Capabilities**
2. Set scheme to **Any iOS Device (arm64)**
3. **Product → Archive**
4. **Distribute App → App Store Connect → Upload**

### 6 — TestFlight (Recommended Before Submission)

After upload:
1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Select your app → TestFlight
3. Add internal testers (up to 100)
4. Submit for external testing (up to 10,000 — requires Apple review, ~1 day)

---

## Touch Control Testing on Desktop

You do not need a physical device to test the touch layer during development.

**In `project.godot` (already configured):**
```ini
[input_devices]
pointing/emulate_touch_from_mouse=true
```

This makes mouse clicks fire `InputEventScreenTouch` and drags fire `InputEventScreenDrag`, so `TouchInputManager.gd` activates on desktop too.

**Force MobileUIOverlay visible on desktop:**
```gdscript
# In MobileUIOverlay.gd, temporarily comment out:
# if auto_hide_on_desktop and not TouchInputManager.is_mobile():
#     hide()
#     return
```

**Force a device tier for profiling:**
```gdscript
# In GameManager or from the Remote Inspector:
MobilePerformanceManager.force_tier(MobilePerformanceManager.DeviceTier.LOW)
```

---

## Performance Tuning by Device Tier

`MobilePerformanceManager.gd` automatically detects and applies quality settings at startup.

| Setting | LOW (≤2 GB RAM / old GPU) | MEDIUM | HIGH (≥6 GB / modern GPU) |
|---------|--------------------------|--------|---------------------------|
| Voxels per explosion | 6 | 12 | 20 |
| Max active voxels | 50 | 120 | 200 |
| Target FPS | 30 | 60 | 60 |
| MSAA | Disabled | 2× | 4× |
| Shadows | Off | On | On |
| Object pool — cubes | 30 | 50 | 50 |
| Object pool — voxels | 60 | 100 | 100 |

**To override from the Godot Remote Inspector during a profiling session:**
```
Remote → Root → MobilePerformanceManager → Call force_tier(0/1/2)
```

**Compatibility renderer** (recommended for Android): changes automatic via `project.godot`:
```ini
[rendering]
renderer/rendering_method="gl_compatibility"
```
This disables Forward+ features but runs on virtually all Android devices (OpenGL ES 3.0).

---

## App Store Submission Checklist

### Google Play

- [ ] AAB (Android App Bundle) built in Release mode
- [ ] App signed with release keystore
- [ ] Version code incremented from previous upload
- [ ] Store listing: title, short/full description, screenshots (phone + tablet), feature graphic
- [ ] Privacy Policy URL provided (required even with no account system)
- [ ] Content rating questionnaire completed (likely "Everyone")
- [ ] Target API level is current year's requirement (API 34 as of 2024)
- [ ] 64-bit ARM support confirmed (Godot 4 provides this by default)

### Apple App Store

- [ ] Archive built and uploaded via Xcode
- [ ] App Review information completed (demo credentials if login required)
- [ ] Screenshots: 6.7" iPhone, 12.9" iPad Pro (required sizes)
- [ ] App Store listing: title (≤30 chars), subtitle (≤30 chars), keywords (≤100 chars), description
- [ ] Privacy Policy URL provided
- [ ] Content rating selected
- [ ] In-App Purchases declared (none for base game)
- [ ] App passed internal testing on TestFlight

---

## Troubleshooting

### Android: "adb: command not found"
Add Android SDK platform-tools to your PATH:
```bash
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"  # macOS
```

### Android: Gradle build fails
Ensure Java 17 is active:
```bash
java -version   # must show 17.x
```
If multiple JDKs installed, set `JAVA_HOME`:
```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
```

### Android: APK installs but crashes immediately
- Check Godot output via `adb logcat -s godot`
- Common cause: export templates version mismatch (re-download from Editor → Manage Export Templates)

### iOS: "No signing certificate found"
- Open Xcode → Preferences → Accounts → Download Manual Profiles
- Verify provisioning profile is installed and not expired

### iOS: Build fails with "Missing entitlements"
- Check **Signing & Capabilities** in Xcode — ensure the team is selected
- Delete `DerivedData` and rebuild: `rm -rf ~/Library/Developer/Xcode/DerivedData`

### Touch controls not firing on device
- Confirm `TouchInputManager` is listed as an Autoload in Project Settings
- Verify `GameManager.current_state` is `PLAYING` when testing (TouchInputManager ignores input in other states)
- For Android: check `VIBRATE` permission if haptics silently fail

### MobileUIOverlay not visible
- On desktop: set `auto_hide_on_desktop = false` in the Inspector
- On device: confirm `TouchInputManager.is_mobile()` returns `true` (check for `mobile`/`android`/`ios` OS features)

### Performance drops below 30 FPS on old devices
1. Switch renderer to `gl_compatibility`
2. Call `MobilePerformanceManager.force_tier(DeviceTier.LOW)` at startup
3. Reduce `ObjectPool.initial_voxel_pool_size` to 30
4. Disable shadows via DirectionalLight3D group (handled automatically by LOW tier)

---

*Last updated: 2026-02*
