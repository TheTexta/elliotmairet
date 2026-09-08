import { createClient } from "@supabase/supabase-js";

import { supabasePublicConfiguration } from "./config";

export function createPublicClient() {
  const { publishableKey, url } = supabasePublicConfiguration();

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
