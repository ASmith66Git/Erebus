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
- **Navigation**: Features a root `Stack` navigator for authentication, a `Drawer` navigator for a custom side menu, and a `Tab` navigator for primary app screens (Home, Explore, Dive Logs, Photos, Profile).
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
- **Photos Gallery**: Beautiful photo management inspired by Apple Photos, Google Photos, and Instagram with:
  - 3-column masonry grid layout with smooth scrolling
  - Full-screen photo viewer with swipe navigation
  - Camera and photo library access via expo-image-picker
  - Upload photos from underwater cameras (file upload)
  - Link photos to specific dive logs
  - Favorite photos with heart indicator
  - Multi-select mode for batch delete
  - Filter tabs: All, Favorites, Unlinked
  - Photo detail editor with caption and dive linking
  - Photo carousel in dive log detail view
  - Database table: dive_photos with user/dive associations

### Feature Specifications
- **User Management**: Admin users can view, block/unblock, change roles, and reset passwords.
- **Dev Log**: Admin-only feature for tracking development tasks with color-coded status (To Do, In Progress, Completed), page type badges (Card, Detail, Edit), page name autocomplete, and CRUD operations via modal interface.
- **Gear Profiles**: Comprehensive diving equipment configuration management with:
  - 4 configuration types: Single Tank, Twinset, Sidemount, CCR (with distinct icons)
  - Exposure section: suit type/thickness/undersuit, gloves, boots, hood with nickname fields
  - Gas & Cylinders: multiple cylinders with gas mix selection (Air/Nitrox/Trimix/Heliox/O2), O2%/He% inputs, automatic MOD calculation (PPO2 1.4), standard sizes, cylinder roles
  - Dynamic Weighting: config-specific weight placements with stepper inputs (0.5kg increments)
  - Template system: reusable templates that can be applied to dive logs
  - Database tables: gear_profiles, gear_cylinders, gear_weights with foreign key relationships
  - Integration with dive_logs via gear_profile_id with authorization guard
- **Dive Site Details**: Comprehensive fields including site type, water type, difficulty, access notes, hazards, and best season.
- **Dive Site Images**: Supports image uploads to Replit Object Storage via presigned URLs, camera photo capture, primary image selection, and "Search Web" for Google Images.
- **Wreck Site Specifics**: Dedicated fields and a conditional "Wreck" tab.
- **Weather Forecast**: Integrates 7-day marine and atmospheric weather forecasts based on dive site location using Open-Meteo API.
- **Gas Calculator**: Comprehensive gas calculation tools with 6 tabs:
  - Cylinders: Browse and select from unified catalog (1L-18L Steel/Aluminum, plus AL80, HP120, twinsets, stages, ponies)
  - Density: Calculate breathing gas density at depth with high-density warnings (>6.2 g/L)
  - Fill Capacity: Calculate total/usable gas volume and bottom time at SAC rate
  - Top Up: Calculate resulting mix when topping up with different gas
  - Trimix: Full blending sequence calculator (He, O2, Air/Nitrox steps)
  - Best Mix: Calculate optimal O2/He percentages for target depth based on PPO2 and END limits
  - Shared services: services/cylinderCatalog.ts and services/gasMath.ts for reuse across dive planning and gear profiles
- **Dive Planning (MultiDeco-style)**: Full-featured decompression dive planning module with:
  - Buhlmann ZHL-16C algorithm with 16 tissue compartments for N2 and He (ZHL-16A/B also available)
  - Gradient Factor (GF Low/High) dropdowns for conservative deco planning
  - Interactive dive profile SVG chart with always-visible scrubber line, drag handle, and popup showing depth/time/gas/CNS/OTU/phase
  - Real-time 16-compartment tissue loading bar chart with color-coded saturation levels and percentage labels
  - Custom gas mix management with O2%, He%, MOD calculations (PPO2 1.4/1.6)
  - Per-cylinder gas tracking with cylinderId system for multiple cylinders with identical mixes
  - Comprehensive cylinder selection dropdown (AL80/63/100, Steel HP80/100/120, Steel 12L/15L, Twinsets, Stage tanks)
  - Gas switch depth configuration for deco gases with configurable switch time
  - Multi-dive day planning with surface interval tissue loading persistence
  - NDL (No Decompression Limit) calculation
  - Tabbed interface: Plan (dive parameters, charts), Gases (gas mix configuration), Settings (comprehensive configuration)
  - CNS (Central Nervous System) oxygen toxicity tracking with NOAA-compliant rates
  - OTU (Oxygen Toxicity Units) pulmonary toxicity tracking using REPEX formula
  - Circuit type support: Open Circuit and CCR (Closed Circuit Rebreather)
  - CCR setpoint configuration (BAR/ATA units) and scrubber time tracking with popup modal
  - Water type selection: Salt water (10m/bar) or Fresh water (10.3m/bar)
  - Units toggle: Metric (meters) or Imperial (feet)
  - Gas volume units: Cubic feet or Liters
  - O2 narcotic toggle for END (Equivalent Narcotic Depth) calculations
  - SAC rate configuration for bottom gas and deco phases
  - **Comprehensive Settings Tab** with:
    - Model Settings: Circuit (OC/CCR), Deco model selection, GF Lo/Hi dropdowns
    - Deco Stop Settings: Stop size (3m/6m), Last OC/CCR stop depths, min stop time, PPO2 thresholds by O2% range (45-99%, 28-45%, <28%), 100% O2 max depth, 30 sec stops, 6m steps toggles
    - Extended Stops: Extended stops toggle, shallow/deep extra times (7-30m, 30+m), add time to stop, all mix changes, O2 window effect
    - Descent/Ascent Rates: Separate descent, surface, deco, and ascent rate dropdowns
    - Dive Site Elevation: Elevation and acclimatized elevation for altitude diving
    - Display Settings: Gauge type (Simple/Digital), gas switch time
    - Dive Monitor Controls: ppO2 above/below thresholds, OTU/CNS thresholds, IBCD N2/He thresholds, CCR diluent check - all with enable toggles and sliders
  - Database tables: dive_plans, dive_plan_dives, dive_plan_gases
  - Algorithm validated against published Buhlmann standards (Baker's GF method)
- **Certifications Tracker**: Complete diving certification management with:
  - Pre-seeded database of 11 major training agencies (PADI, SSI, NAUI, BSAC, TDI, SDI, GUE, IANTD, RAID, CMAS, ANDI)
  - 100+ courses across recreational, technical, professional, cave, wreck, and rebreather categories
  - Two-tab interface: Completed certifications and Course Wishlist
  - Add/edit certifications with agency/course picker, date, certification number, instructor details, dive center, location
  - Card scanning: capture front/back of certification cards using device camera
  - Images stored in Replit Object Storage via presigned URLs
  - Course wishlist for future training goals with priority and target date
  - Promote wishlist items to completed certifications when course is finished
  - Database tables: training_agencies, training_courses, user_certifications, certification_images, user_course_wishlist
- **Dive Trips**: Comprehensive dive trip/holiday tracking with:
  - 6 trip types: Liveaboard, Dive Center, Dive Safari, Dive Resort, Day Trip, Other
  - Date range tracking (start/end dates)
  - Operator/vessel name for liveaboards
  - Dive center/resort name for shore-based trips
  - Location with country and Google Maps coordinates integration
  - Accommodation details
  - Trip notes for highlights and memories
  - Link dive logs to trips for organized dive history
  - Card-based list view with FAB for quick trip creation
  - Detail modal with edit and delete functionality
  - Soft-delete for data protection
  - Database tables: dive_trips, dive_trip_logs (for linking dives to trips)
- **App Settings**: User preference management with:
  - Unit system toggle: Metric (meters, °C) or Imperial (feet, °F)
  - Date format selection: Day/Month/Year, Month/Day/Year, or Year-Month-Day
  - Language selection from dropdown: English, Spanish, French, German, Italian, Portuguese, Dutch, Japanese, Chinese
  - Settings persisted via AsyncStorage
  - SettingsContext provides formatDepth, formatTemperature, and formatDate helper functions
  - Accessible from drawer menu
- **Dive Buddies**: Social dive buddy management with:
  - Add buddies with name, photo, and notes
  - Photo upload via camera or gallery with Replit Object Storage
  - Search for other Erebus users who have made their profile searchable
  - Connect buddies to Erebus users for social features
  - Link buddies to dive logs for team tracking
  - Card-based list view with FAB for quick buddy creation
  - Detail modal with edit and delete functionality
  - Searchable profile toggle in user preferences
  - Soft-delete for data protection
  - Database tables: dive_buddies, dive_log_buddies (junction table for linking to dives)

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