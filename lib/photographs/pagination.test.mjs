import assert from "node:assert/strict";
import test from "node:test";

import {
  paginateOrderedItems,
} from "./pagination.ts";

test("ordered result paging retains order without a hard cap", () => {
  const values = Array.from({ length: 83 }, (_, index) => index);
  const first = paginateOrderedItems(values, null, 36);
  assert.deepEqual(first?.items, values.slice(0, 36));
  const second = paginateOrderedItems(values, first?.nextCursor ?? null, 36);
  const third = paginateOrderedItems(values, second?.nextCursor ?? null, 36);
  assert.deepEqual([...(first?.items ?? []), ...(second?.items ?? []), ...(third?.items ?? [])], values);
  assert.equal(third?.nextCursor, null);
});
