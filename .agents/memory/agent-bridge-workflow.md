---
name: Agent bridge workflow
description: How to link and complete dev log entries after finishing a task — two internal endpoints called via localhost:3001.
---

# Agent Bridge Workflow

After completing work on a dev log task, call BOTH endpoints in sequence.

**Why:** The dev log in the Erebus app tracks tasks with a status (`todo → in_progress → completed`) and a `task_ref` badge (`#64`, etc.). Users can see these in the in-app dev log screen. Forgetting to call these leaves the entry stale at `todo` with no task number.

## Step 1 — Link (sets task_ref + marks in_progress)

```bash
SECRET=$(node -e "require('dotenv').config(); console.log(process.env.AGENT_BRIDGE_SECRET || '')" 2>/dev/null)
curl -s -X POST "http://localhost:3001/api/internal/agent-link" \
  -H "Content-Type: application/json" \
  -H "x-agent-key: ${SECRET}" \
  -d '{"id": <DEV_LOG_ID>, "taskRef": "#<TASK_NUMBER>"}'
```

## Step 2 — Complete (sets status = completed)

```bash
SECRET=$(node -e "require('dotenv').config(); console.log(process.env.AGENT_BRIDGE_SECRET || '')" 2>/dev/null)
curl -s -X POST "http://localhost:3001/api/internal/agent-complete" \
  -H "Content-Type: application/json" \
  -H "x-agent-key: ${SECRET}" \
  -d '{"id": <DEV_LOG_ID>}'
```

## How to find DEV_LOG_ID

The DL badge on a dev log entry shows `DL-{id}` — the number after the dash is the database primary key to pass as `id`.

## Production note

The production server at `erebusapp.nammu-tech.com` won't have newly-added endpoints until redeployed. Always use `localhost:3001` (the local API Server workflow) for these internal calls — it shares the same PostgreSQL database.

**How to apply:** After every `mark_task_complete` call, if the task was linked to a dev log entry (DL-xxx), run both curl commands above. The DL id comes from the task description; the task number comes from the project task ref.
