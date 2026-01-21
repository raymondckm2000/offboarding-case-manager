# Offboarding Case Manager

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
