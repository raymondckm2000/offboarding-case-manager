# Sprint 7 交付回報（Case Closure & System Readiness）

## 1) AC → 對應檔案（逐條列）

1. Case Closure Gate（僅在條件成立時可關閉）
   - 對應：`supabase/sql/006_sprint7_case_closure.sql`（`close_offboarding_case` + `enforce_case_closure_gate`）

2. Closure permission & server-side enforcement
   - 對應：`supabase/sql/006_sprint7_case_closure.sql`（`close_offboarding_case` 權限檢查 + closure gate trigger）

3. Post-closure immutability（tasks / evidence / reviewer_signoff）
   - 對應：`supabase/sql/006_sprint7_case_closure.sql`（immutability triggers）

4. Audit completion evidence
   - 對應：`supabase/sql/006_sprint7_case_closure.sql`（`audit_logs` insert with `case_closure`）

5. Verification docs
   - 對應：`docs/sprint7-verification.md`
   - 對應：`docs/sprint7-verification-evidence-template.md`

---

## 2) 驗證步驟（Network）+ 預期觀察（逐條列）

1. Direct PATCH close attempt
   - 期望：`PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>` 失敗（RLS/trigger closure gate）。

2. RPC closure success
   - 期望：`POST /rest/v1/rpc/close_offboarding_case` 成功，回傳 status='closed'.

3. Post-closure immutability
   - 期望：`POST /rest/v1/tasks` / `POST /rest/v1/evidence` / `POST /rest/v1/reviewer_signoffs` 皆失敗。

4. Audit evidence
   - 期望：`GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>` 看到 `action=case_closure` 且 metadata 完整。

---

## 3) Scope 聲明

- 是否有任何 scope 增加：**否**。
- 本次僅新增 Case closure gate、immutability enforcement、audit log 與 Sprint 7 文件。
- 未改動任何既有 RLS policy。

---

## 再次確認與聲明

- 未修改 Sprint 4B audit schema/trigger/RLS。
- 未新增 reopen / rollback / override 機制。
- 未新增 UI flow 或視覺層改動。
