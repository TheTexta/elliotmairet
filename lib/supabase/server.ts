import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublicConfiguration } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = supabasePublicConfiguration();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies; proxy refresh handles it.
        }
      },
    },
  });
}