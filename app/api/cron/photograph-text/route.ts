import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processAutomaticPhotographText } from "@/lib/photographs/automatic-text";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Daily rescue is compatible with Hobby cron limits. Normal uploads each kick
  // their own job immediately. Atomic DB claims/budgeting allow bounded overlap.
  const results = await Promise.all(Array.from({ length: 3 }, () => processAutomaticPhotographText()));
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
