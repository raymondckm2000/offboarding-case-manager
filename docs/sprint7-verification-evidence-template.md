# Sprint 7 Verification Evidence (Paste Outputs)

## Preconditions (must be true)
- org_id = <ORG_ID>
- case_id = <CASE_ID>
- actor JWT sub = <ACTOR_USER_ID>
- offboarding_cases.status = 'ready_to_close'
- offboarding_cases.reviewer_user_id is not null
- org_members contains (org_id, user_id=sub) with role owner/admin OR case created_by = sub
- all required tasks are complete
- at least one reviewer_signoffs exists for case_id

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

## Policy list consistency check (before & after)
Capture policy list **before** and **after** applying `006_sprint7_case_closure.sql`.
Use UI screenshots or SQL output.
**SQL (psql / SQL editor):**
```
select
  table_name,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and table_name in ('offboarding_cases', 'tasks', 'evidence', 'reviewer_signoffs')
order by table_name, policyname, cmd;
```

**Before output:**
```
<PASTE OUTPUT HERE>
```

**After output:**
```
<PASTE OUTPUT HERE>
```

**Success criteria:** policy list and counts identical before vs after migration.

---

## 1) PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID> (direct close attempt)
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Expected:** request fails with 401/403/400 and closure gate message.

---

## 2) POST /rest/v1/rpc/close_offboarding_case
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Expected:** status=200 and response status='closed'.

---

## 3) GET /rest/v1/offboarding_cases?id=eq.<CASE_ID>
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Expected:** status='closed'.

---

## 4) POST /rest/v1/tasks (post-close mutation)
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Expected:** request fails with 401/403/400.

---

## 5) POST /rest/v1/evidence (post-close mutation)
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Expected:** request fails with 401/403/400.

---

## 6) POST /rest/v1/reviewer_signoffs (post-close mutation)
**Full curl command used:**
```
<PASTE FULL CURL HERE>
```

**Full response (status + body):**
```
<PASTE FULL RESPONSE HERE>
```

**Expected:** request fails with 401/403/400.

---

## 7) GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>
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
- action = 'case_closure'
- entity_type = 'offboarding_case'
- entity_id = <CASE_ID>
- metadata includes reviewer_signoff_count and required_tasks_incomplete=false
