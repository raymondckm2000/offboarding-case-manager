# Sprint 23 Verification — Membership-based Identity & UI Gating

## Scope
- Replace UI role/org identity source from JWT/session claims to DB membership source.
- Ensure Manage Users / Owner actions and `#/admin/users` guard are controlled by `org_members.role` (`owner`/`admin` vs `member`).
- Keep DB/RPC guardrails as final authorization decision.

## Pre-check
- Apply SQL migrations in order (preview/prod must use the same ordered set):
  1. `supabase/sql/017_sprint22_user_role_management.sql`
  2. `supabase/sql/018_sprint23_identity_membership.sql`
  3. `supabase/sql/019_sprint23_search_users_by_email_hotfix.sql`
- `get_current_identity_membership()` should return exactly `(org_id uuid, org_name text, role text)` and deterministically prioritize `owner/admin` memberships.
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

### D) `search_users_by_email` mismatch troubleshooting
- If UI shows `structure of query does not match function result type`, the deployed function signature and `RETURN QUERY` columns/types are out of sync.
- Confirm latest hotfix migration is applied (`019_sprint23_search_users_by_email_hotfix.sql`) and re-run deploy for both preview/prod.
- SQL Editor `select * from public.search_users_by_email('raymond');` may show `access denied` by design when JWT is absent (`auth.uid()` is `null`). Verify via RPC + Bearer token (or Supabase “Run as authenticated” mode, if available).

## Expected Result Summary
- UI identity never shows org as `Not set` when membership exists.
- UI role shows membership role (`owner`/`admin`/`member`) instead of `authenticated`.
- UI action gating is membership-based and consistent across Case List, Owner button, and `#/admin/users`.
- RLS/RPC authorization remains enforced server-side.
