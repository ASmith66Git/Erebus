#!/usr/bin/env bash
set -euo pipefail

# Build the project archive without invoking git (uses .easignore instead of
# .gitignore). Required when building from the Replit environment, where direct
# git operations are restricted.
export EAS_NO_VCS=1

echo "=== Erebus iOS Build & Submit ==="
echo ""

# Validate secrets
[ -z "${ASC_API_KEY_CONTENT:-}" ] && { echo "ERROR: ASC_API_KEY_CONTENT is not set" >&2; exit 1; }

# Write ASC API key. The secret value may arrive in any of these shapes:
#   * proper multi-line PEM (with real newlines)
#   * single line with literal "\n" escape sequences
#   * single line where newlines were collapsed to spaces
# Normalise by extracting the base64 body and reformatting as canonical PEM.
B64=$(printf '%b' "$ASC_API_KEY_CONTENT" \
  | sed -E 's/-----BEGIN[^-]*-----//g; s/-----END[^-]*-----//g' \
  | tr -d ' \t\r\n')
{
  echo "-----BEGIN PRIVATE KEY-----"
  echo "$B64" | fold -w 64
  echo "-----END PRIVATE KEY-----"
} > asc-api-key.p8

# Sanity check: file should have at least 3 lines and parse as a valid EC key
LINES=$(wc -l < asc-api-key.p8)
if [ "$LINES" -lt 3 ]; then
  echo "ERROR: asc-api-key.p8 has only $LINES lines after normalisation; secret looks malformed" >&2
  exit 1
fi
if command -v openssl >/dev/null 2>&1; then
  if ! openssl pkey -in asc-api-key.p8 -noout 2>/dev/null; then
    echo "ERROR: asc-api-key.p8 failed OpenSSL validation; the secret value is not a valid PKCS#8 EC key" >&2
    exit 1
  fi
fi
echo "1. App Store Connect API key written and validated ($LINES lines)"

# Show version info
VERSION=$(node -e "console.log(require('./app.config.js').expo.version)")
BUILD_NUMBER=$(node -e "try { const p = require('./ios/Erebus.xcodeproj/project.pbxproj'); } catch(e) {} const fs = require('fs'); const f = fs.readFileSync('ios/Erebus.xcodeproj/project.pbxproj','utf8'); const m = f.match(/CURRENT_PROJECT_VERSION = (\\d+)/); console.log(m ? m[1] : 'unknown')")
echo "2. Version: ${VERSION} (build ${BUILD_NUMBER})"
echo ""

MODE="${1:-build}"

if [ "$MODE" = "submit-only" ]; then
  echo "3. Submitting latest iOS build to App Store Connect (no new build)..."
  echo ""
  npx eas submit \
    --platform ios \
    --profile production \
    --latest \
    --non-interactive
else
  echo "3. Starting EAS build + auto-submit to App Store Connect..."
  echo ""
  EAS_SKIP_AUTO_FINGERPRINT=1 npx eas build \
    --platform ios \
    --profile production \
    --non-interactive \
    --auto-submit
fi

echo ""
echo "=== Done! Check TestFlight for the new build. ==="
