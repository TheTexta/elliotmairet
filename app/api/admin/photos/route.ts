import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { invalidatePhotographsAndPalettes } from "@/lib/cache-invalidation";
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
  publicObjectUrl,
  stagedPhotographObjectKey,
} from "@/lib/r2/objects";
import {
  copyStagedObjectToPublished,
  createStagedUploadUrl,
  deleteStagedObject,
  downloadStagedObject,
} from "@/lib/r2/server";
import { getAdminSession } from "@/lib/supabase/admin";

const signedUploadCleanupDelay = 125 * 60 * 1000;

type PrepareRequest = {
  phase: "prepare";
  contentType?: string;
  size?: number;
  filename?: string;
  capturedAt?: string;
  title?: string;
  altText?: string;
  sortOrder?: string;
};

type PublishRequest = {
  phase: "publish";
  stagingPath?: string;
  storagePath?: string;
  filename?: string;
  contentType?: string;
  capturedAt?: string;
  title?: string;
  altText?: string;
  sortOrder?: string;
};

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

  if (!session) {
    return responseError("Administrator access is required.", 401);
  }

  let body: PrepareRequest | PublishRequest;

  try {
    body = await request.json();
  } catch {
    return responseError("Invalid request.");
  }

  if (!r2PublicDeliveryConfigured()) {
    return responseError("Photograph uploads are unavailable while storage is being migrated.", 503);
  }

  if (body.phase === "prepare") {
    const sizeError = uploadSizeError(body.size);

    if (sizeError) {
      return responseError(sizeError);
    }

    const format = body.contentType
      ? PHOTOGRAPH_UPLOAD_FORMATS[body.contentType as keyof typeof PHOTOGRAPH_UPLOAD_FORMATS]
      : undefined;

    if (!format) {
      return responseError("Use a JPG, PNG, or WEBP image.");
    }

    try {
      const uploadFilename = filename(body.filename);
      capturedDate(body.capturedAt, uploadFilename);
      text(body.title, 200);
      text(body.altText, 500);
      sortOrder(body.sortOrder);
    } catch (error) {
      return responseError(error instanceof Error ? error.message : "Invalid photograph metadata.");
    }

    const photographId = randomUUID();
    const storagePath = photographObjectKey(photographId, format.extension);
    const stagingPath = stagedPhotographObjectKey(photographId, format.extension);
    const { error: trackingError } = await session.supabase.rpc("record_storage_cleanup_job", {
      job_photograph_id: photographId,
      job_storage_path: stagingPath,
      job_operation: "upload",
      job_error_message: "Upload awaiting publication.",
      job_not_before: new Date(Date.now() + signedUploadCleanupDelay).toISOString(),
      job_storage_provider: "r2",
    });

    if (trackingError) {
      return responseError("The upload could not be prepared.", 500);
    }

    let uploadUrl: string;

    try {
      uploadUrl = await createStagedUploadUrl(stagingPath, body.contentType!, body.size!);
    } catch (error) {
      console.error("admin_r2_upload_url_failed", {
        photographId,
        message: error instanceof Error ? error.message : "Unknown R2 error.",
      });
      await session.supabase.rpc("cancel_storage_upload_reservation", {
        job_photograph_id: photographId,
        job_storage_path: stagingPath,
      });
      return responseError("The upload could not be prepared.", 500);
    }

    return NextResponse.json({ stagingPath, storagePath, uploadUrl });
  }

  if (body.phase !== "publish") {
    return responseError("Invalid upload phase.");
  }

  const stagedObject = parseStagedPhotographObjectKey(body.stagingPath);
  const publishedObject = parsePhotographObjectKey(body.storagePath);
  const format = body.contentType
    ? PHOTOGRAPH_UPLOAD_FORMATS[body.contentType as keyof typeof PHOTOGRAPH_UPLOAD_FORMATS]
    : undefined;
  let originalFilename: string;

  try {
    originalFilename = filename(body.filename);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Invalid image filename.");
  }

  if (
    !stagedObject
    || !publishedObject
    || !format
    || stagedObject.photographId !== publishedObject.photographId
    || stagedObject.extension !== format.extension
    || publishedObject.extension !== format.extension
  ) {
    return responseError("Invalid uploaded photograph.");
  }

  const photographId = publishedObject.photographId;
  const stagingPath = stagedObject.key;
  const storagePath = publishedObject.key;

  try {
    const { data: existingPhotograph, error: existingPhotographError } = await session.supabase
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
        return responseError("The photograph identifier is already in use.", 409);
      }

      try {
        await deleteStagedObject(stagingPath);
        await session.supabase.rpc("cancel_storage_upload_reservation", {
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

      invalidatePhotographsAndPalettes();
      return NextResponse.json({ message: "Photograph published." });
    }

    const storedObject = await downloadStagedObject(stagingPath, MAXIMUM_UPLOAD_BYTES);
    const storedSizeError = uploadSizeError(storedObject.bytes.byteLength);

    if (storedSizeError) {
      throw new Error(storedSizeError);
    }

    if (storedObject.contentType !== body.contentType) {
      throw new Error("The uploaded file type does not match the prepared upload.");
    }

    const buffer = storedObject.bytes;
    const image = await imageMetadata(buffer);

    if (image.format !== format.sharpFormat) {
      throw new Error("The uploaded file type does not match its contents.");
    }

    const metadata = {
      captured_at: capturedDate(body.capturedAt, originalFilename, image.capturedAt),
      title: text(body.title, 200),
      alt_text: text(body.altText, 500),
      sort_order: sortOrder(body.sortOrder),
    };
    const analysis = await analyseImage(buffer, photographId);
    const oklab = analysis.oklab_features;
    const { error: publicReservationError } = await session.supabase.rpc(
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
      body.contentType!,
      storedObject.etag,
      storedObject.contentLength,
      createHash("sha256").update(buffer).digest("hex"),
      await createImageDeliverySource(buffer, image.width, image.height),
    );

    const { error: publishError } = await session.supabase.rpc("publish_photograph_with_oklab", {
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
      const { error: reservationError } = await session.supabase.rpc(
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

    invalidatePhotographsAndPalettes();

    return NextResponse.json({ message: "Photograph published." });
  } catch (error) {
    return responseError(
      error instanceof Error ? error.message : "The photograph could not be published.",
    );
  }
}
