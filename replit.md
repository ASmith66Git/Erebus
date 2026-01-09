# Erebus - Dive Management App

## Overview
Erebus is a dive management mobile app built with Expo React Native for Android and iOS. It features user authentication, dark/light theme support, a clean ocean-blue design, and an admin panel for user management.

## Features
- User authentication (signup, login, logout)
- JWT-based session management
- Dark/light theme switching
- Sticky header with hamburger menu drawer
- Bottom tab navigation
- Admin panel for user management (admin-only access)
- PostgreSQL database for user storage
- **Dive Sites Management**:
  - Card-based list with search bar and filter chips
  - Tabbed detail view (Overview, Conditions, Media, Notes)
  - Inline edit mode with cancel/save functionality
  - Wikipedia integration for wreck sites
  - Soft delete (archive) pattern

## Running the App
- **API Server**: Runs on port 3001 via `node server/index.js`
- **Web**: Runs on port 5000 via `npx expo start --web --port 5000`
- **Mobile**: Use Expo Go app to scan the QR code

## Project Structure
```
app/                       # Expo Router screens
  (auth)/                  # Auth screens (login, signup)
    _layout.tsx
    login.tsx
    signup.tsx
  (app)/                   # Main authenticated app (wrapped in Drawer)
    _layout.tsx            # Drawer layout with custom content
    (tabs)/                # Tab navigator (nested in drawer)
      _layout.tsx          # Tab layout with header
      index.tsx            # Home screen
      explore.tsx          # Explore dive sites
      profile.tsx          # User profile
      dive-sites.tsx       # Dive sites list with search
      admin.tsx            # Admin panel (admin only)
  dive-site/
    [id].tsx               # Dive site detail/edit screen
  splash.tsx               # Splash/welcome screen
  _layout.tsx              # Root layout with Stack navigator
server/
  index.js                 # Express API server
contexts/
  AuthContext.tsx          # Authentication context/state
  ThemeContext.tsx         # Theme context (dark/light)
constants/
  Colors.ts                # Theme colors
components/                # Reusable React components
assets/                    # Static assets
```

## Navigation Architecture
- **Root Stack**: Handles auth flow (splash → auth → app)
- **Drawer** (in `(app)/_layout.tsx`): Slides from left, contains custom menu
- **Tabs** (in `(app)/(tabs)/_layout.tsx`): Bottom tab bar with Home, Explore, Profile
- Uses `expo-router/drawer` with `@react-navigation/drawer` for native gestures/animations
- `GestureHandlerRootView` wraps the drawer for proper gesture handling

## API Endpoints
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - Authenticate user (checks if user is blocked)
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `GET /api/auth/me` - Get current user (requires auth)
- `GET /api/admin/users` - List all users with blocked status (admin only)
- `PUT /api/admin/users/:id/role` - Change user role (admin only)
- `PUT /api/admin/users/:id/block` - Block/unblock user (admin only)
- `POST /api/admin/users/:id/reset-password` - Reset user password (admin only)
- `DELETE /api/admin/users/:id` - Delete user (admin only)

### Dive Sites
- `GET /api/dive-sites` - List dive sites (with search, filter by type/difficulty/water_type)
- `GET /api/dive-sites/:id` - Get dive site details
- `POST /api/dive-sites` - Create new dive site
- `PUT /api/dive-sites/:id` - Update dive site
- `DELETE /api/dive-sites/:id` - Archive dive site (soft delete)
- `GET /api/dive-sites/:id/wikipedia` - Fetch Wikipedia info for wreck sites
- `GET /api/dive-sites/:id/weather` - Get 7-day weather forecast
- `GET /api/site-types` - List available site types
- `GET /api/difficulties` - List difficulty levels

### Dive Site Images (owner/admin only)
- `GET /api/dive-sites/:id/images` - List images for a dive site
- `POST /api/dive-sites/:id/images` - Upload image (via presigned URL)
- `PUT /api/dive-sites/:id/images/:imageId` - Update image (caption, set primary)
- `DELETE /api/dive-sites/:id/images/:imageId` - Delete image
- `POST /api/upload-url` - Generate presigned upload URL for Object Storage

### Stock Photos
- `GET /api/stock-photos/search` - Search Pexels for stock photos (requires PEXELS_API_KEY)

## Database
Uses PostgreSQL with a `users` table:
- id (SERIAL PRIMARY KEY)
- email (VARCHAR UNIQUE)
- password (hashed with bcrypt)
- first_name, last_name (VARCHAR)
- role ('user' or 'admin')
- is_blocked (BOOLEAN) - Whether user is blocked from logging in
- password_reset_token (VARCHAR) - Token for password reset
- password_reset_expires (TIMESTAMP) - Token expiration time
- created_at, updated_at (TIMESTAMP)

### Dive Sites Table (dive_sites)
- id, user_id (FK to users)
- name, description, site_type (reef/wreck/cave/wall/drift/shore/quarry/lake/river/cenote/artificial)
- latitude, longitude, country, region
- water_type (marine/inland), depth_min, depth_max
- visibility_min, visibility_max, difficulty (beginner/intermediate/advanced/technical)
- current_strength, access_notes, facilities (JSONB), hazards (JSONB)
- best_season, rating_avg, ratings_count
- wikipedia_url, external_info, image_url
- is_archived (BOOLEAN for soft delete)
- created_at, updated_at

### Dive Site Images Table (dive_site_images)
- id, dive_site_id (FK), image_url, caption, is_primary
- is_stock (BOOLEAN) - Whether image is from stock photo service
- attribution (TEXT) - Attribution text for stock photos
- created_at

## Design
- Primary color: #D22F00 (Nammu-Tech red)
- Dark theme: Pure black background (#000000)
- Light theme: Pure white background (#FFFFFF)
- Color scheme inspired by nammu-tech.com (white, black, red)

## Recent Changes
- January 2026: Initial implementation of Erebus dive management app
  - User authentication with JWT
  - Theme switching (dark/light mode)
  - Splash screen, login, signup screens
  - Main navigation with tabs and drawer menu
  - Admin panel for user management
  - PostgreSQL database integration
  - Forgot password functionality on login screen
  - Admin: Reset user password feature
  - Admin: Block/unblock user feature
  - Blocked users cannot log in
  - Admin panel shows blocked user count
- January 2026: Dive Sites feature
  - Database schema for dive_sites and dive_site_images
  - Full CRUD API with search and filtering
  - Card-based list screen with search bar and type filter chips
  - Tabbed detail screen (Overview, Conditions, Media, Notes)
  - Inline edit mode with cancel/save buttons
  - Wikipedia REST API integration for wreck site information
  - Navigation integration via hamburger drawer menu
- January 2026: Navigation refactor to best practices
  - Migrated from custom overlay drawer to expo-router/drawer
  - Nested navigation: Stack → Drawer → Tabs
  - Native swipe gestures on mobile
  - Smooth slide animations
  - Proper accessibility with @react-navigation/drawer
  - GestureHandlerRootView for gesture support
- January 2026: Weather Forecast Integration
  - Open-Meteo API integration for weather data (no API key required)
  - Backend proxy endpoint /api/dive-sites/:id/weather with date parameter
  - 7-day forecast with date picker (Today through next 6 days)
  - Marine weather (ocean sites only): wave height, wave period, current velocity/direction
  - Atmospheric weather: temperature (current or min/max for future dates), conditions, wind
  - Removed "Dive Conditions" section (depth, visibility, etc.) - now part of dive logs
  - Freshwater sites only show atmospheric weather (no marine data)
- January 2026: Dive Site Edit Enhancements
  - Removed filter chip row from dive sites list for cleaner UI
  - Added picker dropdowns for Site Type and Water Type
  - Added Difficulty picker dropdown
  - Added tappable 5-star rating component
  - Embedded Google Maps for coordinate selection:
    - On web: Google Maps JavaScript API with Places Autocomplete search
    - On native: react-native-maps with draggable marker
    - Search for locations by name and drop a pin
    - Click/tap anywhere on map to set coordinates
    - "Use My Location" button via expo-location
    - Live coordinate display as you interact with the map
- January 2026: Dive Site Image Management
  - Replit Object Storage integration for file uploads
  - Full image CRUD API with owner/admin authorization
  - Presigned URL upload flow for secure uploads
  - Primary image selection with transactional updates
  - Pexels stock photo search integration
  - Media tab UI with image gallery
  - Stock photo attribution tracking
  - Dive site cards show primary image as thumbnail
