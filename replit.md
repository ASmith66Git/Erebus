# Erebus - Dive Management App

## Overview
Erebus is a cross-platform mobile application for Android and iOS, built with Expo React Native, designed as a comprehensive dive management tool. It enables divers to log dives, manage dive sites, and access relevant information. The project aims to be a leading mobile solution for the global diving community by offering a robust, user-friendly, and feature-rich experience. Key capabilities include user authentication, dark/light theme support, an intuitive ocean-blue UI, and an administrative panel for user oversight, comprehensive dive planning, certification tracking, and dive trip management.

## User Preferences
I prefer detailed explanations and clear communication. I want iterative development where I am consulted before major architectural or feature changes are implemented. I prioritize clean, readable code and robust error handling.

## System Architecture
The application is built using Expo React Native, targeting both iOS and Android platforms. The deployment architecture for production uses a single Express server serving both API routes and static files, while development uses separate processes. API URL detection is dynamically handled based on the environment.

### UI/UX Decisions
- **Color Scheme**: Uses white, black, and a primary red (`#D22F00`).
- **Theming**: Supports both dark (`#000000` background) and light (`#FFFFFF` background) themes.
- **Navigation**: Features a root `Stack` navigator for authentication, a `Drawer` navigator for a custom side menu, and a `Tab` navigator for primary app screens (Home, Explore, Dive Logs, Photos, Profile).
- **Design Patterns**: Employs sticky headers, hamburger menus, and card-based layouts.

### Technical Implementations
- **User Authentication**: JWT-based session management with secure offline caching and background token refresh. Users can edit their profile (first name, last name, age, sex) from the profile screen. Profile photo upload with image picker and object storage integration.
- **Admin Panel**: Provides user management, support message management, a development log, and dive message management for administrators.
- **Support Messaging**: User-to-admin messaging system for in-app support. Users can create support tickets from their profile, and admins can manage and respond to conversations. Features status tracking (open, in progress, resolved, closed), priority levels, and unread message badges.
- **Dynamic Dive Messages**: Admin-managed tips and taglines displayed dynamically on the home screen. Includes a database table for storing messages with type (tip/tagline), active/inactive status, and CRUD admin interface.
- **Offline Capabilities**: Utilizes `expo-sqlite` for local data storage and implements an offline-first synchronization flow with incremental updates and pending mutation queues. Network connectivity detection enables automatic data syncing on reconnection.
- **In-App Debugging**: Incorporates an error logging service with persistent storage, capturing various error types, accessible via an admin-only debug log screen.
- **Dive Site Management**: Offers card-based listing with search/filter, tabbed detail views, inline editing, Wikipedia integration for wreck sites, and soft-delete functionality.
- **Dive Log Management**: Allows logging dives, importing from various formats (UDDF, Subsurface XML, CSV), and tracking personal statistics. Detail view includes interactive SVG charts and gas pressure gauges. Imports record which user dive computer was used via `user_dive_computer_id`.
- **Multiple Dive Computers**: Users can manage a list of dive computers (stored in `user_dive_computers` table) from their profile page with add/remove functionality and capability badges. On import, if multiple computers are saved, users pick which computer the import is for; if only one exists, it auto-selects. Legacy single-computer data from `users.dive_computer_brand/model` is auto-migrated to the new table.
- **Bluetooth Dive Computer Sync**: Direct BLE connectivity for automated dive log downloads (requires EAS Build). Uses UDS (Unified Diagnostic Services) protocol for modern Shearwater firmware (v93+). Implements "Fast-Path" connection like the official Shearwater Cloud app - checks bonded devices first via `connectedDevices()` to bypass scanning. Aggressive GATT handling for Android 12+ with force-disconnect, MTU negotiation, and progressive retry delays. iOS fix: UDS session initialization (0x35 handshake) before RDBI commands with confirmed writes (withResponse=true), 2s GATT warm-up delay, and 5s timeout for initial commands.
- **Push Notifications** (Android/iOS): Uses Expo Notifications with FCM/APNs for various channels, supports local scheduled notifications, and server-side push via expo-server-sdk for support message replies (requires EAS Build).
- **Biometric Authentication** (Android/iOS): Integrates `expo-local-authentication` for fingerprint and Face ID support.
- **Photos & Videos Gallery**: Features a 3-column masonry grid supporting both photos and videos, full-screen viewer with video playback (expo-av), camera/library access for photos and videos (up to 5 min), underwater camera uploads, dive log linking, favorites, multi-select, and detail editing. Videos show play icons and duration on thumbnails. On native (Android/iOS via EAS Build), videos are automatically compressed before upload using react-native-compressor, with progress UI and automatic thumbnail generation.
- **Gear Profiles**: Manages diving equipment configurations with support for different tank setups, gas mixes, weighting, and a template system. Includes a 5-tab interface (Config, Exposure, Gas, Weight, Gear) with view/edit modes.
- **Equipment Inventory**: Tracks user's dive equipment by type (regulator, BCD, wetsuit, drysuit, mask, fins, gloves, boots, hood, cylinder, torch, computer, SMB, reel, knife, camera, weights, harness, other) with friendly names and quantities. Equipment can be linked to specific gear profiles.
- **Weather Forecast**: Integrates 7-day marine and atmospheric weather forecasts based on dive site location.
- **Gas Calculator**: Provides comprehensive gas calculation tools including cylinder browsing, density calculation, fill capacity, gas blending (Mix tab with target mix, residual toggle, blending sequence, and real gas mode), and best mix calculation. Real gas mode uses NIST REFPROP v10 Z-factor data with 2D inverse distance weighting interpolation for accurate high-pressure calculations. Validated with 20 automated tests covering reference values at 207, 232, and 300 bar for air, nitrox, trimix, and pure gases.
- **Dive Planning (MultiDeco-style)**: Full-featured decompression dive planning module using Buhlmann ZHL-16C algorithm with gradient factors. Includes interactive dive profile SVG chart, real-time tissue saturation, PDF export, CNS/OTU tracking, and comprehensive settings for OC/CCR diving.
- **Certifications Tracker**: Manages diving certifications with a pre-seeded database of agencies and courses. Features card scanning with auto-detection and image management, plus a course wishlist.
- **Cylinder Certification Tracking**: Manages diving cylinders with multi-country testing standards (UK/EU: visual every 2.5yr + hydro every 5yr; US: hydro every 5yr only; custom intervals). Tracks visual inspection, hydrostatic test, and oxygen cleaning dates with green/amber/red status indicators. Test history log with facility names and pass/fail results. Enriched gas toggle for oxygen cleaning schedule. Push notification reminders when tests are due. Daily server-side scheduler checks approaching due dates.
- **Dive Trips**: Tracks dive holidays with various trip types, date ranges, operator/location details, and linking to dive logs.
- **Compressor Management**: Tracks diving compressors with make/model/serial details, cumulative runtime hours, configurable service intervals (oil change, filter change), independent testing records with pass/fail and certificates, usage logging with fills count, and visual status indicators (green/amber/red) for service due/overdue tracking.
- **App Settings**: Manages user preferences for unit systems, date formats, and language selection.
- **Internationalization (i18n)**: Full multi-language support using i18next + react-i18next + expo-localization. Supports English, French, German, Spanish, Italian, and Swedish. Auto-detects device language on first launch; user can override in Settings. Translation files stored in `locales/` directory as JSON. All screens use `useTranslation` hook with `t()` calls. Language changes sync between SettingsContext and i18next via `i18n.changeLanguage()`.
- **Dive Buddies**: Manages social dive buddies with names, photos, notes, and the ability to link to dive logs.
- **Data Export**: Two export options from profile - data-only (XLSX spreadsheet) or full export with media (ZIP archive containing JSON data plus all photos and videos from object storage).
- **RevenueCat Subscriptions**: In-app subscription management using RevenueCat with monthly ($7.99/mo) and annual ($59.99/yr) plans. Uses `react-native-purchases` on client, `@replit/revenuecat-sdk` for server-side seed script. Paywall screen shown when trial expired and not subscribed. Subscription management and restore purchases available from profile > subscription page. RevenueCat project: "Leviathan Systems Ltd", entitlement: "premium". API keys stored as EXPO_PUBLIC_REVENUECAT_* env vars. `@tanstack/react-query` used for subscription state management via `SubscriptionProvider` context and `useSubscription` hook in `lib/revenuecat.tsx`.
- **14-Day Free Trial**: Server-side trial system with `trial_ends_at` column on users table, set to `created_at + 14 days` on signup. Existing users backfilled on migration. Access gate in `app/_layout.tsx` grants access if: admin role OR trial active OR RevenueCat subscribed. Trial countdown banner on home screen links to subscription page. Paywall shows trial-expired messaging when trial ends. Trial days remaining shown on subscription screen. `AuthContext` exposes `isTrialActive` and `trialDaysRemaining`. All trial strings translated in 6 languages (EN, FR, DE, ES, IT, SV).

## Development Notes
### Android Touch Handling
- **Chart Scrubbers**: Must use `react-native-gesture-handler` (GestureDetector + Gesture.Pan()) for chart scrubbers on Android - the basic responder system (onResponderTerminationRequest) doesn't work reliably because ScrollView steals touch events.
- **Pattern**: Use `Platform.OS === 'web'` ternary to separate web (mouse events) from native (GestureDetector) touch handling.
- **GestureHandlerRootView**: Already configured at app root in `app/(app)/_layout.tsx`.
- **Layout Tips**: Date picker side-by-side layouts should use `flex: 1` with `minWidth` instead of percentage widths for reliable display across screen sizes.

### Build Verification
- Native `android/app/build.gradle` versionCode and versionName must be updated manually as they override app.config.js.
- Current version: 2.0.83 (versionCode 102).

## External Dependencies
- **PostgreSQL**: Primary database.
- **Express.js**: Backend API server.
- **Expo React Native**: Mobile application framework.
- **Replit Object Storage**: For image and video storage.
- **Wikipedia API**: For wreck site information.
- **Open-Meteo API**: For weather forecasts.
- **expo-sqlite**: For local SQLite database.
- **@react-native-community/netinfo**: For network connectivity detection.
- **expo-image-picker**: For camera and photo library access.
- **expo-location**: For user location access.
- **react-native-maps**: For interactive maps on native platforms.
- **Google Maps JavaScript API**: For maps and Places Autocomplete on the web.
- **bcrypt**: For password hashing.
- **react-native-svg**: For rendering SVG graphics.
- **expo-server-sdk**: For server-side push notifications.
- **expo-av**: For video playback in the gallery viewer.
- **react-native-purchases**: RevenueCat client SDK for in-app subscriptions.
- **@replit/revenuecat-sdk**: RevenueCat REST API SDK for server-side product management.
- **@tanstack/react-query**: Data fetching and caching for subscription state.