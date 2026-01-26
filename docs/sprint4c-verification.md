# Sprint 4C Verification Guide (Audit Timeline UI)

## A) UI steps

1. Navigate: **Case list → open a case detail**.
2. Confirm the **Read-only Audit Timeline** section is visible on the case detail page.
3. Expected empty state: if no logs are visible, the section still renders and shows
   **“No audit activity found.”**

## B) Network evidence requirement (strict)

You must provide **at least 1 actual GET request** evidence for `audit_logs`.
The evidence must show the real request URL / query string and include:
- `case_id=eq.<CASE_ID>`
- `order=created_at.desc` (newest first)

## C) Access outcomes (same-org vs cross-org)

Same-org success:
- Timeline returns rows **or** empty array (if no logs exist).

Cross-org attempt:
- Acceptable outcomes are:
  - Empty array (RLS-filtered), **or**
  - 401/403 (unauthorized / RLS denial)

## D) Read-only confirmation + mutation failure (strict)

- UI provides **no edit/delete** actions for audit logs.
- Perform at least **one write attempt** (POST/PATCH/DELETE) against `audit_logs`.
- Expected result: **401/403 or failed request** (RLS/immutability).
- Immediately re-fetch **GET /audit_logs?case_id=...**.
- Evidence must show **audit_logs unchanged** (count/order/content stable).
