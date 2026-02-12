# Sprint 25 Verification - Register + Invite Flow

## Register flow verification

### A) Email confirm enabled
1. Open `#/register` and submit `email`, `password`, `confirm password` with matching passwords.
2. Expected result: UI shows `請到 email 完成驗證後再 login` and redirects user to `#/login`.
3. Ensure no input for `user_id` or `org_id` exists on the register form.

### B) Email confirm disabled
1. Open `#/register` and submit valid `email/password/confirm password`.
2. Expected result: registration succeeds and user is redirected to `#/login`.
3. Login with the same credentials should succeed.

## Invite flow verification
1. As org owner/admin, execute:
   ```sql
   select * from create_invite('new.user@example.com', 'member');
   ```
2. Copy returned `invite_code`.
3. Register as `new.user@example.com` with invite code in `#/register` (or login first and redeem through register flow when session exists).
4. Expected result: invite is redeemed, membership is created/updated, and identity hydration reflects org/role immediately.

## Existing account redeem invite (Org Not set)
1. Sign in as an existing account that currently has no org membership (`Org: Not set`).
2. Navigate to `#/join` (or click the `Open join page.` link shown in the Signed-in Identity `Org: Not set` hint).
3. Enter a valid invite code and submit.
4. Expected result: redeem succeeds, identity is re-hydrated immediately, and user is redirected to `#/cases`.
5. Confirm **Signed-in Identity** now shows Org/Role instead of `Not set`.

## DB checks
```sql
-- membership created by invite redemption
select org_id, user_id, role, created_at
from org_members
where user_id = '<new_user_uuid>'
order by created_at desc;

-- audit trail for invite lifecycle
select action, org_id, actor_user_id, metadata, created_at
from audit_logs
where action in ('org_invite_created', 'org_invite_redeemed')
order by created_at desc
limit 20;
```

## Node syntax checks
```bash
node --check app/app.js
node --check app/access-layer.js
node --check public/ocm/app.js
node --check public/ocm/access-layer.js
```
