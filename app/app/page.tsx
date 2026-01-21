import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in as{" "}
          <span className="font-medium text-slate-900">
            {user?.email ?? "unknown"}
          </span>
          .
        </p>
      </div>
    </main>
  );
}
