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