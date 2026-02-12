# Sprint 22 Verification — User Role Management (No UUID Input)

## Preconditions
- Apply SQL migrations through `017_sprint22_user_role_management.sql`.
- Have two test accounts:
  - **Owner/Admin account** in at least one org.
  - **Member account** in the same org.

## Governance notes (must-pass)
- This feature is an **owner/admin management tool** only; member cannot use it.
- `search_users_by_email` enforces owner/admin check in DB and returns **minimal fields only**: `user_id`, `email`.
- Search is constrained by `p_email_query` and `limit 20`; no full-table `auth.users` exposure endpoint is provided.
- No RLS relaxation is required; mutation authorization is enforced server-side in `assign_user_to_org`.
- UI does not display UUID values for selection labels; all selections are shown via readable fields.

## UI owner success flow
1. Login as owner/admin.
2. Open `#/admin/users`.
3. Confirm the **Organization** dropdown is pre-populated (from `list_manageable_orgs`).
4. Type a partial email in **User Email Search** and pick a result (from `search_users_by_email`).
5. Select role (`owner/admin/member`) from role dropdown (from `list_roles`).
6. Click **Assign role**.
7. Expected: success message `Success: role assigned.`

## UI member denied flow
1. Login as member user.
2. Open `#/admin/users`.
3. Expected:
   - Manage Users button disabled on case list.
   - Direct route access shows `Access denied.` and submit is disabled.

### Evidence (member UI denied)
- Capture screenshot on `#/admin/users` while signed in as member.

## curl RPC example
```bash
curl -sS -X POST \
  "$SUPABASE_URL/rest/v1/rpc/assign_user_to_org" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "11111111-1111-1111-1111-111111111111",
    "p_org_id": "22222222-2222-2222-2222-222222222222",
    "p_role": "member"
  }'
```
Expected:
- Owner/admin token: membership row is returned.
- Non-owner/admin token: RPC fails with `access denied`.

## curl evidence: member denied (required)

### 1) member denied on `search_users_by_email`
```bash
curl -sS -X POST \
  "$SUPABASE_URL/rest/v1/rpc/search_users_by_email" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $MEMBER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"p_email_query":"example"}'
```
Expected: HTTP error with payload containing `access denied`.

### 2) member denied on `assign_user_to_org`
```bash
curl -sS -X POST \
  "$SUPABASE_URL/rest/v1/rpc/assign_user_to_org" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $MEMBER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "11111111-1111-1111-1111-111111111111",
    "p_org_id": "22222222-2222-2222-2222-222222222222",
    "p_role": "member"
  }'
```
Expected: HTTP error with payload containing `access denied`.

## DB verify query (org_members + audit_logs)
```sql
select org_id, user_id, role, created_at, created_by
from org_members
where org_id = '22222222-2222-2222-2222-222222222222'
  and user_id = '11111111-1111-1111-1111-111111111111';

select org_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
from audit_logs
where entity_type = 'org_member'
  and entity_id = '11111111-1111-1111-1111-111111111111'
order by created_at desc
limit 5;
```
Expected:
- `org_members.role` equals assigned role.
- New append-only `audit_logs` row exists with source `assign_user_to_org` and includes `role_before` + `role_after`.

## Minimum testing evidence
- Syntax checks:
  - `node --check app/app.js`
  - `node --check app/access-layer.js`
  - `node --check public/ocm/app.js`
  - `node --check public/ocm/access-layer.js`
- Static screenshot evidence:
  - Capture `#/admin/users` page after login as owner/admin.
  - Capture `#/admin/users` page while logged in as member (denied state).
