# Sprint 4C Kickoff Brief (Audit Timeline — Read-only UI)

## Core Goal

Build a **read-only Audit Timeline** section on the Case Detail page so permitted
users can view the audit history for **that single case**.

Primary personas:
- Case Owner
- HR
- IT
- Reviewer

## Data Access Strategy (strict)

- Timeline data must be accessed **only via `case_id`** as the entry point.
- **No org-wide audit feed** or “all audit logs” list.
- Access relies on **Bearer JWT + RLS only**.

## UI Requirement — Case Detail Page

Add: **Read-only Audit Timeline** section (no edit/delete controls).

Fixed ordering (documented):
- **Newest first** → `created_at DESC`

Minimum fields displayed per row:
- `created_at`
- `actor` (UUID acceptable)
- `action` (human-readable mapping)
- `target` (`entity_type` + `entity_id`)
- `metadata` (simplified rendering)

### Action mapping (human-readable)

| action value | UI label |
| --- | --- |
| `case.create` | Case created |
| `task.create` | Task created |
| `evidence.create` | Evidence created |

Fallback:
- If an unknown action value appears, display the raw action string.

## Read-only Only (hard rule)

- Only GET / read access is allowed for Sprint 4C.
- No mutation endpoints, no RPC writes, no backfill or repair logic.

## Definition of Done (DoD)

Include all prior Sprint 4C DoD items, plus:
- **Negative verification**: any mutation attempt must fail and **no audit logs change**.
  - Attempt write → expected failure (RLS/immutability).
  - Re-fetch `audit_logs?case_id=...` shows count/order/content unchanged.

## Out of Scope (must remain unchanged)

Do not add search/filter/export/admin/cross-org features or any extra scope.
