# Sprint 3 verification (minimal app access layer + RLS evidence)

This document verifies the Sprint 3 minimal app access layer using **anon key + Bearer JWT** only.
It provides repeatable evidence for **same-org success** and **cross-org failure** enforced by RLS.

## Prerequisites

- **Sprint 3 scope note**: This verification covers the **minimal app access layer** for
  `offboarding_cases`, `tasks`, and `evidence` create/read only. It does **not** include
  UI changes or full CRUD.
- Supabase project URL and anon key
- Two authenticated JWTs:
  - `USER_A_JWT` (member of Org A)
  - `USER_B_JWT` (member of Org B)
- Org IDs:
  - `ORG_A_ID`
  - `ORG_B_ID`
- The minimal access layer in `app/access-layer.js`

Export the required environment variables before running:

**Important**: In all inserts, `created_by` **must match the user id in the JWT**
(User A uses User A's UUID, User B uses User B's UUID).

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon_key>"
export USER_A_JWT="<jwt_for_user_a>"
export USER_B_JWT="<jwt_for_user_b>"
export ORG_A_ID="<org_a_uuid>"
export ORG_B_ID="<org_b_uuid>"
```

## Same-org success (Create + Read)

### Create offboarding case (Org A, User A)

```bash
curl -sS "$SUPABASE_URL/rest/v1/offboarding_cases" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_A_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "employee_name": "Avery Lee",
    "status": "open",
    "created_by": "<USER_A_UUID>",
    "org_id": "'"$ORG_A_ID"'"
  }'
```

**Expected**: `201` with the inserted row (org_id = Org A).

Capture the returned `id` as `CASE_ID` for the next steps.

### Create task (Org A, User A)

```bash
curl -sS "$SUPABASE_URL/rest/v1/tasks" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_A_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "case_id": "<CASE_ID>",
    "title": "Collect laptop",
    "status": "open",
    "is_required": false,
    "created_by": "<USER_A_UUID>",
    "org_id": "'"$ORG_A_ID"'"
  }'
```

**Expected**: `201` with the inserted row (org_id = Org A).

Capture the returned `id` as `TASK_ID`.

### Create evidence (Org A, User A)

```bash
curl -sS "$SUPABASE_URL/rest/v1/evidence" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_A_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "task_id": "<TASK_ID>",
    "note": "Laptop returned to IT",
    "created_by": "<USER_A_UUID>",
    "org_id": "'"$ORG_A_ID"'"
  }'
```

**Expected**: `201` with the inserted row (org_id = Org A).

### Read evidence (Org A, User A)

```bash
curl -sS "$SUPABASE_URL/rest/v1/evidence?select=*&org_id=eq.$ORG_A_ID" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_A_JWT"
```

**Expected**: `200` with rows from Org A (including the new evidence).

## Cross-org failure (RLS)

### Attempt to read Org A evidence as User B (Org B)

```bash
curl -sS "$SUPABASE_URL/rest/v1/evidence?select=*&org_id=eq.$ORG_A_ID" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_B_JWT"
```

**Expected**: `200` with an empty array (`[]`) because RLS filters out Org A rows.

### Attempt to create task in Org A as User B (Org B)

```bash
curl -sS "$SUPABASE_URL/rest/v1/tasks" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_B_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "case_id": "<CASE_ID>",
    "title": "Unauthorized task",
    "status": "open",
    "is_required": false,
    "created_by": "<USER_B_UUID>",
    "org_id": "'"$ORG_A_ID"'"
  }'
```

**Expected**: `401/403` or an RLS error like `new row violates row-level security policy` because User B is not a member of Org A.
