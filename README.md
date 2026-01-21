# Offboarding Case Manager

Offboarding as a managed case: event → accountability → evidence → closure.  
（中文補充：離職作為可管理的案件流程：事件 → 責任 → 證據 → 結案。）

## Repository Structure
- `docs/`: Product, architecture, and sprint documentation.
- `.env.example`: Environment variable template.
- `README.md`: Project overview and startup guidance.

（中文補充：專案結構以 `docs/` 為規格與文件中心，`.env.example` 為環境範本。）

## Development Workflow
- Use `main` as the integration branch.
- Create `sprint/*` branches for sprint work.
- All changes require PM review before merge.

（中文補充：以 `main` 為整合主幹，`sprint/*` 分支開發，需 PM 審核。）

## Architecture Statement
This project adopts a SaaS-ready architecture using org_id + Supabase RLS.  
（中文補充：本專案採用 org_id + Supabase RLS 的 SaaS 架構。）
