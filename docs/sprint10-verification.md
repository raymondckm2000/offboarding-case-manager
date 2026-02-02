# Sprint 10 Verification Checklist

Use the steps below to verify the email + password login, read-only access layer, and URL hygiene updates for Sprint 10.

## Email + password login flow
1. Load the app with a valid `baseUrl` and `anonKey` configured.
2. Enter a test email address and password, then click **Log in**.
3. Confirm you land on the Case List view and the session is stored in local storage (not in the URL).

## Identity panel defaults
1. After sign-in, inspect the **Signed-in Identity** panel.
2. If the API omits a field, confirm the value reads **Not set** (not “Unknown”).

## RLS visibility (A/B)
1. Sign in as User A (org A) and confirm only org A cases and tasks appear.
2. Sign out, then sign in as User B (org B) and confirm only org B data appears.

## No-access state
1. Sign in with a user that lacks access to any cases.
2. Confirm the Case List shows “No access / no data available for this account.”
3. Attempt to open a case by URL; confirm the detail view shows “No access / no data for this case.”

## URL and console hygiene
1. During sign-in and navigation, confirm the URL never includes `access_token` or `refresh_token` fragments.
2. Open the browser console and confirm there are no fatal errors after login and data loads.

## Dev config injection（方案 A）
### 準備方式
1. 在 `public/ocm/config.js` 建立本機檔案（不可 commit），內容範例如下：
   ```js
   window.OCM_DEV_CONFIG = {
     baseUrl: "https://YOUR_PROJECT.supabase.co",
     anonKey: "YOUR_SUPABASE_ANON_KEY"
   };
   ```
2. 確認 `public/ocm/config.js` 已被 `.gitignore` 排除（`git status` 不應出現該檔案）。

### 驗證步驟
1. 不帶 query string（不含 `baseUrl`/`anonKey`）打開應用。
2. 觀察 UI 的 Base URL / Anon Key 欄位是否自動帶入 `window.OCM_DEV_CONFIG` 的值。
3. 重新整理頁面，確認值仍可從 localStorage/persisted config 取回。
4. 刪除或移除 `public/ocm/config.js`，重新整理頁面。
5. 再次以 query string 或手動輸入方式配置，確認行為與改動前一致。

### 預期結果
- 優先序為 `queryConfig > persisted > devConfig > undefined`，且可用步驟重現。  
- 有 `public/ocm/config.js` 時，UI 可自動取得 baseUrl / anonKey。  
- 移除 `public/ocm/config.js` 後，行為回到原本（仍可用 query/persisted；未配置則顯示缺值狀態）。  
- `public/ocm/config.js` 不會被 git 追蹤或提交。  

### 安全說明
- `anonKey` 本質為公開資訊，真正的安全核心在於 Supabase RLS 與權限設定。
