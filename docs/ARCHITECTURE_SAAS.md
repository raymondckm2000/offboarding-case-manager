# SaaS Architecture (org_id + RLS)

## A. Multi-Tenant Model
- Every table includes org_id.
- Data isolation relies on Supabase RLS.
- Application-layer filtering is NOT considered a security control.

（中文補充：所有資料表必須有 org_id，隔離以 RLS 為主，應用層過濾不算安全控管。）

## B. User ↔ Organization Model
**profiles table (spec only, no SQL yet):**
- id (uuid = auth.uid)
- org_id
- display_name
- role (OWNER / ADMIN / MEMBER)

**MVP assumption:**
- One user belongs to exactly one org.

**Extension note:**
- Multi-org membership may be added later via org_memberships.

（中文補充：MVP 以單一 org 為前提，未來可延伸多 org 成員表。）

## C. Roles & Accountability
**Case-level roles:**
- requester
- handler
- approver

**Org-level roles:**
- OWNER / ADMIN / MEMBER

**Authority rule:**
- Only approver can generate completion records.

（中文補充：結案紀錄僅能由 approver 產生。）

## D. RLS Design Principles (No SQL yet)
- All tables ENABLE RLS.
- SELECT: only rows with matching org_id, plus any required role-based access.
- INSERT: only for users within the same org_id; server-side validation required.
- UPDATE: only allowed fields; protected fields require elevated role.
- DELETE: only allowed for authorized roles within org_id.

**Special constraints:**
- tasks.is_required cannot be updated by normal users.
- completion_records can only be inserted by approver.
- Evidence access must be org-bound (storage policy later).

（中文補充：RLS 必須強制套用，含特殊欄位與證據存取限制。）

## E. Data Lifecycle & Audit
- completion_records store snapshot_json.
- Case status changes require readiness checks.

（中文補充：結案需保存快照，狀態變更必須檢查準備狀態。）

## F. Security Notes
- Service role key is forbidden in client.
- All writes go through server actions or route handlers.
- Every Sprint must include negative tests:
  - not logged in
  - cross-org
  - rule bypass

（中文補充：Service role key 禁止在前端，所有寫入需走伺服器端。）
