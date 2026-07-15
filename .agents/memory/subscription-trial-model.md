---
name: Subscription & trial model
description: How Erebus trials and Apple subscriptions work — critical for all paywall/subscription decisions
---

## The Model

When a user reaches the paywall they are **subscribing immediately with their Apple ID**.
Apple starts a **14-day free trial** — the user is not charged for 14 days, but they ARE
an active subscriber from the moment they tap subscribe.

**Key consequences:**
- During the 14-day Apple trial, RevenueCat sees an **active entitlement** → `isSubscribed = true`
- `isSubscribed = true` during the trial is CORRECT — the user has a real Apple subscription, just not yet billed
- The "Manage Subscription" button must show when `isSubscribed = true` (covers both trial and paid periods), because Apple requires users be able to cancel during a free trial

## Access Gate

`hasAccess = isAdmin || isSubscribed`

There is NO server-side trial. All new users go to the paywall immediately (except admins).
The `trial_ends_at` column still exists in the DB but is not used in app logic.

**Why:**
Removing the server-side grace period ensures Apple reviewers see the paywall/subscription flow,
and keeps the access model clean: you either have an active RC entitlement or you don't.

## What NOT to confuse

- `isTrialActive` / `trialDaysRemaining` — **removed from AuthContext**, do not re-add
- `isTrial` from RC (`periodType === 'TRIAL'`) = Apple subscription in its free-trial period — this is fine, it means `isSubscribed = true`
- The server-side `trial_ends_at` DB column is legacy; ignore it in app logic
