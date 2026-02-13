# Sprint 28 Verification

## Register with invite code (email confirm enabled)
1. Go to `#/register`, input email/password and an invite code.
2. Submit and confirm UI shows email verification guidance (`請到 email 完成驗證後再 login`).
3. Confirm browser local storage contains `ocm.pendingInvite` with the same invite code.
4. Verify email, then sign in from `#/login`.
5. Confirm app auto-redeems pending invite, identity updates with org/role, and route lands on `#/cases`.

## Register with invite code (email confirm disabled)
1. Go to `#/register`, input email/password and invite code.
2. Submit and confirm registration redirects to `#/login`.
3. Confirm `ocm.pendingInvite` is stored in local storage.
4. Sign in and confirm pending invite is auto-redeemed.
5. Confirm identity hydration shows org/role and pending invite key is removed.

## Existing account Org Not set -> `#/join` redeem
1. Sign in with account that has no org membership.
2. From identity panel, click `Open join page`.
3. On `#/join`, paste invite code and submit.
4. Confirm successful redeem shows success message, triggers identity hydration, and redirects to `#/cases`.
5. Re-test invalid/expired/already-redeemed code and verify clear error message from `getRpcErrorMessage()`.

## Pending invite auto redeem after login (localStorage path)
1. Manually set local storage key `ocm.pendingInvite` to a valid code.
2. Sign in via `#/login`.
3. Confirm login succeeds and pending invite redeem runs automatically.
4. Success path: key is removed, identity is hydrated, route is `#/cases`.
5. Failure path: key remains, route still lands on `#/cases`, identity hint shows `Invite redeem failed: ...`.

## Node syntax checks
Run:
- `node --check app/app.js`
- `node --check app/access-layer.js`
- `node --check public/ocm/app.js`
- `node --check public/ocm/access-layer.js`
