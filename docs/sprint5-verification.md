# Sprint 5 Verification Guide (Case Closure Gate)

This guide verifies **case closure gating** (server-side enforcement) and the
Close Case UI workflow. All requests must use **anon key + Bearer JWT**.

---

## 1) Prerequisites (reuse existing setup)

Use the same setup from prior sprints:
- Org A + User A (JWT A)
- Org B + User B (JWT B)
- Existing Case + Tasks in Org A

---

## 2) UI Steps (success + failure)

### Step A — Open Case Detail
- Navigate to `/cases/:caseId`.
- **Expected**: Case header shows Case ID/Case No, and a **Close Case** action appears.

### Step B — Failure Path (required task incomplete)
1. Ensure at least one **required task** is **not complete** (status != `complete`).
2. Click **Close Case**.

**Expected UI**:
- UI shows failure message (e.g., “Unable to close case”).

### Step C — Success Path (all required tasks complete)
1. Update all required tasks to `status = complete`.
2. Click **Close Case**.

**Expected UI**:
- UI shows success message.
- Status displays as **closed**.

---

## 3) Network Evidence (required)

Capture the following in DevTools Network:

### Evidence 1 — Successful close
- Request: `PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>`
- **Expected**: 2xx response with payload showing `status = closed`.

### Evidence 2 — Failed close (incomplete required task)
- Request: `PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>`
- **Expected**: 401/403/400 (any acceptable failure from RLS/validation).

### Evidence 3 — Re-fetch after failed close
- Request: `GET /rest/v1/offboarding_cases?id=eq.<CASE_ID>`
- **Expected**: `status` remains **open**.

---

## 4) Audit Evidence (required)

After a **successful close**, confirm audit log entry:

- Request: `GET /rest/v1/audit_logs?case_id=eq.<CASE_ID>&order=created_at.desc`
- **Expected**: A log entry with `action = case.close`.

---

## 5) Cross-org verification (RLS)

Attempt the same close with:
- `jwt = USER_A_JWT`
- `orgId = ORG_B_ID` (mismatched)

**Expected**: empty result or 401/403. No cross-org update.
