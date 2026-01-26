# Sprint 4B Verification Guide (Audit Logs)

## Acceptance Criteria

### Audit Logs immutability (UPDATE / DELETE)
- **Valid outcomes include BOTH of the following**:
  - **(a)** HTTP **401/403** (RLS denial).
  - **(b)** HTTP **204** with **0 rows affected** **AND** a follow-up **SELECT** confirms the row still exists (no-op).
- **No-op behavior is considered immutable.**
