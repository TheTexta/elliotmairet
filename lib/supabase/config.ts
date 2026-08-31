const defaultUrl = "https://api.dextery.dev";
const defaultPublishableKey =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDU1MzcwMCwiZXhwIjo0OTMwMjI3MzAwLCJyb2xlIjoiYW5vbiJ9.HVtr0mMAc2VYP7Ap8z4Q0QCyUp1IJLwGAIjyKWaBYDY";

export function supabasePublicConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || defaultUrl;
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    defaultPublishableKey
  ).trim();

  return { publishableKey, url: url.replace(/\/$/, "") };
}