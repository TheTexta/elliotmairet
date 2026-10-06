import { PHOTOGRAPH_UPLOAD_FORMATS, uploadSizeError } from "./config.ts";

export type UploadStage = "preparing" | "transferring" | "publishing";
export type UploadState =
  | { status: "idle" | "ready" | UploadStage }
  | { status: "success" }
  | { status: "error"; message: string; stage?: UploadStage; retryPublication: boolean };

export type UploadMetadata = {
  filename: string;
  capturedAt: string | null;
  title: string | null;
  altText: string | null;
  sortOrder: string | null;
};

type Publication = {
  stagingPath: string;
  storagePath: string;
  contentType: string;
  metadata: UploadMetadata;
};

export const uploadStageLabels: Record<UploadStage, string> = {
  preparing: "Preparing upload",
  transferring: "Transferring image",
  publishing: "Processing photograph",
};

export function isUploading(state: UploadState): state is { status: UploadStage } {
  return state.status === "preparing"
    || state.status === "transferring"
    || state.status === "publishing";
}

async function responseBody(response: Response, fallback: string) {
  let body: Record<string, unknown>;

  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    throw new Error(fallback);
  }

  if (!response.ok) {
    throw new Error(typeof body.error === "string" && body.error.trim() ? body.error : fallback);
  }

  return body;
}

// The controller owns the immediate submission lock and retained publication
// snapshot, independently of React's rendering schedule.
export function createPhotographUpload(
  onState: (state: UploadState) => void,
  request: typeof fetch = (...args) => fetch(...args),
) {
  let state: UploadState = { status: "idle" };
  let publication: Publication | null = null;

  function update(next: UploadState) {
    state = next;
    onState(next);
  }

  function reset(ready = false) {
    if (isUploading(state)) return false;
    publication = null;
    update({ status: ready ? "ready" : "idle" });
    return true;
  }

  async function submit(file: File, metadata: UploadMetadata) {
    if (isUploading(state) || state.status === "success") return false;

    let stage: UploadStage = publication ? "publishing" : "preparing";
    const fallback = () => stage === "publishing"
      ? "Publication could not be confirmed. Retry to check and finish this photograph."
      : "The upload could not be completed. Check your connection and try again.";

    if (!publication) {
      const validationError = uploadSizeError(file.size)
        ?? (Object.hasOwn(PHOTOGRAPH_UPLOAD_FORMATS, file.type) ? null : "Use a JPG, PNG, or WEBP image.");

      if (validationError) {
        update({ status: "error", message: validationError, retryPublication: false });
        return false;
      }
    }

    update({ status: stage });

    try {
      if (!publication) {
        const snapshot = { ...metadata };
        const prepared = await responseBody(await request("/api/admin/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "prepare", contentType: file.type, size: file.size, ...snapshot }),
        }), "The upload could not be prepared. Please try again.");

        if (
          typeof prepared.uploadUrl !== "string" || !prepared.uploadUrl.trim()
          || typeof prepared.stagingPath !== "string" || !prepared.stagingPath.trim()
          || typeof prepared.storagePath !== "string" || !prepared.storagePath.trim()
        ) {
          throw new Error("The upload could not be prepared. Please try again.");
        }

        stage = "transferring";
        update({ status: stage });
        const transferred = await request(prepared.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!transferred.ok) throw new Error("The image could not be uploaded. Please try again.");

        // Retain these paths even if the publication response is lost. The API
        // can replay publication for this photograph without creating another.
        publication = {
          stagingPath: prepared.stagingPath,
          storagePath: prepared.storagePath,
          contentType: file.type,
          metadata: snapshot,
        };
      }

      stage = "publishing";
      update({ status: stage });
      const published = await responseBody(await request("/api/admin/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "publish",
          stagingPath: publication.stagingPath,
          storagePath: publication.storagePath,
          contentType: publication.contentType,
          ...publication.metadata,
        }),
      }), fallback());

      if (typeof published.message !== "string" || !published.message.trim()) throw new Error(fallback());

      update({ status: "success" });
      return true;
    } catch (error) {
      update({
        status: "error",
        stage,
        retryPublication: publication !== null,
        message: error instanceof Error && error.message.trim() && !(error instanceof TypeError)
          ? error.message
          : fallback(),
      });
      return false;
    }
  }

  return { submit, reset, isActive: () => isUploading(state) };
}
