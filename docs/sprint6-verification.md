# Sprint 6 Verification Guide — Reviewer Assignment + Sign-off Gate

All requests use **anon key + Bearer JWT**.

## Step 0 — Assign reviewer (evidence required)

### 0.1 PATCH reviewer assignment
- Request URL:
- Status:
- Payload (must include reviewer_user_id):
- Response:

### 0.2 GET confirm persisted
- Request URL:
- Status:
- Response (must show reviewer_user_id persisted):

## Step 1 — Reviewer sign-off succeeds (assigned reviewer)

### 1.1 Sign-off insert (assigned reviewer JWT)
- Request URL:
- Status:
- Payload:
- Response:

### 1.2 Audit before/after
- Audit BEFORE URL / Status / Response summary:
- Audit AFTER URL / Status / Response summary:

## Step 2 — Non-reviewer sign-off blocked

### 2.1 Sign-off insert (non-reviewer JWT)
- Request URL:
- Status:
- Payload:
- Response:

### 2.2 Audit before/after
- Audit BEFORE URL / Status / Response summary:
- Audit AFTER URL / Status / Response summary:

## Step 2b — Sign-off update/delete blocked

### 2b.1 UPDATE sign-off
- Request URL:
- Status:
- Payload (if any):
- Response:

### 2b.2 DELETE sign-off
- Request URL:
- Status:
- Payload (if any):
- Response:

### 2b.3 Audit before/after
- Audit BEFORE URL / Status / Response summary:
- Audit AFTER URL / Status / Response summary:

## Step 3 — Close case blocked without sign-off

### 3.1 Close case attempt (missing sign-off)
- Request URL:
- Status:
- Payload:
- Response:

### 3.2 Audit before/after
- Audit BEFORE URL / Status / Response summary:
- Audit AFTER URL / Status / Response summary:

## Step 4 — Close case allowed after required tasks complete + sign-off present

### 4.0 Evidence required tasks complete
- Request URL:
- Status:
- Response (must show required tasks complete):

### 4.1 Close case attempt (required tasks complete + sign-off present)
- Request URL:
- Status:
- Payload:
- Response:

### 4.2 Audit before/after
- Audit BEFORE URL / Status / Response summary:
- Audit AFTER URL / Status / Response summary:

## Step 5 — Cross-org blocked

### 5.1 Cross-org attempt
- Request URL:
- Status:
- Payload:
- Response:

### 5.2 Audit before/after
- Audit BEFORE URL / Status / Response summary:
- Audit AFTER URL / Status / Response summary:
