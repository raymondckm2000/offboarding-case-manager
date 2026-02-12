# Sprint 23 Verification — Membership-based Identity & UI Gating

## Scope
- Replace UI role/org identity source from JWT/session claims to DB membership source.
- Ensure Manage Users / Owner actions and `#/admin/users` guard are controlled by `org_members.role` (`owner`/`admin` vs `member`).
- Keep DB/RPC guardrails as final authorization decision.

## Pre-check
- Apply SQL migration: `supabase/sql/018_sprint23_identity_membership.sql`.
- Confirm test users include:
  - Admin account: `raymondckm2000@yahoo.com.hk` (has `org_members.role = 'admin'` in at least one org)
  - Member-only account: has only `org_members.role = 'member'`

## Verification Steps

### A) Admin account (`raymondckm2000@yahoo.com.hk`)
1. Login via UI.
2. On Case List page:
   - **Manage Users** button is enabled.
   - Signed-in Identity shows:
     - `Role = admin` (or `owner` if that membership is first by deterministic ordering)
     - `Org = <org name>` (not `Not set`)
3. Click **Manage Users** and verify `#/admin/users` loads normally with org dropdown available.

### B) Member account
1. Login via UI.
2. On Case List page:
   - **Manage Users** button is disabled.
3. Open `#/admin/users` directly and verify:
   - `Access denied` message shown.
   - Submit button remains disabled.

### C) DB guardrails smoke test
1. Member account calls RPC `assign_user_to_org` → expect `access denied`.
2. Member account calls RPC `search_users_by_email` → expect `access denied`.
3. Owner/admin account calls both RPCs with valid parameters → expect success.

## Expected Result Summary
- UI identity never shows org as `Not set` when membership exists.
- UI role shows membership role (`owner`/`admin`/`member`) instead of `authenticated`.
- UI action gating is membership-based and consistent across Case List, Owner button, and `#/admin/users`.
- RLS/RPC authorization remains enforced server-side.
