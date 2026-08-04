---
name: Data infrastructure migration
description: Images/blobs are on S3; DB is on Render PostgreSQL. Key facts about the migration state and what was/wasn't done correctly.
---

## Rule
- **Images & blobs**: On Amazon S3, bucket `erebus-blob-storage`, region `eu-west-2`. 125 objects confirmed present. Server uses `uploads/<UUID>` as the S3 key.
- **Database**: Render PostgreSQL. Migration was completed from Replit **production** DB (not dev). Anthony (`anthony@nammu-tech.com`) is Render user_id=2 with 67 dive logs, admin role.
- **API**: Production server runs on Render at `https://erebusapp.nammu-tech.com`.

## User ID mapping (Replit production → Render)
- admin@erebus.app: 1 → 1 (same)
- anthony@nammu-tech.com: 4 → 2
- anthony@clara-eu.co: 3 → 4
- Other production users (5, 14–28) not yet migrated to Render.

## S3 credential issue on Render
Render has `AWS_REGION` and `AWS_BUCKET` env vars set but is MISSING `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
User must add those two in Render dashboard → erebus-api → Environment.
Until then, all `/objects/` file serving returns 500 "Resolved credential object is not valid".

## What was migrated
- Anthony's dive_sites, gear_profiles, cylinders, dive_logs (67), dive_photos (5), equipment_inventory (18), dive_buddies (2) — all migrated via temporary migration endpoints (now removed).
- JSONB columns required explicit JSON.stringify() before INSERT to prevent pg type inference errors.
