# Sprint 20A Verification — Admin Tooling: Access & Data Inspection (Read-only)

## Prerequisites
- Supabase project running with migrations through `015_sprint20_admin_inspection.sql`.
- Two users:
  - **Platform admin**: user whose JWT contains `app_metadata.platform_admin = true`.
  - **Non-platform-admin**: user without `app_metadata.platform_admin = true` in their JWT.
- One org with cases, and one user without org membership (for "Org not set" check).

## 1) Platform-admin provisioning and confirmation (no SQL)
1. In Supabase Dashboard → **Authentication → Users**, select the test user.
2. Under **User Metadata / App Metadata**, set `platform_admin` to `true` in **app_metadata**.
3. Sign out and sign back in to refresh the JWT.
4. Confirm the claim is present:
   - Open browser devtools → Console, run:
     - `JSON.parse(localStorage.getItem("ocm.session")).accessToken`
   - Paste the JWT into a local JWT decoder (or any offline decoder) and verify `app_metadata.platform_admin = true`.

## 2) Admin-only access (non-platform-admin cannot use the tooling)
1. Sign in as **Non-platform-admin** and navigate to **Case List** → **Admin Inspection**.
2. Attempt each lookup (user/org/access/reporting) with valid IDs.
3. **Expected:** each section returns an error (e.g., "Admin access required") and no data.

## 3) Read-only proof (tooling-only, no SQL)
1. As **Platform admin**, open **Admin Inspection**.
2. **User Inspection**:
   - Run the lookup for a known user (email or user_id).
   - Record the returned `Org count` and the list of `Org ID + Role`.
   - Re-run the same lookup.
   - **Expected:** the exact same `Org count` and membership list (no changes).
3. **Org Inspection**:
   - Run the lookup for a known org.
   - Record `Member count` and `Case count`.
   - Re-run the same lookup.
   - **Expected:** counts are unchanged (no new rows or mutations).
4. **Access Reasoning**:
   - Run the check for a known user + case.
   - Re-run the same check.
   - **Expected:** identical `Visible` + `Reason`.
5. **Reporting Sanity**:
   - Run the check for a known org.
   - Record `Case count`, `Reporting SLA rows`, and `Reporting escalation rows`.
   - Re-run the same check.
   - **Expected:** counts are unchanged.

## 4) Example checks (required coverage)
### User lookup (Org not set)
1. Use **User Inspection** with an email/user_id for a user who is not in `org_members`.
2. **Expected:** `Org not set = Yes` and `Org count = 0`.

### Org lookup (member/case anomalies)
1. Use **Org Inspection** with an org_id that has cases but no members.
2. **Expected:** `Cases but no members = Yes`.
3. Use **Org Inspection** with an org_id that has members but zero cases.
4. **Expected:** `Members but no cases = Yes`.

### Access reasoning
1. Use **Access Reasoning** with a user who has no org membership and a real case ID.
2. **Expected:** `Visible = No`, `Reason = no_org_membership`.
3. Use **Access Reasoning** with a user who is in a different org than the case.
4. **Expected:** `Visible = No`, `Reason = org_mismatch`.
5. Use **Access Reasoning** with a user who is a member of the case org.
6. **Expected:** `Visible = Yes`, `Reason = visible`.
7. Use **Access Reasoning** with a non-existent case ID.
8. **Expected:** `Visible = No`, `Reason = case_not_found` (this tool does not claim generic RLS denial).

### Reporting sanity
1. Use **Reporting Sanity** with an org that has no cases.
2. **Expected:** `Reporting empty = Yes`, `Empty reason = no_cases`.
3. Use **Reporting Sanity** with an org that has cases but no reporting rows.
4. **Expected:** `Reporting empty = Yes`, `Empty reason = reporting_empty_with_cases`.

## 5) No regression checks (no SQL)
1. As a normal org member, load **Case List** and **Case Detail**.
2. **Expected:** behavior matches previous sprint (case list visible within org; reporting views unchanged).
3. In the repo, confirm only `supabase/sql/013_sprint18_reporting_views.sql` defines reporting views/RLS, and Sprint 20A migration (`015_sprint20_admin_inspection.sql`) does not modify reporting views.
4. **Expected:** no reporting view or RLS changes outside Sprint 18.

## Delivery Note (What to browse)
- **Case List → Admin Inspection**: Use this page to look up users, orgs, access reasons, and reporting sanity without modifying data.
- The tooling is read-only and **platform-admin-only**; non-platform-admins receive errors.
- Sprint 18 reporting views/RLS are unchanged; use the repo-based check above to confirm.
