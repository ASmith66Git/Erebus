---
name: RN performVoidMethodInvocation crash on iOS 26.5.2
description: Race condition in RN 0.81.x binary that crashes any app on iOS 26.5.2 when a void TurboModule method throws an NSException. Fixed in RN 0.83.x / Expo SDK 55.
---

## The Rule
Never ship this app on Expo SDK 54 (RN 0.81.x) against iOS 26.5.2 or later. The crash is unfixable from JS.

**Why:** RN 0.81.x's `performVoidMethodInvocation` dispatches NSException-to-JS-error conversion on `com.meta.react.turbomodulemanager.queue` while the Hermes JS runtime is concurrently running on `com.facebook.react.runtime.JavaScript`. iOS 26.5.2 security patches made this race reliably fatal (SIGSEGV). The binary is pre-compiled — no JS-side workaround exists.

**How to apply:** If the app regresses to crashing on launch on iOS 26.x, check the Expo SDK version first. Must be SDK 55+ (RN 0.83.x) to be safe.

## Symptoms
- Crash within ~320ms of launch
- faultingThread on either `com.meta.react.turbomodulemanager.queue` or `com.facebook.react.runtime.JavaScript`
- Stack always contains `performVoidMethodInvocation` → `convertNSExceptionToJSError`
- SIGSEGV / EXC_BAD_ACCESS with corrupted pointer (e.g. 0x2020202020, 0x0a31323a...)

## What Does NOT Fix It (tried)
- Deferring RevenueCat `Purchases.configure()` from module-level to useEffect
- Upgrading react-native-purchases v9 → v10
- Rolling back app code to a previous build

## Fix
Upgrade to Expo SDK 55 / RN 0.83.x. Run `npx expo install --fix` after bumping expo version.
