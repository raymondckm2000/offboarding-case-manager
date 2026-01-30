# Sprint 6 Verification Evidence (Paste Outputs)

## Preconditions (must be true)
- org_id = c4d6f4e6-00dc-45ca-b6d7-7fbccfe1f814
- case_id = 78f0c7ff-636b-484e-8d27-4e28b3590492
- reviewer JWT sub = <REVIEWER_USER_ID>
- org_members contains (org_id, user_id=sub)
- offboarding_cases.reviewer_user_id = sub

---

## Server-side precheck: audit table name/columns
**Query used (唯一指定, SQL editor / psql):**
```
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'audit_logs'
  and column_name in ('org_id', 'actor_user_id', 'action', 'entity_type', 'entity_id', 'metadata')
order by column_name;
```

**Query output (must show table= audit_logs and columns: org_id, actor_user_id, action, entity_type, entity_id, metadata):**
```
<PASTE OUTPUT HERE>
```

---

## 1) POST /rest/v1/reviewer_signoffs (payload: org_id, case_id only)
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

---

## 2) GET /rest/v1/reviewer_signoffs?id=eq.<reviewer_signoffs.id>
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

---

## 3) GET /rest/v1/audit_logs?entity_type=eq.reviewer_signoff&entity_id=eq.<reviewer_signoffs.id>
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Success criteria (must be true):**
- response has ≥ 1 row
- entity_type = 'reviewer_signoff'
- entity_id = <signoff id>
- metadata.case_id = <case_id> (if metadata contains case_id)

---

## Audit trigger behavior confirmation
Note: audit_logs insert is performed by DB trigger; client must not insert directly.

---

## If POST still 403
Paste the query results proving which precondition failed:
```
<PASTE org_members / offboarding_cases reviewer_user_id evidence HERE>
```
