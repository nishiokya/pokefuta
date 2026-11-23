type CatalogKey = { id: number; prefecture: string | null; municipality: string | null };

const compareNullableText = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};

/**
 * DB の `order by prefecture, municipality, id`（NULL は最後）と同じ並びにする。
 * 図鑑のスナップショットから作ったカタログを、Supabase から読んでいたときと同じ順で返すため。
 */
export function sortCatalog<T extends CatalogKey>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      compareNullableText(a.prefecture, b.prefecture) ||
      compareNullableText(a.municipality, b.municipality) ||
      a.id - b.id
  );
}
