# Sprint 1 deliverables

## DONE checklist (acceptance criteria)

- [x] Schema tables created with `org_id` on all rows (orgs, org_members, offboarding_cases, tasks, evidence).
- [x] Foreign keys enforce cross-table org consistency.
- [x] RLS enabled on all tables and policies restrict access to org members only.
- [x] `is_required` changes restricted to org owners/admins at the database level.
- [x] RLS verification uses authenticated sessions only (no service role).

## File-level change list

**Added**
- `docs/sprint1-org-bootstrap.md`
- `docs/sprint1-deliverables.md`

**Modified**
- `docs/sprint1-rls-test-plan.md`

**Deleted**
- None

## Server-side enforcement statement

RLS is enforced server-side at the database level, not via UI checks.

## Mandatory negative tests (included in test plan)

- N1: Unauthenticated access denied
- N2: Cross-org read blocked
- N3: Cross-org write blocked
- N4: `is_required` cannot be modified by non-privileged role
