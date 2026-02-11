# Sprint 21 Verification — Owner Assign Reviewer

## Pre-req and migration execution
1. Confirm migrations `001` through `015` are already applied.
2. Open Supabase Dashboard → SQL Editor.
3. Paste `supabase/sql/016_sprint21_owner_assign_reviewer.sql` and run once.
4. Verify functions:
   - `is_org_owner_or_admin(uuid, uuid)`
   - `owner_assign_case_reviewer(uuid, uuid)`

## UI verification steps
### Owner/Admin flow (success)
1. Login as an org `owner` or `admin` user.
2. Open `#/cases`.
3. Confirm each row has an enabled **Owner** button.
4. Click **Owner** on a case row.
5. On `#/owner`, input:
   - `case_id`
   - `reviewer_user_id` (member in same org)
6. Submit and confirm success message: `Success: reviewer assigned.`

### Re-assign flow (same case, twice)
1. Use owner/admin account and open `#/owner?case_id=<same_case_uuid>`.
2. First assign `reviewer_user_id = <reviewer_a_uuid>` and confirm success.
3. Re-submit same case with `reviewer_user_id = <reviewer_b_uuid>` and confirm success again.
4. Verify DB query shows latest `offboarding_cases.reviewer_user_id = <reviewer_b_uuid>`.
5. Verify audit query returns **2+** `owner_reviewer_assigned` rows for same case (append-only, no overwrite).

### Member flow (denied)
1. Login as org `member` user.
2. Open `#/cases`.
3. Confirm **Owner** button is disabled and tooltip indicates owner/admin only.
4. Navigate directly to `#/owner`.
5. Confirm submit is disabled and status shows `Access denied.`

## API verification (RPC curl)
```bash
curl -sS -X POST "${SUPABASE_URL}/rest/v1/rpc/owner_assign_case_reviewer" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "p_case_id": "<case_uuid>",
    "p_reviewer_user_id": "<reviewer_user_uuid>"
  }'
```

Expected:
- Owner/admin + same-org reviewer => updated `offboarding_cases` row payload.
- Non owner/admin => RPC error `access denied`.
- Missing case => RPC error `case not found`.
- Reviewer not in org => RPC error `reviewer not in org`.

## DB verification queries
### Case reviewer changed
```sql
select id, org_id, reviewer_user_id, status, updated_at
from offboarding_cases
where id = '<case_uuid>';
```

> If `updated_at` does not exist in your schema, omit it.

### Audit log append-only evidence
```sql
select id, org_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
from audit_logs
where action = 'owner_reviewer_assigned'
  and entity_type = 'offboarding_case'
  and entity_id = '<case_uuid>'
order by created_at desc;
```

Check metadata fields:
- `reviewer_before`
- `reviewer_after`
- `source = owner_assign_case_reviewer`
- `assigned_at`

## Exception outcome matrix
- `case not found` → Not found case id.
- `access denied` → actor is not owner/admin of case org (or no membership).
- `reviewer not in org` → reviewer user has no membership in case org.
