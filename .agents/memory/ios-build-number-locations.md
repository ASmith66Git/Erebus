---
name: iOS build number locations
description: All six places that must be updated when bumping the iOS build number, and which one EAS actually reads.
---

## The six locations

| File | Field |
|------|-------|
| `ios/Erebus.xcodeproj/project.pbxproj` (×2 occurrences) | `CURRENT_PROJECT_VERSION` |
| `ios/Erebus/Info.plist` | `CFBundleVersion` |
| `app.config.js` | `ios.buildNumber` |
| `app.config.js` | `android.versionCode` |
| `android/app/build.gradle` | `versionCode` |

## What EAS actually reads

EAS Build reads **`CFBundleVersion` from `ios/Erebus/Info.plist`** as the authoritative build number — not `project.pbxproj`. The submit script reads `project.pbxproj` to log the version, but EAS ignores that for the actual IPA metadata.

**Why:** "EAS Build will use the value found in the native code." The native code for iOS build number is `Info.plist`, not Xcode build settings.

**How to apply:** When bumping build number, always update all six locations. Do `grep "CURRENT_PROJECT_VERSION\|CFBundleVersion\|versionCode\|buildNumber"` across all five files to verify before triggering the build.
