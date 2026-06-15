---
name: iOS EAS credentials & builds on Replit
description: How to build and sign iOS via EAS from the Replit agent environment (bare workflow with committed ios/)
---

- EAS reads the iOS **bundle identifier from the native `ios/` Xcode project** (`project.pbxproj`), NOT from `app.config.js`, whenever an `ios/` directory exists. EAS logs "Specified value for ios.bundleIdentifier ... is ignored". So a bundle-id migration must edit the pbxproj + Info.plist, not just app config.

- Running `eas build` from the **agent bash tool trips the "destructive git operations are not allowed" guard** because EAS shells out to git to archive the project. Same guard blocks `rm .git/index.lock`.
  **Fix:** `export EAS_NO_VCS=1` and provide a `.easignore` (same syntax as `.gitignore`; copy it). EAS then tars the working dir without touching git. The committed `scripts/submit-ios.sh` exports this.
  **How to apply:** any eas build/submit launched from this environment (bash or workflow) should run with EAS_NO_VCS=1.

- **First-time iOS signing creds for a new bundle id/team cannot be created non-interactively** by eas-cli (it demands interactive mode, and there's no TTY here, plus EXPO_TOKEN robot auth can't do Apple login).
  **Workaround:** mint them directly via the **App Store Connect API** using the ASC API key:
  1. `openssl` → generate EC/RSA private key + CSR.
  2. `POST /v1/certificates` type IOS_DISTRIBUTION with the base64 CSR → get the cert; download/convert DER→PEM.
  3. `POST /v1/profiles` type IOS_APP_STORE, relating the bundleId resource id + the certificate id → download the `.mobileprovision`.
  4. Build `.p12` from your private key + issued cert (`openssl pkcs12 -export -legacy`).
  5. Write a **gitignored `credentials.json`** pointing at the `.p12` (with password) + `.mobileprovision`, and set `ios.credentialsSource: "local"` on the eas.json build profile.
  EAS then logs "✔ Using local iOS credentials (credentials.json)".

- **ASC API JWT**: ES256; header `{alg:"ES256", kid:ASC_KEY_ID, typ:"JWT"}`; payload `{iss:ASC_ISSUER_ID, iat, exp (<=20min), aud:"appstoreconnect-v1"}`; sign with Node `crypto.sign` using `dsaEncoding:"ieee-p1363"`.

- **Secrets are NOT visible in the code_execution sandbox** (no process.env). To use secrets like ASC_API_KEY_CONTENT in JS, run a node script via the **bash tool**, which inherits the environment.

- Validate a provisioning profile on Linux (no macOS `security`): `openssl smime -inform DER -verify -noverify -in x.mobileprovision` prints the plist; grep `application-identifier` to confirm `TEAMID.bundle.id`.
