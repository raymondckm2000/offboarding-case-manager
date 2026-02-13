# Sprint 26 Verification

## Invite creation flow

1. Sign in as an `admin` user and navigate to **Manage Users**.
2. In **Create Invite**, choose a role and submit.
3. Verify UI shows:
   - `invite_code`
   - `expires_at`
4. Click **Copy** and verify clipboard receives `invite_code`.

## Access control verification

1. Sign in as a `member` user.
2. Navigate to **Manage Users**.
3. Verify **Create Invite** is not displayed.
4. Verify member cannot create invite via UI.

## Join and redeem verification

1. Use a created invite code.
2. Navigate to `#/join` and redeem the code.
3. Verify redeem succeeds and identity context updates immediately.

## Audit verification

1. After successful create invite, inspect `audit_logs`.
2. Verify an event `org_invite_created` exists for the action.

## Syntax checks

Run:

- `node --check app/app.js`
- `node --check app/access-layer.js`
- `node --check public/ocm/app.js`
- `node --check public/ocm/access-layer.js`
