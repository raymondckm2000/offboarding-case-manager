# Sprint 9 Verification Guide (Minimal Web App)

## 1) Login → Case List → Case Detail → Logout

1. Open `app/index.html`.
2. Enter Supabase URL, anon key, and JWT, then click **Log in**.
   - **Expected**: Routed to Case List.
3. Click a row on the Case List.
   - **Expected**: Case Detail renders header, closure readiness (read-only), completion summary, and read-only audit timeline.
4. Click **Back to Case List**.
   - **Expected**: Return to Case List.
5. Click **Log out**.
   - **Expected**: Routed back to Login screen and auth is cleared.

---

## 2) Read-only confirmation checklist

- [ ] No “Close / Reopen / Override” buttons exist.
- [ ] No inline edit or delete actions exist.
- [ ] DevTools Network: only **GET** requests for `offboarding_cases`, `tasks`, `audit_logs` when navigating.

---

## 3) Unauthenticated access behavior

1. Clear local storage or click **Log out**.
2. Attempt to open `#/cases` or `#/cases/<id>` directly.
   - **Expected**: Redirected to the Login screen.
