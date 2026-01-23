# Sprint 4A Verification Guide (UI workflow)

This guide verifies the UI workflow:
**Case List → Case Detail (Task List + Create Task) → Task Detail (Evidence List + Create Evidence)**.
All requests must use **anon key + Bearer JWT** via the Sprint 3 access-layer.

---

## 1) Prepare two orgId + JWT (minimal steps)

You need two orgs and two users:
- **Org A + User A (JWT A)**
- **Org B + User B (JWT B)**

Minimal preparation:
1. Follow `docs/sprint1-org-bootstrap.md` to create Org A/Org B and org_members.
2. Get `ORG_A_ID` and `ORG_B_ID` from the `orgs` table in Supabase Dashboard.
3. Obtain JWTs (`USER_A_JWT`, `USER_B_JWT`) by signing in as User A / User B:
   - Use your existing auth flow (or Supabase Auth sign-in) and copy the **access_token**.
4. Note the **user UUIDs** (`USER_A_UUID`, `USER_B_UUID`) for `created_by`.

If you already ran Sprint 3 verification, reuse the same values described in
`docs/sprint3-verification.md` (USER_A_JWT/USER_B_JWT/ORG_A_ID/ORG_B_ID).

---

## 2) From blank → Case → Task → Evidence (UI steps + expected results)

### Step A — Open `/cases`
Fill **Session & Org Context**:
- `baseUrl`: Supabase Project URL (e.g., `https://xxxx.supabase.co`)
- `anonKey`: Supabase anon key
- `jwt`: **USER_A_JWT**
- `orgId`: **ORG_A_ID**
- `userId`: **USER_A_UUID**

**Expected**:
- Case list shows **“No data.”** if no cases exist.

### Step B — Create Case (in `/cases`)
Fill **Employee Name** (required) and submit.

**Expected**:
- New case appears in the list immediately.

### Step C — Open Case (`/cases/:caseId`)
Click a case item.

**Expected**:
- Case Info shows Case ID / Case No.
- Task list shows **“No data.”** if none exist.

### Step D — Create Task (in `/cases/:caseId`)
Fill **Title** (required) and submit.

**Expected**:
- Task appears in the Task list immediately.

### Step E — Open Task (`/cases/:caseId/tasks/:taskId`)
Click a task item.

**Expected**:
- Task Info shows Task ID / Title.
- Evidence list shows **“No data.”** if none exist.

### Step F — Create Evidence (in `/cases/:caseId/tasks/:taskId`)
Fill **Note** (optional) and submit.

**Expected**:
- Evidence appears in the Evidence list immediately.

---

## 3) same-org vs cross-org (repro + where to observe)

### Same-org (expected success)
Use:
- `jwt = USER_A_JWT`
- `orgId = ORG_A_ID`

Observe:
- `/cases`: list shows data; create works.
- `/cases/:caseId`: Task list shows data; create works.
- `/cases/:caseId/tasks/:taskId`: Evidence list shows data; create works.

### Cross-org (expected failure)
Use:
- `jwt = USER_A_JWT`
- `orgId = ORG_B_ID` (mismatched)

Observe:
- `/cases`: **“No data.”** or **“Request failed”**.
- `/cases/:caseId` and `/cases/:caseId/tasks/:taskId`: **“No data.”** or **“Request failed”**.

---

## 4) Acceptance Criteria (Sprint 4A brief — Done / Not done + Verification Location)

### 功能層
- 可建立 Case，並在列表中看到 — **Done**
  - Verification: `/cases` Step B (Create Case) and list renders after submit.
- 點進 Case 可看到其 Tasks — **Done**
  - Verification: `/cases/:caseId` Step C shows Task list.
- 可在 Case 下新增 Task — **Done**
  - Verification: `/cases/:caseId` Step D (Create Task).
- 點進 Task 可看到 Evidence — **Done**
  - Verification: `/cases/:caseId/tasks/:taskId` Step E shows Evidence list.
- 可新增 Evidence — **Done**
  - Verification: `/cases/:caseId/tasks/:taskId` Step F (Create Evidence).

### 安全層
- 所有操作使用 anon key + JWT — **Done**
  - Verification: access-layer `request()` injects `apikey` + `Authorization: Bearer <JWT>`.
- org_id 必須由 UI 傳遞 — **Done**
  - Verification: UI forms use Session & Org Context `orgId` and pass into access-layer calls.
- 跨 org 嘗試顯示「無資料 / 失敗」— **Done**
  - Verification: Section 3 cross-org steps (`/cases` + detail pages show No data / Request failed).

### 架構層
- UI 只呼叫 access-layer — **Done**
  - Verification: UI pages import functions from `app/access-layer.js` only.
- access-layer 無任何 UI logic — **Done**
  - Verification: `app/access-layer.js` contains HTTP request utilities only.
- 無 service role 使用痕跡 — **Done**
  - Verification: repo search for `service role` / `service_role` returns no results.

---

## 5) No service role + no direct Supabase REST call (check points)

- **No service role**:
  Check the repo for service role keys or usage, e.g. search for
  `SERVICE_ROLE` / `service_role` / `service role`.

- **UI does NOT call Supabase REST directly**:
  UI pages must only import from the Sprint 3 access-layer.
  The `/rest/v1/...` paths should appear **only** inside the access-layer module,
  not inside UI components/pages.

---

## 6) ESM export impact (Sprint 3 verification)

If `app/access-layer.js` is converted to ESM for Next.js imports:
- **Sprint 3 verification remains valid** because `docs/sprint3-verification.md`
  uses curl only and does not require Node `require()`.
- If any internal script still uses `require()`, add a small CommonJS bridge
  (e.g. `app/access-layer.cjs`) that re-exports the ESM module to preserve compatibility.

---

## 7) Compliance Statement

This Sprint 4A delivery **complies** with the brief:
- UI workflow is end-to-end (Case → Task → Evidence) and can be completed via UI.
- Same-org success and cross-org failure are reproducible (see Section 3).
- No service role is used (see Section 5 check point).
- UI does not call Supabase REST directly; all calls go through access-layer.
