export type GalleryColumnItem<Item> = {
  index: number;
  item: Item;
};

export function distributeGalleryItems<Item>(
  items: readonly Item[],
  columnCount: number,
) {
  return items.reduce<GalleryColumnItem<Item>[][]>(
    (columns, item, index) => {
      columns[index % columnCount].push({ index, item });
      return columns;
    },
    Array.from({ length: columnCount }, () => []),
  );
}