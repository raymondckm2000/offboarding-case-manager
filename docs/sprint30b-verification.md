# Sprint 30b Verification

## 1) Build pipeline source check (Vercel serves repo `public/ocm/*`)

1. Confirm frontend entrypoint references `/ocm/*` assets from the repo `public/ocm/` tree:
   - `public/index.html` should load:
     - `/ocm/styles.css`
     - `/ocm/access-layer.js`
     - `/ocm/audit-timeline.js`
     - `/ocm/case-detail.js`
     - `/ocm/app.js`
2. Confirm `public/ocm/*` is tracked and not git-ignored:
   - `.gitignore` only ignores `public/ocm/config.js` (local dev override), not app bundles.
3. Deploy and open app. In the header, verify `Version: <value>` is visible.
4. Change deploy env var (`APP_VERSION` or `__BUILD_SHA__`) and redeploy.
5. Confirm header version text changes between deployments (visual proof you are on latest bundle).

## 2) Network audit filter verification

1. Open Case Detail and capture the request to `/rest/v1/audit_logs`.
2. Verify query uses:
   - `entity_type=eq.offboarding_case`
   - `entity_id=eq.<caseId>`
3. Confirm no `case_id=eq.<caseId>` filter is used for this view.

## 3) Case Detail lifecycle controls verification

1. Open a case in `draft` status.
2. Verify a `Lifecycle Actions` section is visible.
3. Verify `Submit` button is visible.
4. Click `Submit`.
5. Confirm status transitions and detail view refreshes with updated server state.
