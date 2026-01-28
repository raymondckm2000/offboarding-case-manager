# Sprint 6 Verification Guide (Org Members FK Fix)

This guide verifies the `org_members.user_id` foreign key points to `auth.users(id)`
and that inserts succeed for valid users.

---

## 1) Prerequisites

Reuse existing setup:
- Org A + User A (JWT A)
- Org B + User B (JWT B)

---

## 2) org_members insert (success path)

Use a valid `auth.users.id` for `user_id`.

```sql
insert into org_members (org_id, user_id, role, created_by)
values ('<ORG_A_ID>', '<USER_A_ID>', 'member', '<USER_A_ID>');
```

**Expected**:
- Insert succeeds (2xx / row returned).
- `org_members.user_id` references `auth.users.id` with no FK error.

---

## 3) Evidence (required)

Capture evidence of a successful insert:
- Request: `POST /rest/v1/org_members`
- **Expected**: 2xx response with inserted row.
- **Evidence**: screenshot or response payload showing success.
