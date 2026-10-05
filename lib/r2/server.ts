import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { imageDeliverySourceKey } from "./image-source";

import { parseR2Configuration } from "./config";
import {
  parseStagedPhotographObjectKey,
  PUBLISHED_OBJECT_CACHE_CONTROL,
} from "./objects";

const signedUploadLifetimeSeconds = 2 * 60 * 60;

let client: S3Client | undefined;

function configuration() {
  return parseR2Configuration(process.env);
}

function r2Client() {
  if (!client) {
    const config = configuration();

    client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return client;
}

function copySource(bucket: string, key: string) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${encodeURIComponent(bucket)}/${encodedKey}`;
}

export async function createStagedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
) {
  const config = configuration();
  const command = new PutObjectCommand({
    Bucket: config.stagingBucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  return getSignedUrl(r2Client(), command, { expiresIn: signedUploadLifetimeSeconds });
}

export async function downloadStagedObject(key: string, maximumBytes: number) {
  const config = configuration();
  const object = await r2Client().send(new GetObjectCommand({
    Bucket: config.stagingBucket,
    Key: key,
  }));

  if (!object.Body) {
    throw new Error("The staged R2 object has no body.");
  }

  if (object.ContentLength === undefined || object.ContentLength > maximumBytes) {
    throw new Error("The staged R2 object is too large.");
  }

  if (!object.ETag) {
    throw new Error("The staged R2 object has no entity tag.");
  }

  return {
    bytes: Buffer.from(await object.Body.transformToByteArray()),
    contentLength: object.ContentLength,
    contentType: object.ContentType,
    etag: object.ETag,
  };
}

function etagMetadataValue(etag: string) {
  return etag.replace(/^"|"$/g, "");
}

async function publishedObjectMatchesSource(
  key: string,
  sourceEtag: string,
  sourceLength: number,
  sourceSha256: string,
  deliveryKey?: string,
) {
  const config = configuration();

  try {
    const object = await r2Client().send(new HeadObjectCommand({
      Bucket: config.publishedBucket,
      Key: key,
    }));

    return (
      object.ContentLength === sourceLength
      && object.Metadata?.sourceetag === etagMetadataValue(sourceEtag)
      && object.Metadata?.sourcesha256 === sourceSha256
      && (!deliveryKey || object.Metadata?.["cf-image-source"] === deliveryKey)
    );
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "$metadata" in error
      && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
    ) {
      return false;
    }

    throw error;
  }
}

export async function copyStagedObjectToPublished(
  stagedKey: string,
  publishedKey: string,
  contentType: string,
  sourceEtag: string,
  sourceLength: number,
  sourceSha256: string,
  deliverySource?: Buffer,
) {
  const config = configuration();
  const deliveryKey = deliverySource ? imageDeliverySourceKey(publishedKey) : undefined;

  if (deliverySource && deliveryKey) {
    await r2Client().send(new PutObjectCommand({
      Bucket: config.publishedBucket, Key: deliveryKey, Body: deliverySource,
      ContentType: "image/webp", CacheControl: PUBLISHED_OBJECT_CACHE_CONTROL,
      Metadata: { sourcesha256: sourceSha256 },
    }));
  }

  if (
    await publishedObjectMatchesSource(
      publishedKey,
      sourceEtag,
      sourceLength,
      sourceSha256,
      deliveryKey,
    )
  ) {
    return;
  }

  try {
    await r2Client().send(new CopyObjectCommand({
      Bucket: config.publishedBucket,
      Key: publishedKey,
      CopySource: copySource(config.stagingBucket, stagedKey),
      CopySourceIfMatch: sourceEtag,
      IfNoneMatch: "*",
      CacheControl: PUBLISHED_OBJECT_CACHE_CONTROL,
      ContentType: contentType,
      Metadata: {
        sourceetag: etagMetadataValue(sourceEtag),
        sourcesha256: sourceSha256,
        ...(deliveryKey ? { "cf-image-source": deliveryKey } : {}),
      },
      MetadataDirective: "REPLACE",
    }));
  } catch (error) {
    if (
      await publishedObjectMatchesSource(
        publishedKey,
        sourceEtag,
        sourceLength,
        sourceSha256,
        deliveryKey,
      )
    ) {
      return;
    }

    throw error;
  }
}

export async function deleteStagedObject(key: string) {
  const config = configuration();

  await r2Client().send(new DeleteObjectCommand({
    Bucket: config.stagingBucket,
    Key: key,
  }));
}

export async function deletePublishedObject(key: string) {
  const config = configuration();

  // The existing cleanup job covers both objects, including retries after partial failure.
  await r2Client().send(new DeleteObjectCommand({
    Bucket: config.publishedBucket,
    Key: imageDeliverySourceKey(key),
  }));

  await r2Client().send(new DeleteObjectCommand({
    Bucket: config.publishedBucket,
    Key: key,
  }));
}

export async function deleteR2ObjectForCleanup(key: string) {
  if (parseStagedPhotographObjectKey(key)) {
    return deleteStagedObject(key);
  }

  return deletePublishedObject(key);
}
