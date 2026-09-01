import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { analyseImage, imageMetadata } from "@/lib/photographs/analyse-image";
import { getAdminSession } from "@/lib/supabase/admin";

const bucket = "elliotmairet";
const maximumFileSize = 200 * 1024 * 1024;
const signedUploadCleanupDelay = 125 * 60 * 1000;
const formats = {
  "image/jpeg": { extension: "jpg", sharpFormat: "jpeg" },
  "image/png": { extension: "png", sharpFormat: "png" },
  "image/webp": { extension: "webp", sharpFormat: "webp" },
} as const;
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

function capturedDate(value: unknown, filename: string) {
  const fromFilename = filename.match(/^(\d{4})(\d{2})(\d{2})-/);
  const result = text(value, 10) ?? (fromFilename ? `${fromFilename[1]}-${fromFilename[2]}-${fromFilename[3]}` : null);

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
    const format = body.contentType ? formats[body.contentType as keyof typeof formats] : undefined;

    if (!format || !Number.isSafeInteger(body.size) || !body.size || body.size < 1 || body.size > maximumFileSize) {
      return responseError("Use a JPG, PNG, or WEBP image no larger than 200 MB.");
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
      .from(bucket)
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
  const format = body.contentType ? formats[body.contentType as keyof typeof formats] : undefined;
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
    const metadata = {
      captured_at: capturedDate(body.capturedAt, originalFilename),
      title: text(body.title, 200),
      alt_text: text(body.altText, 500),
      sort_order: sortOrder(body.sortOrder),
    };
    const { data: storedFile, error: downloadError } = await session.supabase.storage
      .from(bucket)
      .download(storagePath);

    if (downloadError || !storedFile || storedFile.size > maximumFileSize) {
      throw new Error("The uploaded image could not be read.");
    }

    const buffer = Buffer.from(await storedFile.arrayBuffer());
    const dimensions = await imageMetadata(buffer);

    if (dimensions.format !== format.sharpFormat) {
      throw new Error("The uploaded file type does not match its contents.");
    }

    const analysis = await analyseImage(buffer, photographId);
    const { error: publishError } = await session.supabase.rpc("publish_photograph", {
      p_photograph_id: photographId,
      p_storage_path: storagePath,
      p_filename: originalFilename,
      p_image_width: dimensions.width,
      p_image_height: dimensions.height,
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

    revalidatePath("/");
    revalidatePath("/gallery");
    revalidatePath("/admin/photos");
    revalidatePath(`/gallery/${encodeURIComponent(originalFilename)}`);

    return NextResponse.json({ message: "Photograph published." });
  } catch (error) {
    return responseError(
      error instanceof Error ? error.message : "The photograph could not be published.",
    );
  }
}