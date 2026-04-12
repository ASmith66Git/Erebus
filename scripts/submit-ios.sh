#!/usr/bin/env bash
set -euo pipefail

echo "=== Erebus iOS Build & Submit ==="
echo ""

# Validate secrets
[ -z "${ASC_API_KEY_CONTENT:-}" ] && { echo "ERROR: ASC_API_KEY_CONTENT is not set" >&2; exit 1; }

# Write ASC API key (convert literal \n to real newlines if needed)
printf '%b' "$ASC_API_KEY_CONTENT" > asc-api-key.p8
echo "1. App Store Connect API key written"

# Show version info
VERSION=$(node -e "console.log(require('./app.config.js').expo.version)")
BUILD_NUMBER=$(node -e "try { const p = require('./ios/Erebus.xcodeproj/project.pbxproj'); } catch(e) {} const fs = require('fs'); const f = fs.readFileSync('ios/Erebus.xcodeproj/project.pbxproj','utf8'); const m = f.match(/CURRENT_PROJECT_VERSION = (\\d+)/); console.log(m ? m[1] : 'unknown')")
echo "2. Version: ${VERSION} (build ${BUILD_NUMBER})"
echo ""

# Build and auto-submit
echo "3. Starting EAS build + auto-submit to App Store Connect..."
echo ""
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build \
  --platform ios \
  --profile production \
  --non-interactive \
  --auto-submit

echo ""
echo "=== Done! Check TestFlight for the new build. ==="
