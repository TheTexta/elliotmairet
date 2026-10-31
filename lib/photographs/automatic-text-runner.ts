import {
  automaticTextConfig, automaticTextConfigHash, buildAutomaticTextRequest,
  countAutomaticTextTokens, prepareAutomaticTextPreview, requestAutomaticText,
} from "./automatic-text-provider.ts";

type Job = { jobId: string; leaseId: string; photographId: string; storagePath: string };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

// Pure orchestration seam for offline provider/failure tests. The production
// wrapper supplies a stateless public-key client plus a narrow worker capability.
export async function runAutomaticTextJob({ rpc, key, secret, photographId, fetcher = fetch, onApplied }: {
  rpc: Rpc; key?: string; secret?: string; photographId?: string; fetcher?: typeof fetch;
  onApplied?: () => void;
}) {
  if (!key?.trim() || !secret || secret.length < 32) return { status: "unconfigured" };
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await rpc(name, { p_secret: secret, ...args });
    if (result.error) throw new Error("Automatic text database operation failed.");
    return result.data;
  };
  const job = await call("claim_photograph_auto_text", { p_photograph_id: photographId ?? null }) as Job | null;
  if (!job) return { status: "idle" };
  const args = { p_job_id: job.jobId, p_lease_id: job.leaseId };
  let preview;
  try { preview = await prepareAutomaticTextPreview(job.storagePath, fetcher); }
  catch {
    await call("fail_photograph_auto_text", { ...args, p_error_code: "preview_unavailable" });
    return { status: "failed" };
  }
  const request = buildAutomaticTextRequest(preview.bytes);
  let inputTokens;
  try { inputTokens = await countAutomaticTextTokens(request, key.trim(), fetcher); }
  catch {
    await call("fail_photograph_auto_text", { ...args, p_error_code: "token_count_failed" });
    return { status: "failed" };
  }
  // Lost reservation response MUST stop before generation, leaving the reserve
  // conservative. Never guess whether a failed RPC committed.
  const reservation = await call("reserve_photograph_auto_text", { ...args, p_input_tokens: inputTokens }) as {
    reserved: boolean; status: string; attemptId?: string;
  };
  if (!reservation.reserved || !reservation.attemptId) return { status: reservation.status };
  const result = {
    ...await requestAutomaticText(request, inputTokens, key.trim(), fetcher),
    previewSha256: preview.sha256, configHash: automaticTextConfigHash,
    promptVersion: automaticTextConfig.promptVersion,
  };
  const finishArgs = { ...args, p_attempt_id: reservation.attemptId, p_result: result };
  // Completion is transactional/idempotent. Retrying this SAME result can recover
  // a lost DB response without another OpenAI call or duplicate billing.
  let finished: { status: string; applied: boolean } | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { finished = await call("finish_photograph_auto_text", finishArgs) as typeof finished; break; }
    catch { if (attempt === 1) throw new Error("Automatic text completion needs reconciliation."); }
  }
  if (finished?.applied) onApplied?.();
  return { status: finished?.status ?? "uncertain" };
}
