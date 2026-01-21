# Offboarding Case Manager

codex/start-sprint-0-setup-next.js-skeleton
Sprint 0 delivers a runnable Next.js App Router skeleton with Supabase Auth and middleware-based route protection for `/app/*`.

## Local setup
1. Create `.env.local` from `.env.example` and fill in Supabase values.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Visit `http://localhost:3000/login` and sign in.

## Supabase Auth Setup
- Enable the Email/Password provider.
- (Dev) Disable email confirmations if desired.
- Set Site URL to `http://localhost:3000`.

## Sprint workflow
1. Create a `sprint/*` branch.
2. Open a PR.
3. PM review.
4. Merge to `main`.

## Notes
- Sprint 0 uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Middleware protects `/app/*` and redirects unauthenticated users to `/login`.
=======
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
sprint/0-auth-skeleton
