# Sprint 5 交付回報（Case Closure Gate）

## 1) AC → 對應檔案/頁面（逐條列）

1. Close Case action exists in Case Detail（AC1）
   - 對應：`app/case-detail.js`

2. Server-side enforced closure gate（AC2）
   - 對應：`supabase/sql/002_rls.sql`（`case_has_incomplete_required_tasks` + update policy gating）

3. Successful close produces audit log entry（AC3）
   - 對應：`app/audit-timeline.js`（`case.close` label）
   - 說明：依賴既有 Sprint 4B audit trigger（未改動）

4. No changes to Sprint 4B audit layer（AC4）
   - 對應：未修改 audit schema/trigger/RLS 檔案（僅新增 case close gating）

5. Security constraints（AC5）
   - 對應：`app/access-layer.js`（僅 anon key + Bearer JWT）

---

## 2) 驗證步驟（UI + Network）+ 預期觀察（逐條列）

### UI
1. Case detail 頁面看到 **Close Case** 行為
   - 期望：Case 詳細頁顯示 Close Case 按鈕與 status。

2. Failure path（required task incomplete）
   - 期望：點擊 Close Case 失敗；UI 顯示錯誤訊息。

3. Success path（all required tasks complete）
   - 期望：點擊 Close Case 成功；UI status 更新為 closed。

### Network
1. 成功關閉
   - 期望：`PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>` → 2xx + `status=closed`

2. 失敗關閉（required task incomplete）
   - 期望：同一 PATCH → 401/403/400

3. 失敗後 re-fetch
   - 期望：`GET /rest/v1/offboarding_cases?id=eq.<CASE_ID>` → `status` 仍為 open

4. Audit evidence
   - 期望：`GET /rest/v1/audit_logs?case_id=eq.<CASE_ID>&order=created_at.desc` 看到 `case.close`

---

## 3) Scope 聲明

- 是否有任何 scope 增加：**否**。
- 本次僅新增 Case close UI + server-side gating + Sprint 5 文件。

---

## 再次確認與聲明

- 未使用 service role（僅 anon key + Bearer JWT + RLS）。
  - **Deviation**：無法「百分之百」保證執行時環境未被外部改動，僅能依 repo 內容確認。
- 未新增任何 audit mutation API/endpoint。
  - **Deviation**：無法「百分之百」保證外部系統行為，僅能依 repo 內容確認未新增寫入端點。
- 未改動 4B audit schema/trigger/RLS。
  - **Deviation**：無法「百分之百」保證外部 DB 狀態未被改動，僅能依 repo 內容確認未改動相關 SQL 檔。
