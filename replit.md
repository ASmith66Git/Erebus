# Erebus - Dive Management App

## Overview
Erebus is a cross-platform mobile application for Android and iOS, built with Expo React Native, designed as a comprehensive dive management tool. It enables divers to log dives, manage dive sites, and access relevant information. The project aims to be a leading mobile solution for the global diving community by offering a robust, user-friendly, and feature-rich experience. Key features include user authentication, dark/light theme support, an intuitive ocean-blue UI, and an administrative panel for user oversight.

## User Preferences
I prefer detailed explanations and clear communication. I want iterative development where I am consulted before major architectural or feature changes are implemented. I prioritize clean, readable code and robust error handling.

## System Architecture
The application is built using Expo React Native, targeting both iOS and Android platforms.

### UI/UX Decisions
- **Color Scheme**: Uses white, black, and a primary red (`#D22F00`).
- **Theming**: Supports both dark (`#000000` background) and light (`#FFFFFF` background) themes.
- **Navigation**: Features a root `Stack` navigator for authentication, a `Drawer` navigator for a custom side menu, and a `Tab` navigator for primary app screens (Home, Explore, Profile).
- **Design Patterns**: Employs sticky headers, hamburger menus, and card-based layouts.

### Technical Implementations
- **User Authentication**: JWT-based session management with secure offline caching (14-day validity) and background token refresh.
- **Admin Panel**: Provides user management functionalities for administrators.
- **Dive Sites Management**: Offers card-based listing with search/filter, a tabbed detail view, inline editing, Wikipedia integration for wreck sites, and soft-delete functionality.
- **Offline Capabilities**: Uses `expo-sqlite` for local data storage and implements an offline-first synchronization flow with incremental updates and pending mutation queues. Network connectivity is detected via `@react-native-community/netinfo`, and data syncs automatically on reconnection.
- **In-App Debugging**: Incorporates an error logging service with persistent storage using `AsyncStorage`, capturing `console.error`, `console.warn`, uncaught errors, and unhandled promise rejections, accessible via an admin-only debug log screen.
- **Dive Log Management**: Allows logging dives, importing from UDDF, Subsurface XML, and CSV, and tracking personal statistics.
- **Dive Log Detail View**: A 5-tab interface (Dive, Profile, Computer, Notes, Team) provides comprehensive dive data, including interactive SVG charts for depth/temperature profiles and gas pressure gauges.
- **Bluetooth Dive Computer Sync**: Direct BLE connectivity to dive computers (e.g., Shearwater, Suunto, Mares) for automated dive log downloads. Requires EAS Build for native app. Includes a dive computer catalog.
- **Push Notifications** (Android): Uses Expo Notifications with FCM for various channels (Default, Dive Reminders, Sync Updates) and supports local scheduled notifications. Requires EAS Build.
- **Biometric Authentication** (Android/iOS): Integrates `expo-local-authentication` for fingerprint and Face ID support, offering biometric login after initial password authentication.

### Feature Specifications
- **User Management**: Admin users can view, block/unblock, change roles, and reset passwords.
- **Dev Log**: Admin-only feature for tracking development tasks with color-coded status (To Do, In Progress, Completed), page type badges (Card, Detail, Edit), page name autocomplete, and CRUD operations via modal interface.
- **Dive Site Details**: Comprehensive fields including site type, water type, difficulty, access notes, hazards, and best season.
- **Dive Site Images**: Supports image uploads to Replit Object Storage via presigned URLs, camera photo capture, primary image selection, and "Search Web" for Google Images.
- **Wreck Site Specifics**: Dedicated fields and a conditional "Wreck" tab.
- **Weather Forecast**: Integrates 7-day marine and atmospheric weather forecasts based on dive site location using Open-Meteo API.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Express.js**: Backend API server.
- **Expo React Native**: Mobile application framework.
- **@react-navigation/drawer**: For drawer navigation.
- **Replit Object Storage**: For dive site image storage.
- **expo-image-picker**: For camera photo capture.
- **Wikipedia API**: For wreck site information.
- **Open-Meteo API**: For weather forecasts.
- **expo-sqlite**: For local SQLite database.
- **@react-native-community/netinfo**: For network connectivity detection.
- **expo-location**: For user location access.
- **react-native-maps**: For interactive maps on native platforms.
- **Google Maps JavaScript API**: For maps and Places Autocomplete on the web.
- **bcrypt**: For password hashing.
- **react-native-svg**: For rendering SVG graphics.