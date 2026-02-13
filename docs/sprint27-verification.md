# Sprint 27 Verification

## 1) Org member can create from `#/cases/new`
1. Login as a user with an existing `org_members` row (role `owner`/`admin`/`member`).
2. Open `#/cases/new` from the **Create case** button on case list.
3. Fill **Employee name** (required), optional **Last working day**, optional **Notes**, and submit.
4. Expected:
   - RPC `create_offboarding_case` succeeds.
   - UI shows short success state and returns to `#/cases`.
   - New case appears in case list.

## 2) Org not set user is blocked
1. Login as a user with no org membership (`Org: Not set`).
2. Open `#/cases/new`.
3. Expected in UI:
   - Submit is disabled and prompt points user to `#/join`.
4. Expected server-side:
   - Calling RPC `create_offboarding_case` directly returns `access denied`.

## 3) Audit log check
1. After successful case creation, query `audit_logs` for the new case id.
2. Expected:
   - one `case_created` row exists
   - `entity_type = 'offboarding_case'`
   - metadata includes `employee_name`, `last_working_day`, and `occurred_at`.

## 4) Static syntax checks
Run:
- `node --check app/app.js`
- `node --check app/access-layer.js`
- `node --check public/ocm/app.js`
- `node --check public/ocm/access-layer.js`

## 5) Direct insert gate check (trigger/gate effective)
1. As an authenticated user, attempt direct insert into `offboarding_cases` (without setting `app.case_create` via RPC path).
2. Expected:
   - request is rejected by insert gate/trigger
   - error message is equivalent to `case creation must use create_offboarding_case`.
