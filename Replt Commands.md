For a fresh rebuild before publishing npx expo export --platform web --output-dir dist --clear
Clear cache and build fresh APK (for testing)
npx eas-cli build --platform android --profile preview --clear-cache
Or for production (Play Store AAB)
npx eas-cli build --platform android --profile production --clear-cache
Clear cache and build for testing/TestFlight
npx eas-cli build --platform ios --profile preview --clear-cache
Or for production (App Store)
npx eas-cli build --platform ios --profile production --clear-cache
To submit to the appstore
npx eas submit --platform ios