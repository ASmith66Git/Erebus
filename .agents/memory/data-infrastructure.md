---
name: Data infrastructure migration
description: Images/blobs are on S3; all DB data is on Render PostgreSQL — not Replit.
---

## Rule
- **Images & blobs**: fully migrated to Amazon S3. Never look for them in Replit object storage.
- **Database**: fully migrated to Render PostgreSQL. The Replit internal DB (`helium`) is stale/unused for production. Do not attempt to dump or reference it for data.
- **API**: Production server runs on Render at `https://erebusapp.nammu-tech.com`.
- **Why**: User invested significant effort in these migrations. Assuming Replit holds live data wastes time and is wrong.
