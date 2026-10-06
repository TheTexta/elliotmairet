export type UploadDate = {
  value: string;
  source: "metadata" | "filename" | "modified";
};

function calendarDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T]|$)/);
  if (!match || Number(match[1]) === 0) return null;
  const result = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === result ? result : null;
}

// exifr supports JPEG and PNG directly. For WEBP, skip the image chunks and
// pass only its EXIF/TIFF payload to the same parser.
async function webpExif(file: File) {
  const header = new DataView(await file.slice(0, 12).arrayBuffer());
  if (header.byteLength < 12 || header.getUint32(0) !== 0x52494646 || header.getUint32(8) !== 0x57454250) return null;

  const end = Math.min(file.size, header.getUint32(4, true) + 8);
  for (let offset = 12, chunks = 0; offset + 8 <= end && chunks < 256; chunks++) {
    const chunk = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    const length = chunk.getUint32(4, true);
    if (offset + 8 + length > end) return null;

    if (chunk.getUint32(0) === 0x45584946) {
      // Bound metadata allocation even for malformed or hostile local files.
      if (length > 1024 * 1024) return null;
      const bytes = new Uint8Array(await file.slice(offset + 8, offset + 8 + length).arrayBuffer());
      return bytes[0] === 0x45 && bytes[1] === 0x78 && bytes[2] === 0x69 && bytes[3] === 0x66
        ? bytes.subarray(6)
        : bytes;
    }

    offset += 8 + length + (length % 2);
  }
  return null;
}

export async function detectUploadDate(file: File): Promise<UploadDate | null> {
  try {
    const { default: exifr } = await import("exifr");
    const input = file.type === "image/webp" ? await webpExif(file) : file;
    const metadata: Record<string, unknown> | undefined = input ? await exifr.parse(input, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
      // Keep the camera's calendar date, without timezone conversion.
      reviveValues: false,
    }) : undefined;

    for (const value of [metadata?.DateTimeOriginal, metadata?.CreateDate, metadata?.ModifyDate]) {
      const date = calendarDate(value);
      if (date) return { value: date, source: "metadata" };
    }
  } catch {
    // Missing, unreadable or malformed metadata must not prevent uploading.
  }

  const filename = file.name.split(/[\\/]/).pop() ?? file.name;
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})-/);
  const fromFilename = match ? calendarDate(`${match[1]}-${match[2]}-${match[3]}`) : null;
  if (fromFilename) return { value: fromFilename, source: "filename" };

  // Browsers expose lastModified, not the filesystem's creation timestamp.
  const modified = new Date(file.lastModified);
  if (Number.isNaN(modified.valueOf())) return null;
  const date = calendarDate(`${String(modified.getFullYear()).padStart(4, "0")}-${String(modified.getMonth() + 1).padStart(2, "0")}-${String(modified.getDate()).padStart(2, "0")}`);
  return date ? { value: date, source: "modified" } : null;
}
