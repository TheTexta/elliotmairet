const defaultUrl = "https://api.dextery.dev";

export function supabasePublicConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || defaultUrl;
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");
  }

  return { publishableKey, url: url.replace(/\/$/, "") };
}