---
name: Render PWA build setup
description: How the Expo web PWA is built and served on Render, and what broke the first time.
---

## Setup

- Build command in `render.yaml`: `npm install && npx expo export --platform web --output-dir dist --clear && cd server && npm install`
- `dist/` is in `.gitignore` — Render builds it fresh on every deploy; never commit it
- Server root route (`app.get('/')`) serves `dist/index.html` when it exists, falls back to JSON health check
- Static middleware at bottom of `server/index.js` handles all non-API routes → `dist/index.html`

## What broke

`babel-preset-expo` was a transitive dependency (not in `package.json` directly). Render builds with `NODE_ENV=production`, which causes npm to skip devDependencies of transitive packages — so it wasn't installed.

**Fix:** Added `babel-preset-expo` explicitly to `dependencies` in root `package.json`.

**Why:** Any Expo build tool needed at export time must be in `dependencies`, not just an implicit transitive dep, because Render's production npm install won't guarantee it.

## render.yaml does NOT auto-apply to existing services

Changes to `render.yaml` are only picked up when a service is first created (via Blueprints). For an existing service, the build command must be updated manually in the Render dashboard → Settings → Build Command.
