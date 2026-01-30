# Sprint 8 交付回報（Read-only Case Detail UI）

## 1) AC → 對應檔案（逐條列）

1. Case status header
   - 對應：`app/case-detail.js`

2. Closure readiness panel（mirror server state）
   - 對應：`app/case-detail.js`

3. Completion summary view
   - 對應：`app/case-detail.js`

4. Read-only audit timeline viewer
   - 對應：`app/audit-timeline.js`

5. Verification docs
   - 對應：`docs/sprint8-verification.md`

---

## 2) 驗證步驟（UI）+ 預期觀察（逐條列）

1. Case status header
   - 期望：顯示 status / employee / dept / position / last working day。

2. Closure readiness panel
   - 期望：顯示 server status（read-only）與 required task completion 狀態。

3. Completion summary view
   - 期望：顯示 tasks complete / required / optional 統計。

4. Read-only confirmation
   - 期望：無 Close / Reopen / Override。
   - 期望：無 inline edit / delete 行為。

---

## 3) Scope 聲明

- 是否有任何 scope 增加：**否**。
- 本次僅新增 Case Detail read-only UI 區塊與 Sprint 8 文件。
- 未新增任何 mutation endpoint 或 backend 規則。
