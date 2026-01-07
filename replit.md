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
  (tabs)/                  # Main app screens
    _layout.tsx            # Tab layout with header/drawer
    index.tsx              # Home screen
    explore.tsx            # Explore dive sites
    profile.tsx            # User profile
    admin.tsx              # Admin panel (admin only)
  splash.tsx               # Splash/welcome screen
  _layout.tsx              # Root layout with providers
server/
  index.js                 # Express API server
contexts/
  AuthContext.tsx          # Authentication context/state
  ThemeContext.tsx         # Theme context (dark/light)
constants/
  Colors.ts                # Theme colors (ocean blue)
components/                # Reusable React components
assets/                    # Static assets
```

## API Endpoints
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - Authenticate user
- `GET /api/auth/me` - Get current user (requires auth)
- `GET /api/admin/users` - List all users (admin only)
- `PUT /api/admin/users/:id/role` - Change user role (admin only)
- `DELETE /api/admin/users/:id` - Delete user (admin only)

## Database
Uses PostgreSQL with a `users` table:
- id (SERIAL PRIMARY KEY)
- email (VARCHAR UNIQUE)
- password (hashed with bcrypt)
- first_name, last_name (VARCHAR)
- role ('user' or 'admin')
- created_at, updated_at (TIMESTAMP)

## Design
- Primary color: #0077B6 (ocean blue)
- Dark theme: Deep navy background (#0D1B2A)
- Light theme: Clean white (#F8F9FA)

## Recent Changes
- January 2026: Initial implementation of Erebus dive management app
  - User authentication with JWT
  - Theme switching (dark/light mode)
  - Splash screen, login, signup screens
  - Main navigation with tabs and drawer menu
  - Admin panel for user management
  - PostgreSQL database integration
