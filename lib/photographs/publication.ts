import { createHash, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { analyseImage, imageMetadata } from "@/lib/photographs/analyse-image";
import { createImageDeliverySource } from "@/lib/r2/image-source";
import {
  MAXIMUM_UPLOAD_BYTES,
  PHOTOGRAPH_UPLOAD_FORMATS,
  uploadSizeError,
} from "@/lib/photographs/config";
import {
  parsePhotographObjectKey,
  parseStagedPhotographObjectKey,
  photographObjectKey,
  stagedPhotographObjectKey,
} from "@/lib/r2/objects";
import {
  copyStagedObjectToPublished,
  createStagedUploadUrl,
  deleteStagedObject,
  downloadStagedObject,
} from "@/lib/r2/server";

const signedUploadCleanupDelay = 125 * 60 * 1000;

type MetadataInput = {
  capturedAt: unknown;
  title: unknown;
  altText: unknown;
  sortOrder: unknown;
};

type PrepareCommand = {
  phase: "prepare";
  contentType: string;
  size: number;
  format: (typeof PHOTOGRAPH_UPLOAD_FORMATS)[keyof typeof PHOTOGRAPH_UPLOAD_FORMATS];
};

type PublishCommand = {
  phase: "publish";
  photographId: string;
  stagingPath: string;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  format: PrepareCommand["format"];
  // Decode these after replay detection and image inspection, as before:
  // accepted replays do not reinterpret metadata, and EXIF supplies the date.
  metadata: MetadataInput;
};

type PublicationResult =
  | { error: string; reason: "preparation-failed" | "identity-conflict" | "publication-failed" }
  | { stagingPath: string; storagePath: string; uploadUrl: string }
  | { photographId: string };

function text(value: unknown, maximumLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.trim().length > maximumLength) {
    throw new Error("Invalid photograph metadata.");
  }

  return value.trim();
}

function filename(value: unknown) {
  const result = text(value, 240);

  if (!result || /[\u0000-\u001f/\\]/.test(result)) {
    throw new Error("Invalid image filename.");
  }

  return result;
}

function capturedDate(value: unknown, filename: string, metadataDate?: string | null) {
  const fromFilename = filename.match(/^(\d{4})(\d{2})(\d{2})-/);
  const result = text(value, 10)
    ?? metadataDate
    ?? (fromFilename ? `${fromFilename[1]}-${fromFilename[2]}-${fromFilename[3]}` : null);

  if (result) {
    const parsed = new Date(`${result}T00:00:00Z`);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) {
      throw new Error("Captured date must be a valid date using YYYY-MM-DD.");
    }
  }

  return result;
}

function sortOrder(value: unknown) {
  const result = text(value, 12);

  if (result === null) {
    return null;
  }

  const parsed = Number(result);

  if (!Number.isInteger(parsed) || parsed < -2_147_483_648 || parsed > 2_147_483_647) {
    throw new Error("Sort order must be a whole number.");
  }

  return parsed;
}

function failure(message: string, reason: "preparation-failed" | "identity-conflict" | "publication-failed" = "publication-failed") {
  return { error: message, reason };
}

export function decodePublicationCommand(input: unknown): PrepareCommand | PublishCommand {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const format = Object.hasOwn(PHOTOGRAPH_UPLOAD_FORMATS, contentType)
    ? PHOTOGRAPH_UPLOAD_FORMATS[contentType as keyof typeof PHOTOGRAPH_UPLOAD_FORMATS]
    : undefined;
  if (body.phase === "prepare") {
    const sizeError = uploadSizeError(body.size);

    if (sizeError) {
      throw new Error(sizeError);
    }

    if (!format) {
      throw new Error("Use a JPG, PNG, or WEBP image.");
    }

    const uploadFilename = filename(body.filename);
    capturedDate(body.capturedAt, uploadFilename);
    text(body.title, 200);
    text(body.altText, 500);
    sortOrder(body.sortOrder);
    return { phase: "prepare", format, contentType, size: body.size as number };
  }

  if (body.phase !== "publish") throw new Error("Invalid upload phase.");
  const stagedObject = parseStagedPhotographObjectKey(body.stagingPath);
  const publishedObject = parsePhotographObjectKey(body.storagePath);
  const originalFilename = filename(body.filename);
  if (!stagedObject || !publishedObject || !format
    || stagedObject.photographId !== publishedObject.photographId
    || stagedObject.extension !== format.extension || publishedObject.extension !== format.extension) {
    throw new Error("Invalid uploaded photograph.");
  }
  return {
    phase: "publish", photographId: publishedObject.photographId,
    stagingPath: stagedObject.key, storagePath: publishedObject.key,
    originalFilename, format, contentType,
    metadata: { capturedAt: body.capturedAt, title: body.title, altText: body.altText, sortOrder: body.sortOrder },
  };
}

// Uses the authenticated Supabase client and concrete R2 adapters; tests replace
// those existing adapters rather than introducing another repository layer.
export async function executePhotographPublication(command: PrepareCommand | PublishCommand, supabase: SupabaseClient): Promise<PublicationResult> {
  if (command.phase === "prepare") {
    const { format } = command;
    const photographId = randomUUID();
    const storagePath = photographObjectKey(photographId, format.extension);
    const stagingPath = stagedPhotographObjectKey(photographId, format.extension);
    const { error: trackingError } = await supabase.rpc("record_storage_cleanup_job", {
      job_photograph_id: photographId,
      job_storage_path: stagingPath,
      job_operation: "upload",
      job_error_message: "Upload awaiting publication.",
      job_not_before: new Date(Date.now() + signedUploadCleanupDelay).toISOString(),
      job_storage_provider: "r2",
    });

    if (trackingError) {
      return failure("The upload could not be prepared.", "preparation-failed");
    }

    let uploadUrl: string;

    try {
      uploadUrl = await createStagedUploadUrl(stagingPath, command.contentType, command.size);
    } catch (error) {
      console.error("admin_r2_upload_url_failed", {
        photographId,
        message: error instanceof Error ? error.message : "Unknown R2 error.",
      });
      await supabase.rpc("cancel_storage_upload_reservation", {
        job_photograph_id: photographId,
        job_storage_path: stagingPath,
      });
      return failure("The upload could not be prepared.", "preparation-failed");
    }

    return { stagingPath, storagePath, uploadUrl };
  }

  const { photographId, stagingPath, storagePath, originalFilename, format } = command;

  try {
    const { data: existingPhotograph, error: existingPhotographError } = await supabase
      .from("photographs")
      .select("storage_path, filename")
      .eq("id", photographId)
      .maybeSingle();

    if (existingPhotographError) {
      throw new Error("The photograph catalogue could not be checked.");
    }

    if (existingPhotograph) {
      if (
        existingPhotograph.storage_path !== storagePath
        || existingPhotograph.filename !== originalFilename
      ) {
        return failure("The photograph identifier is already in use.", "identity-conflict");
      }

      try {
        await deleteStagedObject(stagingPath);
        await supabase.rpc("cancel_storage_upload_reservation", {
          job_photograph_id: photographId,
          job_storage_path: stagingPath,
        });
      } catch (error) {
        console.error("admin_r2_replayed_upload_cleanup_failed", {
          photographId,
          stagingPath,
          message: error instanceof Error ? error.message : "Unknown R2 error.",
        });
      }

      return { photographId };
    }

    const storedObject = await downloadStagedObject(stagingPath, MAXIMUM_UPLOAD_BYTES);
    const storedSizeError = uploadSizeError(storedObject.bytes.byteLength);

    if (storedSizeError) {
      throw new Error(storedSizeError);
    }

    if (storedObject.contentType !== command.contentType) {
      throw new Error("The uploaded file type does not match the prepared upload.");
    }

    const buffer = storedObject.bytes;
    const image = await imageMetadata(buffer);

    if (image.format !== format.sharpFormat) {
      throw new Error("The uploaded file type does not match its contents.");
    }

    const metadata = {
      captured_at: capturedDate(command.metadata.capturedAt, originalFilename, image.capturedAt),
      title: text(command.metadata.title, 200),
      alt_text: text(command.metadata.altText, 500),
      sort_order: sortOrder(command.metadata.sortOrder),
    };
    const analysis = await analyseImage(buffer, photographId);
    const oklab = analysis.oklab_features;
    const { error: publicReservationError } = await supabase.rpc(
      "record_storage_cleanup_job",
      {
        job_photograph_id: photographId,
        job_storage_path: storagePath,
        job_operation: "upload",
        job_error_message: "Published object awaiting catalogue publication.",
        job_not_before: new Date(Date.now() + signedUploadCleanupDelay).toISOString(),
        job_storage_provider: "r2",
      },
    );

    if (publicReservationError) {
      throw new Error("The photograph could not be prepared for publication.");
    }

    await copyStagedObjectToPublished(
      stagingPath,
      storagePath,
      command.contentType,
      storedObject.etag,
      storedObject.contentLength,
      createHash("sha256").update(buffer).digest("hex"),
      await createImageDeliverySource(buffer, image.width, image.height),
    );

    const { error: publishError } = await supabase.rpc("publish_photograph_with_oklab", {
      p_photograph_id: photographId,
      p_storage_path: storagePath,
      p_filename: originalFilename,
      p_image_width: image.width,
      p_image_height: image.height,
      p_captured_at: metadata.captured_at,
      p_title: metadata.title,
      p_alt_text: metadata.alt_text,
      p_sort_order: metadata.sort_order,
      p_algorithm: analysis.algorithm,
      p_algorithm_iterations: analysis.algorithm_iterations,
      p_sample_longest_side: analysis.sample_longest_side,
      p_palette_size: analysis.palette_size,
      p_analyzed_at: analysis.analyzed_at,
      p_colours: analysis.colours,
      p_oklab_algorithm: oklab.algorithm,
      p_oklab_algorithm_iterations: oklab.algorithm_iterations,
      p_oklab_sample_longest_side: oklab.sample_longest_side,
      p_oklab_feature_count: oklab.feature_count,
      p_oklab_analyzed_at: oklab.analyzed_at,
      p_oklab_features: oklab.features,
    });

    if (publishError) {
      console.error("admin_photograph_publish_failed", {
        photographId,
        message: publishError.message,
      });
      throw new Error("The photograph could not be added. Its filename may already exist.");
    }

    try {
      await deleteStagedObject(stagingPath);
      const { error: reservationError } = await supabase.rpc(
        "cancel_storage_upload_reservation",
        {
          job_photograph_id: photographId,
          job_storage_path: stagingPath,
        },
      );

      if (reservationError) {
        console.error("admin_r2_staging_reservation_cleanup_failed", {
          photographId,
          stagingPath,
          message: reservationError.message,
        });
      }
    } catch (error) {
      console.error("admin_r2_staging_cleanup_failed", {
        photographId,
        stagingPath,
        message: error instanceof Error ? error.message : "Unknown R2 error.",
      });
    }

    return { photographId };
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "The photograph could not be published.",
    );
  }
}
