#!/usr/bin/env bash
set -euo pipefail

echo "=== Erebus iOS Build & Submit ==="
echo ""

CREDENTIALS_DIR="credentials/ios"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() { echo "ERROR: $1" >&2; exit 1; }

echo "1. Validating App Store Connect secrets..."
[ -z "${ASC_KEY_ID:-}" ]          && fail "ASC_KEY_ID is not set"
[ -z "${ASC_ISSUER_ID:-}" ]       && fail "ASC_ISSUER_ID is not set"
[ -z "${ASC_API_KEY_CONTENT:-}" ] && fail "ASC_API_KEY_CONTENT is not set"
echo "   OK"

echo ""
echo "2. Writing App Store Connect API key..."
ASC_KEY_FILE="$TEMP_DIR/AuthKey_${ASC_KEY_ID}.p8"
printf '%s' "$ASC_API_KEY_CONTENT" | sed 's/\\n/\n/g' > "$ASC_KEY_FILE"
echo "   Written to $ASC_KEY_FILE"

echo ""
echo "3. Resolving iOS signing credentials..."

DIST_CERT_P12=""
DIST_CERT_PASSWORD_VAL=""
PROV_PROFILE=""

if [ -d "$CREDENTIALS_DIR" ]; then
  echo "   Checking local credentials directory..."
  [ -f "$CREDENTIALS_DIR/distribution.p12" ]       && DIST_CERT_P12="$CREDENTIALS_DIR/distribution.p12"
  [ -f "$CREDENTIALS_DIR/provisioning_profile.mobileprovision" ] && PROV_PROFILE="$CREDENTIALS_DIR/provisioning_profile.mobileprovision"
  if [ -f "$CREDENTIALS_DIR/cert_password.txt" ]; then
    DIST_CERT_PASSWORD_VAL=$(cat "$CREDENTIALS_DIR/cert_password.txt")
  fi
fi

if [ -z "$DIST_CERT_P12" ] && [ -n "${DIST_CERT_P12_BASE64:-}" ]; then
  echo "   Using DIST_CERT_P12_BASE64 from secrets..."
  DIST_CERT_P12="$TEMP_DIR/distribution.p12"
  echo "$DIST_CERT_P12_BASE64" | base64 -d > "$DIST_CERT_P12"
fi

if [ -z "$DIST_CERT_PASSWORD_VAL" ] && [ -n "${DIST_CERT_PASSWORD:-}" ]; then
  DIST_CERT_PASSWORD_VAL="$DIST_CERT_PASSWORD"
fi

if [ -z "$PROV_PROFILE" ] && [ -n "${MAIN_PROFILE_BASE64:-}" ]; then
  echo "   Using MAIN_PROFILE_BASE64 from secrets..."
  PROV_PROFILE="$TEMP_DIR/provisioning_profile.mobileprovision"
  echo "$MAIN_PROFILE_BASE64" | base64 -d > "$PROV_PROFILE"
fi

[ -z "$DIST_CERT_P12" ]       && fail "No distribution certificate found. Provide credentials/ios/distribution.p12 or set DIST_CERT_P12_BASE64 secret."
[ -z "$DIST_CERT_PASSWORD_VAL" ] && fail "No certificate password found. Provide credentials/ios/cert_password.txt or set DIST_CERT_PASSWORD secret."
[ -z "$PROV_PROFILE" ]        && fail "No provisioning profile found. Provide credentials/ios/provisioning_profile.mobileprovision or set MAIN_PROFILE_BASE64 secret."

echo "   Distribution cert: $DIST_CERT_P12"
echo "   Provisioning profile: $PROV_PROFILE"
echo "   OK"

echo ""
echo "4. Writing credentials.json..."
CREDENTIALS_JSON="$TEMP_DIR/credentials.json"
cat > "$CREDENTIALS_JSON" <<EOF
{
  "ios": {
    "com.erebus.diveapp": {
      "distributionCertificate": {
        "path": "$DIST_CERT_P12",
        "password": "$DIST_CERT_PASSWORD_VAL"
      },
      "provisioningProfilePath": "$PROV_PROFILE"
    }
  }
}
EOF
echo "   Written to $CREDENTIALS_JSON"

echo ""
echo "5. Starting EAS build (iOS production)..."
echo "   Version: $(node -e "console.log(require('./app.config.js').expo.version)")"
echo "   Build number: $(node -e "console.log(require('./app.config.js').expo.ios.buildNumber)")"
echo ""

npx eas build \
  --platform ios \
  --profile production \
  --non-interactive \
  --clear-cache \
  --credentials-file "$CREDENTIALS_JSON"

BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  fail "EAS build failed with exit code $BUILD_EXIT"
fi

echo ""
echo "6. Submitting to TestFlight..."

export ASC_KEY_PATH="$ASC_KEY_FILE"

npx eas submit \
  --platform ios \
  --profile production \
  --non-interactive \
  --latest

SUBMIT_EXIT=$?
if [ $SUBMIT_EXIT -ne 0 ]; then
  fail "EAS submit failed with exit code $SUBMIT_EXIT"
fi

echo ""
echo "=== Build & submit complete! ==="
echo "Check App Store Connect / TestFlight for the new build."
