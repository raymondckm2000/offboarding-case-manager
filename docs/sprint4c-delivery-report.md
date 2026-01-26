# Sprint 4C 交付回報

## 1) AC → 對應檔案/頁面（逐條列）

1. Case Detail 頁新增「Read-only Audit Timeline」區塊  
   - 對應：`app/audit-timeline.js`、`app/case-detail.js`

2. 以 `case_id` 查詢 audit_logs，固定排序  
   - 對應：`app/access-layer.js`（`listAuditLogs` 使用 `case_id` + `created_at.desc`）

3. Timeline 顯示最低欄位 + action human-readable mapping  
   - 對應：`app/audit-timeline.js`

4. Kickoff Brief 補強（personas、case_id only、固定排序、DoD negative verification）  
   - 對應：`docs/sprint4c-kickoff-brief.md`

5. Verification 文件（UI/Network/Access/Mutation steps）  
   - 對應：`docs/sprint4c-verification.md`

---

## 2) 驗證步驟（UI + Network）+ 預期觀察（逐條列）

### UI
1. Case list → 開啟任一 Case detail  
   - 期望：顯示「Read-only Audit Timeline」區塊。
2. 若無 audit logs  
   - 期望：區塊仍顯示並呈現空狀態訊息（No audit activity found）。

### Network
1. 觀察至少 1 筆實際 GET request  
   - 期望：`/rest/v1/audit_logs?case_id=eq.<CASE_ID>&order=created_at.desc`
2. same-org  
   - 期望：回傳 rows 或空陣列（無 logs 時）。
3. cross-org  
   - 期望：空陣列（RLS 過濾）或 401/403。
4. mutation failure（至少一次）  
   - 期望：POST/PATCH/DELETE 任一寫入嘗試失敗 → 立即 re-fetch GET → audit_logs 不變。

---

## 3) Scope 聲明（含 app/case-detail.js 理由）

- 是否有任何 scope 增加：**否**。  
- `app/case-detail.js` 理由：新增此檔案作為 **Case Detail UI 渲染入口/組裝點**，
  用於承載 Sprint 4C 的 Audit Timeline 區塊（純讀取，未新增任何跨 org/搜尋/管理功能）。

---

## 再次確認與聲明

- 未使用 service role（僅 anon key + Bearer JWT + RLS）。  
  - **Deviation**：無法「百分之百」保證執行時環境未被外部改動，僅能依 repo 內容確認。
- 未新增任何 audit mutation API/endpoint。  
  - **Deviation**：無法「百分之百」保證外部系統行為，僅能依 repo 內容確認未新增寫入端點。
- 未改動 4B audit schema/trigger/RLS。  
  - **Deviation**：無法「百分之百」保證外部 DB 狀態未被改動，僅能依 repo 內容確認未改動相關 SQL 檔。
