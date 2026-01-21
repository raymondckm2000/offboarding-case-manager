import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Offboarding Case Manager</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to continue.
        </p>
        <Link
          className="mt-4 inline-block text-sm font-medium text-blue-600"
          href="/login"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
