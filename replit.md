# Erebus - Dive Management App

## Overview
Erebus is a cross-platform mobile application built with Expo React Native for Android and iOS, designed to serve as a comprehensive dive management tool. It aims to provide divers with features for logging dives, managing dive sites, and accessing relevant information. The project envisions becoming a leading mobile solution for the global diving community, offering a robust, user-friendly, and feature-rich experience. Key capabilities include user authentication, dark/light theme support, an intuitive ocean-blue UI, and an administrative panel for user oversight.

## User Preferences
I prefer detailed explanations and clear communication. I want iterative development where I am consulted before major architectural or feature changes are implemented. I prioritize clean, readable code and robust error handling.

## System Architecture
The application is built using Expo React Native, targeting both iOS and Android platforms.

### UI/UX Decisions
- **Color Scheme**: Inspired by nammu-tech.com, utilizing white, black, and a primary red (`#D22F00`).
- **Theming**: Supports both dark (`#000000` background) and light (`#FFFFFF` background) themes.
- **Navigation**:
    - A root `Stack` navigator manages the authentication flow.
    - A `Drawer` navigator (using `expo-router/drawer` with `@react-navigation/drawer`) provides a custom side menu with native gestures and animations.
    - A `Tab` navigator is nested within the drawer for primary app screens (Home, Explore, Profile).
- **Design Patterns**: Employs sticky headers, hamburger menus, and card-based layouts for content display.

### Technical Implementations
- **User Authentication**: JWT-based session management handles user signup, login, and logout.
- **Admin Panel**: Provides user management functionalities, accessible only to administrators.
- **Dive Sites Management**:
    - Displays dive sites in a card-based list with search and filter capabilities.
    - Features a tabbed detail view for each dive site (Overview, Conditions, Media, Notes).
    - Supports inline editing with save/cancel functionality.
    - Integrates Wikipedia for wreck site information.
    - Implements a soft-delete (archive) pattern for dive sites.
- **Offline Capabilities**:
    - Utilizes `expo-sqlite` for local data storage, mirroring server tables.
    - Implements an offline-first synchronization flow with incremental updates and pending mutation queues.
    - Detects network connectivity using `@react-native-community/netinfo`.
    - Automatically syncs data on reconnection and app resume.
- **In-App Debugging**:
    - Incorporates an error logging service with persistent storage using `AsyncStorage`.
    - Automatically captures `console.error`, `console.warn`, uncaught errors, and unhandled promise rejections.
    - Provides an in-app debug log screen (admin-only) with filtering and sharing options.

### Feature Specifications
- **User Management**: Admin users can view, block/unblock, change roles, and reset passwords for other users.
- **Dive Site Details**: Includes comprehensive fields such as site type, water type, difficulty, access notes, hazards, and best season.
- **Dive Site Images**: Supports image uploads to Replit Object Storage via presigned URLs, primary image selection, and Pexels stock photo integration.
- **Wreck Site Specifics**: Dedicated fields and a conditional "Wreck" tab for detailed wreck information and external resource links.
- **Weather Forecast**: Integrates 7-day weather forecasts, including marine and atmospheric data, based on dive site location.
- **Dive Log Management**: Allows users to log dives, import from various formats (UDDF, Subsurface XML, CSV), and track personal dive statistics.
- **Dive Log Detail View**: Comprehensive 5-tab interface matching Shearwater Perdix PWA functionality:
  - **Dive Tab**: Dive site, surface conditions, weather, depth, duration, temperature, gas pressures with SVG circular gauges, dive problems (thermal comfort, workload, equipment malfunctions, decompression symptoms).
  - **Profile Tab**: Interactive SVG multi-line chart displaying depth, temperature, NDL, and GF99 with toggleable data series.
  - **Computer Tab**: Dive computer metadata (model, serial, manufacturer), dive number, surface interval, surface pressure, dive mode, start/end times, and gas mixes.
  - **Notes Tab**: Dive notes and skills practiced checkboxes (bailout, gas switch, SMB launch, etc.).
  - **Team Tab**: Buddy/team member information.
- **Bluetooth Dive Computer Sync**: Direct BLE connectivity to dive computers (Shearwater, Suunto, Mares) for automated dive log downloads.
  - Requires EAS Build for native app (not available in Expo Go or web).
  - Dive computer catalog with 140+ models and BLE capability flags.
  - User can select their dive computer in Profile settings.
  - App shows appropriate import method (BLE for supported models, file upload for others).

## External Dependencies
- **PostgreSQL**: Primary database for storing user data, dive sites, images, and dive logs.
- **Express.js**: Backend API server for handling requests.
- **Expo React Native**: Framework for building the mobile application.
- **@react-navigation/drawer**: Used for native drawer navigation gestures and animations.
- **Replit Object Storage**: For storing and managing uploaded dive site images.
- **Pexels API**: For searching and integrating stock photos (requires `PEXELS_API_KEY`).
- **Wikipedia API**: For fetching information about wreck dive sites.
- **Open-Meteo API**: For retrieving 7-day weather forecasts (marine and atmospheric).
- **expo-sqlite**: For local SQLite database storage and offline data management.
- **@react-native-community/netinfo**: For detecting network connectivity status.
- **expo-location**: For accessing user's location (e.g., "Use My Location" feature).
- **react-native-maps**: For displaying interactive maps and selecting coordinates on native platforms.
- **Google Maps JavaScript API**: For displaying interactive maps and Places Autocomplete search on the web.
- **bcrypt**: For hashing user passwords.
- **react-native-svg**: For rendering SVG graphics (dive profile charts, gas pressure gauges).

## Database Schema (Enhanced Dive Log Tables)

### Core Dive Log Tables
- **dive_logs**: Main dive log entries with header data, device info, and legacy JSON fields for backwards compatibility.
- **dive_computer_catalog**: 90+ dive computer models with manufacturer, family, protocol, BLE/AI capability flags, and supported sample fields.

### Detailed Dive Data Tables (V2 Import Schema)
- **dive_log_samples**: Time-series sample data with JSONB `metrics` column for flexible storage of depth, temperature, NDL, GF99, ceiling, TTS, PPO2, SAC, heartrate, CNS, OTU, tank pressure, and setpoint.
- **dive_log_gases**: Gas mix definitions with O2/He/N2 percentages, diluent/bailout flags, tank info, and transmitter serial.
- **dive_log_events**: Dive events including alarms, bookmarks, gas switches, violations, and user markers with timestamp and payload.
- **dive_log_tank_pressures**: AI transmitter time-series data for multi-tank pressure tracking.
- **dive_log_settings**: Dive computer settings captured at dive time (deco model, GF low/high, conservatism, PPO2 limits, firmware version, battery status).
- **dive_log_imports**: Import metadata including source type/format, parser version, raw data hash for reproducibility, and unmapped fields.

### Database Indexes
- GIN index on `dive_log_samples.metrics` for efficient JSONB queries.
- Composite index on `(dive_log_id, sample_time_seconds)` for fast time-series retrieval.

## API Endpoints (Dive Log Import V2)
- `POST /api/dive-logs/import/v2`: Enhanced import endpoint using strategy-based parser with full sample/event/gas extraction.
- `GET /api/dive-logs/:id/detailed`: Returns complete dive data including samples, gases, events, tank pressures, settings, and import metadata.
- `GET /api/dive-computers/catalog`: Lists dive computer models with optional manufacturer and BLE filters.
- `GET /api/dive-computers/catalog/manufacturers`: Returns distinct manufacturers with model counts.
- `POST /api/dive-logs/:id/migrate`: Migrates legacy dive logs to new detailed table structure.

## Import Parser Architecture (V2)
- **FormatDetector**: Automatically detects UDDF, Subsurface XML, CSV, or binary formats.
- **BaseAdapter**: Abstract base class defining canonical DiveImportDTO output structure.
- **UDDFAdapter**: Parses UDDF 3.x format with sample and gas extraction.
- **SubsurfaceAdapter**: Parses Subsurface XML with full sample metrics (NDL, GF99, ceiling, tank pressures, events).
- **CSVAdapter**: Flexible CSV import with column mapping for various dive computer exports.
- **DiveImportDTO**: Canonical structure with header, samples, gases, events, tank_pressures, settings, and import_metadata sections.

## Recent Changes
- 2026-01-10: Implemented V2 import parser with strategy pattern and 6 new database tables for detailed dive data storage.
- 2026-01-10: Added dive computer catalog with 90 models and capability flags.
- 2026-01-10: Enhanced legacy JSON fields to include full sample metrics for backwards compatibility.