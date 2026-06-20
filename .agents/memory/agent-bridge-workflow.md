---
name: Agent bridge workflow
description: How to link dev log entries after finishing a task — production-only endpoints, in_progress only (user confirms completion).
---

# Agent Bridge Workflow

After completing work on a dev log task, call **agent-link on the PRODUCTION server** to set task_ref and status=in_progress. Do NOT call agent-complete — that is the user's decision after they verify the fix.

**Why:** Dev and production run on separate PostgreSQL databases. Calling localhost:3001 updates the dev DB only, which the app never reads from. The dev log UI at erebusapp.nammu-tech.com reads from the production DB.

**Why in_progress only:** The user reviews and confirms fixes before marking completed. Agent sets in_progress; user sets completed.

## Command (run after every task that links to a DL entry)

```bash
SECRET=$(node -e "require('dotenv').config(); console.log(process.env.AGENT_BRIDGE_SECRET || '')" 2>/dev/null)
curl -s -X POST "https://erebusapp.nammu-tech.com/api/internal/agent-link" \
  -H "Content-Type: application/json" \
  -H "x-agent-key: ${SECRET}" \
  -d '{"id": <DEV_LOG_ID>, "taskRef": "#<TASK_NUMBER>"}'
```

Expected response: `{"ok":true}`

## How to find DEV_LOG_ID

The DL badge on a dev log entry shows `DL-{id}` — the number after the dash is the database primary key.

## agent-complete (for future use if needed)

The `POST /api/internal/agent-complete` endpoint exists on the production server (added in same session). Only call it if explicitly asked to mark something done:

```bash
curl -s -X POST "https://erebusapp.nammu-tech.com/api/internal/agent-complete" \
  -H "Content-Type: application/json" \
  -H "x-agent-key: ${SECRET}" \
  -d '{"id": <DEV_LOG_ID>}'
```

**How to apply:** After every `mark_task_complete`, if the task was linked to a DL entry, run the agent-link curl command above against the PRODUCTION URL. Never use localhost for this.
