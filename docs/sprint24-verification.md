# Sprint 24 Verification - Single-Org Enforcement

## Scope
Validate that Sprint 24 enforces single-org membership at DB level and aligns UI gating/display with that contract.

## Case A - Admin account (single membership)
1. Sign in as user with exactly 1 `org_members` row and role `owner` or `admin`.
2. Confirm **Signed-in Identity** shows the expected org name and role.
3. Confirm **Manage Users** button is enabled.
4. Open `#/admin/users` and confirm Organization is shown as a single-org read-only value.
5. Assign role to a user already in the same org; expect success.

## Case B - Member account
1. Sign in as user with exactly 1 `org_members` row and role `member`.
2. Confirm **Manage Users** button is disabled with owner/admin-only intent.
3. Navigate to `#/admin/users`; confirm assignment remains blocked (`Access denied`).

## Case C - Multi-org user should fail identity RPC
1. Create a test user with multiple `org_members` rows (legacy/bad state).
2. Execute `select * from get_current_org_context();` as that user context.
3. Expect exception: `multi-org not supported`.
4. In UI, confirm Signed-in Identity displays an identity context error (debug-friendly signal), not a silently picked org.

## Case D - Cross-org target assignment blocked
1. Use owner/admin from org A.
2. Choose a target user who already belongs to org B (`org_members.org_id != org A`).
3. Call `assign_user_to_org(target, org A, role)`.
4. Expect exception: `multi-org not supported`.
5. Confirm an append-only audit row exists with `action='org_membership_assignment_blocked'` and metadata `blocked_reason='multi-org not supported'`.

## Manual SQL helper for existing multi-org cleanup (admin-only, optional)
```sql
-- Identify users in legacy multi-org state
select user_id,
       count(*) as memberships,
       array_agg(org_id order by org_id) as org_ids
from org_members
group by user_id
having count(*) > 1
order by memberships desc, user_id;
```

Use the report above to manually decide retained org membership per user. Sprint 24 intentionally blocks new cross-org assignments and does not auto-clean legacy data.
