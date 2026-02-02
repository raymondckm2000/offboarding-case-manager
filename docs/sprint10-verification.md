# Sprint 10 Verification Checklist

Use the steps below to verify the OTP-only login, read-only access layer, and URL hygiene updates for Sprint 10.

## OTP-only login flow
1. Load the app with a valid `baseUrl` and `anonKey` configured.
2. Enter a test email address and click **Send OTP**.
3. Confirm the UI reveals the OTP input and displays “OTP sent. Check your email for the code.”
4. Enter the OTP from the email and click **Verify OTP**.
5. Confirm you land on the Case List view and the session is stored in local storage (not in the URL).

## Identity panel defaults
1. After sign-in, inspect the **Signed-in Identity** panel.
2. If the API omits a field, confirm the value reads **Not set** (not “Unknown”).

## RLS visibility (A/B)
1. Sign in as User A (org A) and confirm only org A cases and tasks appear.
2. Sign out, then sign in as User B (org B) and confirm only org B data appears.

## No-access state
1. Sign in with a user that lacks access to any cases.
2. Confirm the Case List shows “No access / no data available for this account.”
3. Attempt to open a case by URL; confirm the detail view shows “No access / no data for this case.”

## URL and console hygiene
1. During sign-in and navigation, confirm the URL never includes `access_token` or `refresh_token` fragments.
2. Open the browser console and confirm there are no fatal errors after login and data loads.
