import assert from "node:assert/strict";
import test, { after } from "node:test";
import sharp from "sharp";

import { detectUploadDate } from "./upload-date.ts";

// exifr's browser Blob reader uses FileReader, which Node does not provide.
const originalFileReader = globalThis.FileReader;
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    }, (error) => this.onerror?.(error));
  }
};
after(() => {
  if (originalFileReader) globalThis.FileReader = originalFileReader;
  else delete globalThis.FileReader;
});

const modified = new Date(2026, 9, 5, 12).valueOf();
const image = () => sharp({ create: { width: 1, height: 1, channels: 3, background: "#000000" } });

for (const [format, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
  test(`${format} selection prefers original capture metadata over creation, modification, and filename dates`, async () => {
    const bytes = await image().withExif({
      IFD0: { DateTime: "2025:05:06 12:00:00" },
      IFD2: { DateTimeOriginal: "2023:12:31 23:59:00", DateTimeDigitized: "2024:01:01 00:00:00" },
    })[format]().toBuffer();
    const file = new File([bytes], `20260102-photo.${format}`, { type, lastModified: modified });
    assert.deepEqual(await detectUploadDate(file), { value: "2023-12-31", source: "metadata" });
  });
}

test("creation metadata is used when an original capture date is absent", async () => {
  const bytes = await image().withExif({
    IFD0: { DateTime: "2025:05:06 12:00:00" }, IFD2: { DateTimeDigitized: "2024:02:29 00:00:00" },
  }).jpeg().toBuffer();
  assert.deepEqual(await detectUploadDate(new File([bytes], "photo.jpg", { type: "image/jpeg", lastModified: modified })), {
    value: "2024-02-29", source: "metadata",
  });
});

test("image timestamp metadata is used when capture and creation dates are absent", async () => {
  const bytes = await image().withExif({ IFD0: { DateTime: "2025:05:06 12:00:00" } }).jpeg().toBuffer();
  assert.deepEqual(await detectUploadDate(new File([bytes], "photo.jpg", { type: "image/jpeg", lastModified: modified })), {
    value: "2025-05-06", source: "metadata",
  });
});

test("a valid filename date takes precedence over the file modification date when metadata is absent", async () => {
  const bytes = await image().jpeg().toBuffer();
  assert.deepEqual(await detectUploadDate(new File([bytes], "20240229-photo.jpg", { type: "image/jpeg", lastModified: modified })), {
    value: "2024-02-29", source: "filename",
  });
});

test("invalid EXIF dates do not normalize into the wrong calendar day", async () => {
  const bytes = await image().withExif({ IFD2: { DateTimeOriginal: "2025:02:30 00:00:00" } }).jpeg().toBuffer();
  assert.deepEqual(await detectUploadDate(new File([bytes], "20240102-photo.jpg", { type: "image/jpeg", lastModified: modified })), {
    value: "2024-01-02", source: "filename",
  });
});

test("missing or malformed metadata and invalid filenames fall back to the local file modification date", async () => {
  for (const name of ["photo.jpg", "20250230-photo.jpg", "00000101-photo.jpg"]) {
    assert.deepEqual(await detectUploadDate(new File(["malformed"], name, { type: "image/jpeg", lastModified: modified })), {
      value: "2026-10-05", source: "modified",
    });
  }
});

test("malformed WEBP containers fall back without blocking selection", async () => {
  const invalid = Buffer.alloc(20);
  invalid.write("RIFF", 0);
  invalid.writeUInt32LE(12, 4);
  invalid.write("WEBP", 8);
  invalid.write("EXIF", 12);
  invalid.writeUInt32LE(0xffffffff, 16);
  assert.deepEqual(await detectUploadDate(new File([invalid], "photo.webp", { type: "image/webp", lastModified: modified })), {
    value: "2026-10-05", source: "modified",
  });
});

test("filesystem modification dates retain their local day rather than their UTC day", async () => {
  const lastModified = new Date(2024, 4, 6, 23, 59).valueOf();
  assert.deepEqual(await detectUploadDate(new File([], "photo.png", { type: "image/png", lastModified })), {
    value: "2024-05-06", source: "modified",
  });
});
