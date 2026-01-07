# Expo React Native Project

## Overview
This is an Expo project for building React Native applications. It uses Expo Router for file-based navigation and React Native Web for web platform support.

## Running the App
- **Web**: The app runs on port 5000 via `npx expo start --web --port 5000`
- **Mobile**: Use Expo Go app to scan the QR code for iOS/Android testing

## Project Structure
```
app/                    # Expo Router screens
  (tabs)/              # Tab-based navigation
    _layout.tsx        # Tab layout configuration
    index.tsx          # Home screen
    explore.tsx        # Explore screen
  _layout.tsx          # Root layout
  +not-found.tsx       # 404 page
components/            # Reusable React components
  ui/                  # UI-specific components
constants/             # App constants (Colors, etc.)
hooks/                 # Custom React hooks
assets/                # Static assets (fonts, images)
scripts/               # Utility scripts
```

## Key Dependencies
- **expo**: ~54.x - Expo SDK
- **expo-router**: ~6.x - File-based routing
- **react-native-web**: ^0.21 - Web platform support
- **react-navigation**: Bottom tabs navigation

## Development Notes
- Edit `app/(tabs)/index.tsx` to modify the home screen
- Tab navigation is configured in `app/(tabs)/_layout.tsx`
- Use `npm run reset-project` to get a fresh app directory
