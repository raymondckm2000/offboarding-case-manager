# Sprint 19 Verification — Org Bootstrap & Reporting Access Enablement

## Preconditions
- Supabase project is running with Sprint 18 reporting views and existing RLS.
- You have two authenticated users:
  - **User A**: org creator (or org admin once bootstrapped).
  - **User B**: secondary user to validate admin assignment and cross-org blocking.
- You have an org ID (`ORG_ID`) that has at least one case and currently has **zero** members.

## Before: user has no org membership
1. Sign in as User A (or any user without org membership) and verify identity shows no org.
2. Open `#/dashboard` and confirm:
   - Signed-in Identity Org shows **Not set**.
   - Dashboard shows the fallback/no data message.
2. Confirm reporting endpoints return empty/denied (Org is not set):
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/reporting_case_sla?select=*&limit=1"
   ```
   **Expected:** empty array or RLS error.

## Bootstrap org membership (first user)
1. Call the bootstrap function as the org creator (User A):
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST \
     "$SUPABASE_URL/rest/v1/rpc/bootstrap_org_owner" \
     -d '{"p_org_id":"ORG_ID"}'
   ```
   **Expected:** returns the new `org_members` row with `role = owner`.

2. Open `#/dashboard` and confirm:
   - Signed-in Identity Org is no longer **Not set**.
   - Dashboard shows real rows when the org has cases.
   - Dashboard does **not** show the fallback/no data message.
3. Verify identity shows the org and reporting is readable:
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/offboarding_cases?select=*&limit=1"
   ```
   **Expected:** rows appear when the org has cases.

4. Verify audit timeline access for org case IDs:
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/audit_logs?select=*&case_id=eq.CASE_ID&order=created_at.desc"
   ```
   **Expected:** audit rows for cases in the org.

## Admin assignment (existing member adds another user)
1. As User A (org admin/owner), add User B to the org:
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST \
     "$SUPABASE_URL/rest/v1/rpc/add_org_member" \
     -d '{"p_org_id":"ORG_ID","p_user_id":"USER_B_ID","p_role":"member"}'
   ```
   **Expected:** returns an `org_members` row for User B.

## User B after assignment
1. Sign in as User B and open `#/dashboard`.
   - **Expected:** Signed-in Identity Org is set (not **Not set**).
   - **Expected:** Dashboard shows real rows when the org has cases (no fallback message).
2. Confirm reporting endpoints return 200 and rows (when org has cases):
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $USER_B_ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/reporting_case_sla?select=*&limit=1"
   ```
   **Expected:** HTTP 200 and rows when the org has cases.
3. Verify audit timeline access for org case IDs (if applicable):
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $USER_B_ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/audit_logs?select=*&case_id=eq.CASE_ID&order=created_at.desc"
   ```
   **Expected:** audit rows for cases in the org.

## Cross-org access remains blocked
1. Sign in as User B and attempt to read from a different org (`OTHER_ORG_ID`).
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $USER_B_ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/offboarding_cases?select=*&org_id=eq.OTHER_ORG_ID"
   ```
   **Expected:** empty array or RLS error.
2. Cross-org reporting view access remains blocked:
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $USER_B_ACCESS_TOKEN" \
     "$SUPABASE_URL/rest/v1/reporting_case_sla?select=*&org_id=eq.OTHER_ORG_ID&limit=1"
   ```
   **Expected:** empty array or RLS error.

## Reporting remains read-only
1. Attempt to write to a reporting view:
   ```bash
   curl -sS \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST \
     "$SUPABASE_URL/rest/v1/reporting_case_sla" \
     -d '{"org_id":"ORG_ID"}'
   ```
   **Expected:** 401/403/405 error (no inserts allowed).
