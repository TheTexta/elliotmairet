"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabasePublicConfiguration } from "./config";

export function createClient() {
  const { publishableKey, url } = supabasePublicConfiguration();

  return createBrowserClient(url, publishableKey);
}