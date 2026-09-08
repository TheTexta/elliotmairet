const colourResultPageSize = 36;

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(cursor: string): unknown {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

export function encodeOffsetCursor(offset: number) {
  return encode({ offset });
}

export function decodeOffsetCursor(cursor: string | null) {
  if (!cursor) return 0;
  try {
    const value = decode(cursor) as { offset?: unknown };
    return Number.isSafeInteger(value.offset) && (value.offset as number) >= 0
      ? (value.offset as number)
      : null;
  } catch {
    return null;
  }
}

export function paginateOrderedItems<T>(
  items: T[],
  cursor: string | null,
  pageSize = colourResultPageSize,
) {
  const offset = decodeOffsetCursor(cursor);
  if (offset === null) return null;
  const pageItems = items.slice(offset, offset + pageSize);
  const nextOffset = offset + pageItems.length;
  return {
    items: pageItems,
    nextCursor: nextOffset < items.length ? encodeOffsetCursor(nextOffset) : null,
  };
}
