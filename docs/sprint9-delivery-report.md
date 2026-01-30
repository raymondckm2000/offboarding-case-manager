# Sprint 9 Delivery Report (Minimal Web App)

## 1) Scope Delivered

- Login entry screen with credential validation (GET-only).
- Case List (read-only) with required columns.
- Case Detail reuse (Sprint 8 UI) with read-only sections.
- App shell with header + logout + back navigation.
- Auth gating on Case List / Case Detail routes.

---

## 2) Acceptance Criteria → Files

1. Login / Logout flow
   - `app/app.js`
   - `app/index.html`

2. Case List (read-only, required columns)
   - `app/app.js`

3. Case Detail reuse (Sprint 8 read-only sections)
   - `app/app.js`
   - `app/case-detail.js`
   - `app/audit-timeline.js`

4. Minimal App Shell / Navigation
   - `app/app.js`
   - `app/styles.css`

5. Verification docs
   - `docs/sprint9-verification.md`

---

## 3) Non-goals Confirmation

- No backend / SQL / migration / RLS changes.
- No new RPCs or mutation endpoints.
- No create/edit/delete operations in UI.
