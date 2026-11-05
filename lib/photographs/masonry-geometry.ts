export const masonryGap = 0.07;

type Dimensions = { width: number; height: number };
export type MasonryPosition = { column: number; row: number; top: number; bottom: number };

export function photographAspectRatio(photograph: Dimensions) {
  const ratio = photograph.height / photograph.width;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/** All lengths, including gutters, use the same column-width unit. */
export function masonryGeometry(photographs: readonly Dimensions[], columns: readonly number[][]) {
  const positions = new Map<number, MasonryPosition>();
  const contacts: { first: number; second: number; length: number }[] = [];
  const heights = columns.map((items, column) => {
    let top = 0;
    items.forEach((index, row) => {
      const bottom = top + photographAspectRatio(photographs[index]);
      positions.set(index, { column, row, top, bottom });
      if (row) contacts.push({ first: items[row - 1], second: index, length: 1 });
      top = bottom + masonryGap;
    });
    return items.length ? top - masonryGap : 0;
  });
  for (let column = 1; column < columns.length; column++) {
    const left = columns[column - 1], right = columns[column];
    let first = 0, second = 0;
    while (first < left.length && second < right.length) {
      const a = positions.get(left[first])!, b = positions.get(right[second])!;
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlap > 1e-8) contacts.push({ first: left[first], second: right[second], length: overlap });
      if (a.bottom <= b.bottom) first++;
      else second++;
    }
  }
  return { positions, heights, contacts };
}
