# Sprint 20A Verification — `/admin` Platform-Admin Gate (Acceptance A)

## Scope
This document verifies that:
1. `app_metadata.platform_admin = true` users can always stay on `/#/admin`.
2. Non-platform-admin users are blocked from `/#/admin` with a clear message (no silent redirect).
3. `Org: Not set` does not block platform-admin access to `/#/admin`.
4. The UI explicitly shows the active Supabase URL so project mismatches can be detected.

---

## Root Cause (actual guard / decision point)
The observed `/#/admin -> /#/cases` redirect came from the hash fallback route in `public/ocm/app.js`:
- Before fix, `renderRoute()` had no `#/admin` branch.
- Unknown hashes fell through to `navigate(session ? "#/cases" : "#/login")`.
- Therefore opening `/#/admin` silently redirected to `/#/cases`.

This is a client-side route guard/fallback issue, not an RLS rule.

---

## Fix Summary
- Added an explicit `#/admin` route branch in `public/ocm/app.js`.
- Added platform-admin claim check that reads **`app_metadata.platform_admin` from JWT claims**.
- For non-platform-admin users, render an explicit access-denied panel (no silent redirect).
- Added token refresh flow (`refresh_token` grant) before route checks to ensure current claims after re-login/session refresh.
- Added visible "Supabase URL" row in Signed-in Identity panel for project-target verification.

---

## Test Steps and Pass/Fail Criteria

### 1) Platform Admin: clear site data → login → open `/#/admin`
1. Clear browser site data (local storage/session/cookies).
2. Login as user with JWT claim `app_metadata.platform_admin = true`.
3. Open `/#/admin` directly.

**Pass:** Stays on Admin page; no redirect to `/#/cases`.
**Fail:** Any silent redirect away from `/#/admin`.

### 2) Non-Platform Admin: open `/#/admin`
1. Login as user without `app_metadata.platform_admin = true`.
2. Open `/#/admin` directly.

**Pass:** Access is blocked with explicit message indicating admin requirement.
**Fail:** Silent redirect or blank/unclear state.

### 3) Org Not set scenario
1. Use a platform-admin user with no org membership (`Org: Not set` in identity).
2. Open `/#/admin`.

**Pass:** Still allowed to stay on Admin page.
**Fail:** Blocked due to missing org.

### 4) Claim source verification (`app_metadata.platform_admin`)
1. Login and decode `localStorage["ocm.session"].accessToken`.
2. Confirm route gate result matches `claims.app_metadata.platform_admin === true`.

**Pass:** Gate behavior strictly matches the claim.
**Fail:** Gate uses org/role fallback and ignores claim.

### 5) Supabase project targeting verification
1. In Signed-in Identity panel, verify displayed **Supabase URL**.
2. Confirm this URL matches the project where user metadata (`platform_admin`) was updated.

**Pass:** URL is visible and consistent with metadata-edit project.
**Fail:** URL missing or points to different project.

---

## Evidence Checklist (attach per run)
- Screenshot: platform-admin stays on `/#/admin`.
- Screenshot: non-platform-admin sees explicit blocked message on `/#/admin`.
- Screenshot: identity panel shows `Org: Not set` + still on admin page (platform admin).
- Screenshot/log: identity panel shows active Supabase URL.
- Console/log snippet: decoded JWT includes `app_metadata.platform_admin` claim.

---

## Notes
- This sprint item changes client route behavior and gate messaging; no data mutation path added.
- Server-side platform-admin enforcement for admin RPC remains required and unchanged.

## Evidence captured
- Case 1 (platform admin can stay on `/#/admin`):
  - `browser:/tmp/codex_browser_invocations/6a1d12be8562ccb9/artifacts/artifacts/sprint20a-case1-platform-admin-admin-page.png`
- Case 2 (non-platform-admin blocked message on `/#/admin`):
  - `browser:/tmp/codex_browser_invocations/6a1d12be8562ccb9/artifacts/artifacts/sprint20a-case2-non-admin-blocked.png`
- Case 3 (Org: Not set + platform admin still allowed on admin):
  - `browser:/tmp/codex_browser_invocations/6a1d12be8562ccb9/artifacts/artifacts/sprint20a-case3-org-not-set-platform-admin.png`
- Case 4 (Identity panel shows Supabase URL / baseUrl):
  - `browser:/tmp/codex_browser_invocations/6a1d12be8562ccb9/artifacts/artifacts/sprint20a-case4-supabase-url-visible.png`

## Deployed verification
- Tested URL: `http://127.0.0.1:4180/ocm/index.html` (validated against commit `50797ef`).
- Runtime-config 200 evidence screenshot: `browser:/tmp/codex_browser_invocations/43a15392811004c6/artifacts/artifacts/deployed-runtime-config-200.png`
