---
name: Server vs app dependency boundary
description: Rules for keeping server/package.json and root package.json separate to avoid breaking EAS iOS builds.
---

## The rule

**Never add server-only packages to the root `package.json`.**
**Never commit `server/package-lock.json` to git.**
**Never add a `postinstall` script to root `package.json` that installs server deps.**

## Why

The root `package.json` is consumed by EAS (Expo Application Services) during iOS/Android builds via `yarn install --frozen-lockfile`. EAS runs on Apple silicon build machines where native Node addons (e.g. `sharp`, `node-gyp` packages) cannot compile. Adding server-only packages to root `package.json` breaks EAS.

A `postinstall` script in root `package.json` runs during EAS's `yarn install`, not just on Render — so `cd server && npm install` during EAS will attempt to build native modules and fail.

A committed `server/package-lock.json` can confuse npm resolution in the parent directory on Render.

## How to apply

- Server dependencies live **only** in `server/package.json`.
- `server/node_modules/` is gitignored.
- Render installs server deps via `render.yaml` buildCommand: `npm install && cd server && npm install`.
- `server/package-lock.json` must **not** be committed — add it to `.gitignore` if needed.
- When adding a new server dep: `cd server && npm install <pkg> --save` only. Never touch root `package.json`.
