# Sprint 1 org bootstrap (manual steps)

## Create Org A and make User A the owner

1. Sign in as **User A** (authenticated session, not service role).
2. Insert Org A with `created_by = auth.uid()` so the insert policy passes.
3. Insert the matching org_members row with role `owner` for User A.

## Create Org B and make User B the owner

1. Sign in as **User B** (authenticated session, not service role).
2. Insert Org B with `created_by = auth.uid()` so the insert policy passes.
3. Insert the matching org_members row with role `owner` for User B.

## Add another user to an org (owner/admin only)

1. Sign in as an org **owner/admin**.
2. Insert an org_members row for the target user with role `admin` or `member`.

## Policy constraints to avoid dead ends

- `orgs.created_by` must equal `auth.uid()` on insert.
- The first membership for a new org must be created by the same user who created the org, with role `owner`.
- Only owners/admins can add, update, or remove other org members.
