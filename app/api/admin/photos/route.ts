import { after, NextResponse } from "next/server";

import { invalidatePhotographsAndPalettes } from "@/lib/cache-invalidation";
import { processAutomaticPhotographText } from "@/lib/photographs/automatic-text";
import { decodePublicationCommand, executePhotographPublication } from "@/lib/photographs/publication";
import { publicObjectUrl } from "@/lib/r2/objects";
import { getAdminSession } from "@/lib/supabase/admin";

export const maxDuration = 300;

function responseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function r2PublicDeliveryConfigured() {
  const baseUrl = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.trim();
  if (!baseUrl) return false;
  try {
    publicObjectUrl(baseUrl, "configuration-check");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return responseError("Administrator access is required.", 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return responseError("Invalid request."); }

  if (!r2PublicDeliveryConfigured()) {
    return responseError("Photograph uploads are unavailable while storage is being migrated.", 503);
  }

  let command: ReturnType<typeof decodePublicationCommand>;
  try { command = decodePublicationCommand(body); }
  catch (error) { return responseError(error instanceof Error ? error.message : "Invalid photograph metadata."); }

  const result = await executePhotographPublication(command, session.supabase);
  if ("error" in result) {
    const status = result.reason === "preparation-failed" ? 500 : result.reason === "identity-conflict" ? 409 : 400;
    return responseError(result.error, status);
  }
  if (!("photographId" in result)) return NextResponse.json(result);

  try { invalidatePhotographsAndPalettes(); }
  catch (error) { return responseError(error instanceof Error ? error.message : "The photograph could not be published."); }
  const { photographId } = result;
  // The insert trigger durably queued this photo in its publication transaction.
  // AI failures must never turn confirmed publication into an upload failure.
  try { after(async () => { await processAutomaticPhotographText({ photographId }); }); }
  catch { console.error("photograph_auto_text_kick_failed", { photographId }); }
  return NextResponse.json({ message: "Photograph published.", automaticText: "queued" });
}
