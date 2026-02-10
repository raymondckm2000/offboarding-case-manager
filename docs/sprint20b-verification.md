# Sprint 20B Verification Guide

## Sprint 20B 目標
在 `/admin` 提供 Platform Admin 專用的唯讀 Admin Inspection tooling，支援：
- User Inspection（email / user_id）
- Org Inspection（org_id）
- Access Reasoning（user_id + case_id）
- Reporting Sanity（org_id）

所有查詢都必須是 read-only，且非 `app_metadata.platform_admin = true` 的使用者必須被阻擋並顯示清楚訊息（不可 silent redirect）。

---

## 功能模組與驗收標準

### 1) User Inspection（唯讀）
**輸入**：`email` 或 `user_id`

**預期顯示**：
- user_id
- email
- 是否 platform admin
- 所屬 orgs（org_id + role）
- org count

**驗收**：
- 查詢後有結構化顯示（不是 raw JSON dump）
- UI 沒有 edit / modify / delete 行為
- 同條件連續查兩次，結果一致
- 查無資料顯示 `Not found.`

### 2) Org Inspection（唯讀）
**輸入**：`org_id`

**預期顯示**：
- member count
- case count
- 是否有 cases but no members
- 是否有 members but no cases

**驗收**：
- 查詢後顯示上述欄位
- 同條件連續查兩次，結果一致
- 無任何修改控制
- 查無資料顯示 `No org found.`

### 3) Access Reasoning（唯讀）
**輸入**：`user_id`, `case_id`

**預期顯示**：
- visible: true / false
- reason（例如：`no_org_membership` / `org_mismatch` / `visible` / `case_not_found`）

**驗收**：
- 查詢後清楚顯示 visible + reason
- 同條件連續查兩次，結果一致
- 無任何修改控制

### 4) Reporting Sanity（唯讀）
**輸入**：`org_id`

**預期顯示**：
- case count
- reporting SLA rows count
- reporting escalation rows count
- 是否 empty reporting

**驗收**：
- 查詢後顯示上述欄位
- 同條件連續查兩次，結果一致
- 無任何修改控制
- 查無資料顯示 `No org found.`

### 5) Platform Admin Gate
**規則**：僅 `JWT app_metadata.platform_admin = true` 可進入 `/admin`。

**驗收**：
- platform-admin 可看到四個 inspection panel
- 非 platform-admin 進入 `/admin` 時被阻擋，並看到明確提示訊息
- 不可 silent redirect

---

## 測試步驟（手動 UI）

### A. Platform-admin only
1. 清除瀏覽器 site data（localStorage / sessionStorage / cookies）。
2. 使用 platform-admin 帳號登入。
3. 前往 `#/admin`。
4. 確認可見：User Inspection / Org Inspection / Access Reasoning / Reporting Sanity。
5. 登出後改用非 platform-admin 帳號登入。
6. 直接開 `#/admin`，確認顯示阻擋訊息，且沒有 silent redirect。

### B. Repeatable Read-only
1. User Inspection：用相同 `email` 或 `user_id` 連續查兩次，結果一致。
2. Org Inspection：用相同 `org_id` 連續查兩次，結果一致。
3. Access Reasoning：用相同 `user_id + case_id` 連續查兩次，結果一致。
4. Reporting Sanity：用相同 `org_id` 連續查兩次，結果一致。
5. 檢查四區都沒有 edit/update/delete/confirm mutation 操作。

---

## 可複製驗收命令（UI / API / DB 標記）

> 以下命令以本地環境為例，請替換 `<...>`。

### UI
```bash
# 啟動靜態站（示例）
python3 -m http.server 4173
```

### API（RPC）
```bash
# User Inspection
curl -sS "<SUPABASE_URL>/rest/v1/rpc/admin_inspect_user" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"p_email":"<EMAIL>","p_user_id":null}'

# Org Inspection
curl -sS "<SUPABASE_URL>/rest/v1/rpc/admin_inspect_org" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":"<ORG_ID>"}'

# Access Reasoning
curl -sS "<SUPABASE_URL>/rest/v1/rpc/admin_access_check" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"p_user_id":"<USER_ID>","p_case_id":"<CASE_ID>"}'

# Reporting Sanity
curl -sS "<SUPABASE_URL>/rest/v1/rpc/admin_reporting_sanity" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":"<ORG_ID>"}'
```

### DB（可選）
```sql
-- 用於對照 org member/case 基礎數據
select count(*) from org_members where org_id = '<ORG_ID>';
select count(*) from offboarding_cases where org_id = '<ORG_ID>';
```

---

## 例外狀況與判定標準

- **Not found / No org found.**：屬於可接受結果，表示輸入不存在，不是系統錯誤。
- **403 / admin access required**：若為非 platform-admin 屬預期；若為 platform-admin 則判定為失敗。
- **網路錯誤 / timeout**：顯示錯誤訊息並可重試；不得造成頁面崩潰。
- **結果不一致**：同參數連續查詢若結果不同，判定 Repeatable 失敗。
- **出現任何 mutation 控件**：直接判定不符合 Sprint 20B read-only 要求。
