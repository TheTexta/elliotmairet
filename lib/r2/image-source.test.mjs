import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { needsImageDeliverySource, imageDeliverySourceKey, createImageDeliverySource } from './image-source.ts';

test('delivery sources cover Cloudflare pixel, dimension, and byte limits', () => {
  assert.equal(needsImageDeliverySource(10000, 10000, 100_000_000), false);
  assert.equal(needsImageDeliverySource(10001, 10000, 100), true);
  assert.equal(needsImageDeliverySource(12001, 10, 100), true);
  assert.equal(needsImageDeliverySource(10, 10, 100_000_001), true);
  assert.match(imageDeliverySourceKey('uploads/photo #é.jpg'), /^__image-sources\/[a-f0-9]{64}\.webp$/);
  assert.equal(imageDeliverySourceKey('uploads/photo #é.jpg'), imageDeliverySourceKey('uploads/photo #é.jpg'));
  assert.notEqual(imageDeliverySourceKey('photo.jpg'), imageDeliverySourceKey('uploads/photo.jpg'));
});

test('creates a bounded WebP without modifying or enlarging the original', async () => {
  const original = await sharp({ create: { width: 8, height: 4, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const preserved = Buffer.from(original);
  assert.equal(await createImageDeliverySource(original, 8, 4), undefined);
  const delivery = await createImageDeliverySource(original, 14804, 9856);
  const metadata = await sharp(delivery).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 8);
  assert.equal(metadata.height, 4);
  assert.deepEqual(original, preserved);
});

test('limits the longest delivery dimension to 5120 pixels', async () => {
  const original = await sharp({ create: { width: 6000, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
  const delivery = await createImageDeliverySource(original, 14804, 9856);
  const metadata = await sharp(delivery).metadata();
  assert.equal(metadata.width, 5120);
});
