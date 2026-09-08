import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { invalidatePhotographsAndPalettes } from "@/lib/cache-invalidation";
import { analyseImage, imageMetadata } from "@/lib/photographs/analyse-image";
import {
  PHOTOGRAPH_BUCKET,
  PHOTOGRAPH_UPLOAD_FORMATS,
  uploadSizeError,
} from "@/lib/photographs/config";
import { getAdminSession } from "@/lib/supabase/admin";

const signedUploadCleanupDelay = 125 * 60 * 1000;
const uploadPathPattern = /^uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

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
    const storagePath = `uploads/${photographId}.${format.extension}`;
    const { error: trackingError } = await session.supabase.rpc("record_storage_cleanup_job", {
      job_photograph_id: photographId,
      job_storage_path: storagePath,
      job_operation: "upload",
      job_error_message: "Upload awaiting publication.",
      job_not_before: new Date(Date.now() + signedUploadCleanupDelay).toISOString(),
    });

    if (trackingError) {
      return responseError("The upload could not be prepared.", 500);
    }

    const { data, error } = await session.supabase.storage
      .from(PHOTOGRAPH_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error) {
      await session.supabase.rpc("cancel_storage_upload_reservation", {
        job_photograph_id: photographId,
        job_storage_path: storagePath,
      });
      return responseError("The upload could not be prepared.", 500);
    }

    const { error: refreshError } = await session.supabase.rpc("record_storage_cleanup_job", {
      job_photograph_id: photographId,
      job_storage_path: storagePath,
      job_operation: "upload",
      job_error_message: "Upload awaiting publication.",
      job_not_before: new Date(Date.now() + signedUploadCleanupDelay).toISOString(),
    });

    if (refreshError) {
      return responseError("The upload could not be prepared.", 500);
    }

    return NextResponse.json({ storagePath, token: data.token });
  }

  if (body.phase !== "publish") {
    return responseError("Invalid upload phase.");
  }

  const pathMatch = body.storagePath?.match(uploadPathPattern);
  const format = body.contentType
    ? PHOTOGRAPH_UPLOAD_FORMATS[body.contentType as keyof typeof PHOTOGRAPH_UPLOAD_FORMATS]
    : undefined;
  let originalFilename: string;

  try {
    originalFilename = filename(body.filename);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Invalid image filename.");
  }

  if (!pathMatch || !format || pathMatch[2].toLowerCase() !== format.extension) {
    return responseError("Invalid uploaded photograph.");
  }

  const photographId = pathMatch[1];
  const storagePath = pathMatch[0];

  try {
    const { data: storedFile, error: downloadError } = await session.supabase.storage
      .from(PHOTOGRAPH_BUCKET)
      .download(storagePath);

    if (downloadError || !storedFile) {
      throw new Error("The uploaded image could not be read.");
    }

    const storedSizeError = uploadSizeError(storedFile.size);

    if (storedSizeError) {
      throw new Error(storedSizeError);
    }

    const buffer = Buffer.from(await storedFile.arrayBuffer());
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
    const { error: publishError } = await session.supabase.rpc("publish_photograph", {
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
    });

    if (publishError) {
      console.error("admin_photograph_publish_failed", {
        photographId,
        message: publishError.message,
      });
      throw new Error("The photograph could not be added. Its filename may already exist.");
    }

    invalidatePhotographsAndPalettes();

    return NextResponse.json({ message: "Photograph published." });
  } catch (error) {
    return responseError(
      error instanceof Error ? error.message : "The photograph could not be published.",
    );
  }
}
