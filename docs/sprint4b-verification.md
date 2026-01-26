# Sprint 4B Verification Guide (Audit Logs)

## Acceptance Criteria

### Audit Logs immutability (UPDATE / DELETE)
- **Valid outcomes include BOTH of the following**:
  - **(a)** HTTP **401/403** (RLS denial).
  - **(b)** HTTP **204** with **0 rows affected** **AND** a follow-up **SELECT** confirms the row still exists (no-op).
- **No-op behavior is considered immutable.**

## 7) Evidence of Results (actual outputs)

All verification steps below were executed manually against a live Supabase project
using anon key + authenticated JWT, per prerequisites.

---

### Step A — Create Case (Org A)

- Result: **SUCCESS**
- Observation:
  - `offboarding_cases` row created successfully.
  - `audit_logs` automatically received a new entry.
- Evidence:
  - `action`: `case.create`
  - `entity_type`: `offboarding_case`
  - `actor_user_id`: matches authenticated user
- Outcome classification: **PASS**

---

### Step B — Create Task (Org A)

- Result: **SUCCESS**
- Observation:
  - `tasks` row created successfully.
  - `audit_logs` automatically received a new entry.
- Evidence:
  - `action`: `task.create`
  - `entity_type`: `task`
- Outcome classification: **PASS**

---

### Step C — Create Evidence (Org A)

- Result: **SUCCESS**
- Observation:
  - `evidence` row created successfully.
  - `audit_logs` automatically received a new entry.
- Evidence:
  - `action`: `evidence.create`
  - `entity_type`: `evidence`
- Outcome classification: **PASS**

---

### Step D — Verify Audit Logs Written by DB Triggers

- Result: **SUCCESS**
- Observation:
  - Audit log rows were present for case, task, and evidence creation.
  - Ordering by `created_at DESC` confirms chronological integrity.
- Evidence:
  - Three entries observed:
    - `case.create`
    - `task.create`
    - `evidence.create`
- Outcome classification: **PASS**

---

### Step E — Attempt UPDATE on audit_logs (immutability)

- Action:
  - HTTP `PATCH /audit_logs?id=eq.<audit_log_id>`
- Result:
  - HTTP **204 No Content**
- Follow-up verification:
  - Subsequent `SELECT` confirms the audit log row **still exists**
  - No field values were modified
- Interpretation:
  - Operation is a **no-op**
- Outcome classification:
  - **PASS (Immutable — no-op behavior accepted)**

---

### Step F — Attempt DELETE on audit_logs (immutability)

- Action:
  - HTTP `DELETE /audit_logs?id=eq.<audit_log_id>`
- Result:
  - HTTP **204 No Content**
- Follow-up verification:
  - Subsequent `SELECT` confirms the audit log row **still exists**
- Interpretation:
  - Operation is a **no-op**
- Outcome classification:
  - **PASS (Immutable — no-op behavior accepted)**

---

### Step G — Same-org read (Org A)

- Action:
  - `SELECT * FROM audit_logs WHERE org_id = OrgA`
- Result:
  - Audit log entries returned successfully
- Outcome classification:
  - **PASS**

---

### Step H — Cross-org read (Org B with User A)

- Action:
  - `SELECT * FROM audit_logs WHERE org_id = OrgB`
- Result:
  - Empty result set (or RLS denial)
- Interpretation:
  - Cross-org access correctly blocked by RLS
- Outcome classification:
  - **PASS**

---

## Final Verification Summary

- Audit logs are **automatically written by DB triggers**
- Audit logs are **append-only**
- UPDATE / DELETE attempts result in:
  - HTTP 401/403 **or**
  - HTTP 204 with **no-op behavior**
- Cross-org access is correctly blocked

**Sprint 4B verification: COMPLETE**

