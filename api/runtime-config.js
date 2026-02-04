export default function handler(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
  });
}
