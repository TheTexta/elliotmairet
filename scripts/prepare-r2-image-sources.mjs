import { createHash } from 'node:crypto';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { parseR2Configuration } from '../lib/r2/config.ts';
import { createImageDeliverySource, needsImageDeliverySource, imageDeliverySourceKey } from '../lib/r2/image-source.ts';
import { PUBLISHED_OBJECT_CACHE_CONTROL } from '../lib/r2/objects.ts';
const apply = process.argv.includes('--copy');
const config = parseR2Configuration(process.env);
const r2 = new S3Client({ region: 'auto', endpoint: config.endpoint, requestChecksumCalculation: 'WHEN_REQUIRED', credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const params = Key => ({ Bucket: config.publishedBucket, Key });
async function head(Key) { try { return await r2.send(new HeadObjectCommand(params(Key))); } catch (e) { if (e.$metadata?.httpStatusCode === 404) return null; throw e; } }
async function bytes(Key) { return Buffer.from(await (await r2.send(new GetObjectCommand(params(Key)))).Body.transformToByteArray()); }
let count = 0;
for (let from = 0; ; from += 500) {
  const { data, error } = await supabase.from('photographs').select('storage_path,image_width,image_height').order('id').range(from, from + 499);
  if (error) throw error;
  for (const photo of data) {
    const key = photo.storage_path; const original = await head(key);
    if (!original) throw new Error('Missing original: ' + key);
    if (!needsImageDeliverySource(photo.image_width, photo.image_height, original.ContentLength)) continue;
    count++;
    if (!apply) { console.log('Delivery source required: ' + key); continue; }
    const deliveryKey = imageDeliverySourceKey(key); const current = await head(deliveryKey);
    if (current && original.Metadata?.['cf-image-source'] === deliveryKey && original.Metadata.sourcesha256 && current.Metadata?.sourcesha256 === original.Metadata.sourcesha256 && current.Metadata?.deliverysha256 && hash(await bytes(deliveryKey)) === current.Metadata.deliverysha256) { console.log('Verified delivery source: ' + key); continue; }
    const source = await bytes(key); const sourceSha = hash(source);
    if (source.length !== original.ContentLength || original.Metadata?.sourcesha256 && sourceSha !== original.Metadata.sourcesha256) throw new Error('Original checksum mismatch: ' + key);
    const delivery = await createImageDeliverySource(source, photo.image_width, photo.image_height); const deliverySha = hash(delivery);
    await r2.send(new PutObjectCommand({ ...params(deliveryKey), Body: delivery, ContentType: 'image/webp', CacheControl: PUBLISHED_OBJECT_CACHE_CONTROL, Metadata: { sourcesha256: sourceSha, deliverysha256: deliverySha } }));
    if (hash(await bytes(deliveryKey)) !== deliverySha) throw new Error('Delivery checksum mismatch: ' + key);
    await r2.send(new CopyObjectCommand({ ...params(key), CopySource: config.publishedBucket + '/' + key.split('/').map(encodeURIComponent).join('/'), CopySourceIfMatch: original.ETag, MetadataDirective: 'REPLACE', Metadata: { ...original.Metadata, sourcesha256: sourceSha, 'cf-image-source': deliveryKey }, ContentType: original.ContentType, CacheControl: original.CacheControl, ...(original.ContentEncoding ? { ContentEncoding: original.ContentEncoding } : {}) }));
    if (hash(await bytes(key)) !== sourceSha) throw new Error('Original changed: ' + key);
    console.log('Prepared and verified delivery source; original unchanged: ' + key);
  }
  if (data.length < 500) break;
}
console.log(`${apply ? 'Verified' : 'Dry run:'} ${count} oversized image delivery sources.`);
