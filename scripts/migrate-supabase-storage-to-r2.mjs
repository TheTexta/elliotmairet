import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

import { PHOTOGRAPH_BUCKET } from "../lib/photographs/config.ts";
import { parseR2Configuration } from "../lib/r2/config.ts";
import { PUBLISHED_OBJECT_CACHE_CONTROL } from "../lib/r2/objects.ts";

const pageSize = 500;
const shouldCopy = process.argv.includes("--copy");
const r2Configuration = parseR2Configuration(process.env);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL and publishable key configuration is required.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const r2 = new S3Client({
  region: "auto",
  endpoint: r2Configuration.endpoint,
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: r2Configuration.accessKeyId,
    secretAccessKey: r2Configuration.secretAccessKey,
  },
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function copySource(bucket, key) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${encodeURIComponent(bucket)}/${encodedKey}`;
}

function contentTypeFor(path, downloadedType) {
  if (downloadedType && downloadedType !== "application/octet-stream") {
    return downloadedType;
  }

  const extension = path.split(".").pop()?.toLowerCase();

  return {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  }[extension] ?? "application/octet-stream";
}

async function catalogue() {
  const photographs = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("photographs")
      .select("id, storage_path")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    photographs.push(...data);

    if (data.length < pageSize) return photographs;
  }
}

async function downloadSupabaseObject(key) {
  const { data, error } = await supabase.storage
    .from(PHOTOGRAPH_BUCKET)
    .download(key);

  if (error || !data) {
    throw error ?? new Error(`Supabase returned no body for ${key}.`);
  }

  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: contentTypeFor(key, data.type),
  };
}

async function existingR2Object(key) {
  try {
    return await r2.send(new HeadObjectCommand({
      Bucket: r2Configuration.publishedBucket,
      Key: key,
    }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function downloadR2Object(key) {
  const object = await r2.send(new GetObjectCommand({
    Bucket: r2Configuration.publishedBucket,
    Key: key,
  }));

  if (!object.Body) throw new Error(`R2 returned no body for ${key}.`);
  return Buffer.from(await object.Body.transformToByteArray());
}

const photographs = await catalogue();

if (!shouldCopy) {
  console.log(
    `Dry run: ${photographs.length} catalogue objects would be copied and verified. `
      + "Run with --copy to write to R2.",
  );
  process.exit(0);
}

let copied = 0;
let reconciled = 0;
let skipped = 0;
const queue = [...photographs];
const queuedIds = new Set(queue.map(({ id }) => id));

for (let index = 0; ; index += 1) {
  if (index === queue.length) {
    const latestCatalogue = await catalogue();
    const additions = latestCatalogue.filter(({ id }) => !queuedIds.has(id));

    if (additions.length === 0) break;

    for (const photograph of additions) queuedIds.add(photograph.id);
    queue.push(...additions);
  }

  const photograph = queue[index];
  const key = photograph.storage_path;
  const existing = await existingR2Object(key);
  const existingHash = existing?.Metadata?.sourcesha256;

  if (
    existing?.ContentLength !== undefined
    && existingHash
  ) {
    const existingBytes = await downloadR2Object(key);

    if (
      existingBytes.length !== existing.ContentLength
      || sha256(existingBytes) !== existingHash
    ) {
      throw new Error(`R2 checksum mismatch for ${key}.`);
    }

    if (existing.CacheControl !== PUBLISHED_OBJECT_CACHE_CONTROL) {
      await r2.send(new CopyObjectCommand({
        Bucket: r2Configuration.publishedBucket,
        Key: key,
        CopySource: copySource(r2Configuration.publishedBucket, key),
        CopySourceIfMatch: existing.ETag,
        CacheControl: PUBLISHED_OBJECT_CACHE_CONTROL,
        ContentType: contentTypeFor(key, existing.ContentType),
        Metadata: existing.Metadata,
        MetadataDirective: "REPLACE",
      }));

      const reconciledObject = await existingR2Object(key);
      const reconciledBytes = await downloadR2Object(key);

      if (
        reconciledObject?.CacheControl !== PUBLISHED_OBJECT_CACHE_CONTROL
        || reconciledObject.ContentLength !== existingBytes.length
        || reconciledObject.Metadata?.sourcesha256 !== existingHash
        || reconciledBytes.length !== existingBytes.length
        || sha256(reconciledBytes) !== existingHash
      ) {
        throw new Error(`R2 metadata reconciliation failed for ${key}.`);
      }

      reconciled += 1;
      console.log(`[${index + 1}/${queue.length}] reconciled and verified ${key}`);
    } else {
      skipped += 1;
      console.log(`[${index + 1}/${queue.length}] verified ${key}`);
    }

    continue;
  }

  const source = await downloadSupabaseObject(key);
  const sourceHash = sha256(source.bytes);

  if (existing) {
    const existingBytes = await downloadR2Object(key);

    if (
      existingBytes.length !== source.bytes.length
      || sha256(existingBytes) !== sourceHash
    ) {
      throw new Error(`Unverified R2 object conflicts with the Supabase source for ${key}.`);
    }

    await r2.send(new CopyObjectCommand({
      Bucket: r2Configuration.publishedBucket,
      Key: key,
      CopySource: copySource(r2Configuration.publishedBucket, key),
      CopySourceIfMatch: existing.ETag,
      CacheControl: PUBLISHED_OBJECT_CACHE_CONTROL,
      ContentType: source.contentType,
      Metadata: { ...existing.Metadata, sourcesha256: sourceHash },
      MetadataDirective: "REPLACE",
    }));

    const reconciledObject = await existingR2Object(key);
    const reconciledBytes = await downloadR2Object(key);

    if (
      reconciledObject?.CacheControl !== PUBLISHED_OBJECT_CACHE_CONTROL
      || reconciledObject.ContentLength !== source.bytes.length
      || reconciledObject.ContentType !== source.contentType
      || reconciledObject.Metadata?.sourcesha256 !== sourceHash
      || reconciledBytes.length !== source.bytes.length
      || sha256(reconciledBytes) !== sourceHash
    ) {
      throw new Error(`R2 metadata reconciliation failed for ${key}.`);
    }

    reconciled += 1;
    console.log(`[${index + 1}/${queue.length}] reconciled and verified ${key}`);
    continue;
  }

  await r2.send(new PutObjectCommand({
    Bucket: r2Configuration.publishedBucket,
    Key: key,
    Body: source.bytes,
    CacheControl: PUBLISHED_OBJECT_CACHE_CONTROL,
    ContentType: source.contentType,
    IfNoneMatch: "*",
    Metadata: { sourcesha256: sourceHash },
  }));

  const copiedObject = await existingR2Object(key);
  const copiedBytes = await downloadR2Object(key);

  if (
    copiedObject?.CacheControl !== PUBLISHED_OBJECT_CACHE_CONTROL
    || copiedObject.ContentLength !== source.bytes.length
    || copiedObject.ContentType !== source.contentType
    || copiedObject.Metadata?.sourcesha256 !== sourceHash
    || copiedBytes.length !== source.bytes.length
    || sha256(copiedBytes) !== sourceHash
  ) {
    throw new Error(`R2 verification failed for ${key}.`);
  }

  copied += 1;
  console.log(`[${index + 1}/${queue.length}] copied and verified ${key}`);
}

console.log(
  `Migration complete: ${copied} copied, ${reconciled} metadata reconciled, `
    + `${skipped} already verified, ${queue.length} total.`,
);