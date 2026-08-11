---
name: RevenueCat key selection for native vs web
description: Which RC API key to use on native iOS vs web — getting this wrong causes purchasePackage() to hang silently.
---

## Rule
Never use the `test_` RC key on native iOS, even in debug/`__DEV__` mode.

**Why:** The `test_` key puts RC into its mock "Test Store" mode (designed for web/browser environments with no real StoreKit). On native iOS, `purchasePackage()` goes through RC's mock infrastructure instead of real StoreKit and hangs indefinitely — no error, no resolution, just a spinning UI forever.

**How to apply:**
- `Platform.OS === "web"` or `executionEnvironment === "storeClient"` → use `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` (`test_...`)
- Native iOS (debug or release) → use `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (`appl_...`)
- Native Android → use `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (`goog_...`)
- Do NOT gate on `__DEV__` for key selection — EAS release builds worked because `__DEV__=false` happened to use the right key, but Xcode debug builds had `__DEV__=true` and used the wrong key.

## Symptom that led here
EAS → TestFlight worked fine (release build, `__DEV__=false`, used `appl_` key).
Xcode debug build: `💰 Purchasing Product 'monthly'` logged, then nothing — infinite spinner.
RC also emitted "Restoring purchases not available in Test Store" confirming mock store was active.
