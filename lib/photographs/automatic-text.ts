import "server-only";

import { revalidatePath } from "next/cache";
import { invalidatePhotographs } from "@/lib/cache-invalidation";
import { createPublicClient } from "@/lib/supabase/public";
import { runAutomaticTextJob } from "./automatic-text-runner";

export async function processAutomaticPhotographText({ photographId }: { photographId?: string } = {}) {
  try {
    return await runAutomaticTextJob({
      rpc: (name, args) => createPublicClient().rpc(name, args),
      key: process.env.OPENAI_API_KEY,
      secret: process.env.PHOTOGRAPH_TEXT_WORKER_SECRET,
      photographId,
      onApplied: () => {
        invalidatePhotographs();
        revalidatePath("/admin/photos");
      },
    });
  } catch {
    // No provider messages, URLs, payloads or secrets in platform logs. Durable
    // leases/reservations remain for scheduled recovery or operator review.
    console.error("photograph_auto_text_worker_failed", { photographId: photographId ?? null });
    return { status: "worker_error" };
  }
}
