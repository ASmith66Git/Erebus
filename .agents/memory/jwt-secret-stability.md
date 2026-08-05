---
name: JWT secret stability
description: JWT_SECRET must be a stable env var on Render or all tokens are invalidated on every server restart.
---

## The rule

`JWT_SECRET` in `server/index.js` must resolve to a stable environment variable. The fallback is now:
`process.env.JWT_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(...)`.

`SESSION_SECRET` is already configured on Render as a persistent env var, so it acts as the stable secret.

## Why

The original code fell back to `crypto.randomBytes(64).toString('hex')` when `JWT_SECRET` was not set. Every Render restart (crash, redeploy, scale event) generated a new secret, immediately invalidating every user's JWT token — logging the entire user base out.

## How to apply

- Never leave the JWT secret fallback as a random value in production.
- If adding a new server environment, ensure either `JWT_SECRET` or `SESSION_SECRET` is set as a persistent env var before the first deploy.
- If users report sudden "invalid token" / logged-out errors after a redeploy, check this first.
