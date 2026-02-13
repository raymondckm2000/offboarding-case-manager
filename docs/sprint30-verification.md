# Sprint 30 Verification

Scope: UI ↔ DB lifecycle integration only. This runbook verifies lifecycle transitions via RPC, role enforcement behavior, and audit timeline reads.

## Preconditions
1. App is running and points to the target Supabase project.
2. You have at least:
   - one **case owner** account,
   - one **non-owner** account in the same org,
   - one test case in `draft` status visible to both users.
3. Open the app and sign in before each scenario.

## V1. Draft → Submitted（正向）
1. Sign in with the **case owner** account.
2. Navigate to `#/cases`, open a `draft` case in Case Detail.
3. Confirm Lifecycle Actions only shows **Submit**.
4. Click **Submit** once.

### Expected (Pass/Fail)
- **PASS**: Case status updates to `submitted` in Case Detail.
- **PASS**: Audit Timeline shows one new `case_status_transition` record reflecting `draft -> submitted`.
- **PASS**: Returning to Case List shows the same case status as `submitted`.
- **FAIL**: No status change, no timeline row, or UI silently ignores click.

## V2. Role enforcement（負向）
1. Sign out and sign in with a **non-owner** account.
2. Open a `draft` case detail owned by another user.
3. Attempt submit behavior:
   - If Submit button is not shown, record as prevented.
   - If Submit button is shown, click once.

### Expected (Pass/Fail)
- **PASS**: If button is hidden, transition is prevented at UI layer.
- **PASS**: If button is visible but RPC is denied, UI displays DB error text containing `only case owner can submit draft`.
- **FAIL**: Transition succeeds for non-owner, or failure occurs without an error message.

## V3. Audit Timeline
1. Open any case detail page with existing audit history.
2. Confirm timeline loads without `Unable to load audit timeline (400)`.
3. Confirm list order is newest first (`created_at desc`).
4. Execute one legal transition from Lifecycle Actions (for eligible status).

### Expected (Pass/Fail)
- **PASS**: Timeline renders read-only entries without 400.
- **PASS**: `case_created` and `case_status_transition` entries are visible when present.
- **PASS**: After transition, timeline refreshes and shows the new audit row.
- **FAIL**: Timeline returns 400, stale entries, or no diagnostic message on read failure.

## Quick regression checks
- `node --check app/access-layer.js`
- `node --check app/audit-timeline.js`
- `node --check app/case-detail.js`
- `node --check app/app.js`
