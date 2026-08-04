---
name: Data infrastructure migration
description: Images/blobs are on S3; DB is on Render PostgreSQL. Key facts about the migration state and what was/wasn't done correctly.
---

## Rule
- **Images & blobs**: Amazon S3, bucket `erebus-blob-storage`, region **us-east-1** (NOT eu-west-2 — the AWS_REGION secret was wrong; bucket confirmed in us-east-1 via x-amz-bucket-region header). Server uses `uploads/<UUID>` as the S3 key.
- **Database**: Render PostgreSQL. Migration was completed from Replit **production** DB (not dev). Anthony (`anthony@nammu-tech.com`) is Render user_id=2 with 67 dive logs, admin role.
- **API**: Production server runs on Render at `https://erebusapp.nammu-tech.com`.

## User ID mapping (Replit production → Render)
- admin@erebus.app: 1 → 1 (same)
- anthony@nammu-tech.com: 4 → 2
- anthony@clara-eu.co: 3 → 4
- Other production users (5, 14–28) not yet migrated to Render.

## S3 region issue (resolved pending Render env var update)
The AWS_REGION secret was incorrectly set to eu-west-2 everywhere; bucket is actually in us-east-1.
Fix: set AWS_REGION=us-east-1 in Render dashboard → erebus-api → Environment, and update Replit secret to match.
S3 HeadObject with us-east-1 confirmed SUCCESS (ContentType: image/jpeg, Size: 151820).

## What was migrated (Anthony's data)
- dive_sites, gear_profiles, cylinders, dive_logs (67), dive_photos (5), equipment_inventory (18), dive_buddies (2) — all migrated.
- JSONB columns required explicit JSON.stringify() before INSERT to prevent pg type inference errors.
- All temporary migration endpoints removed from server/index.js after migration completed.
