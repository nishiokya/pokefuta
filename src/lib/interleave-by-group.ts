/**
 * 並び順を保ったまま、グループ（投稿者など）を1枚ずつ順番に回して並べ直す。
 *
 * 1巡目は各グループの先頭（元の並びでいちばん前のもの）を、グループが最初に出てきた順に並べる。
 * 2巡目は各グループの2枚目、…。写真の多い人が上を埋めないようにする（/photos/plush）。
 * key が null のもの（投稿者が分からない）は、それぞれ別のグループとして扱う。
 */
export function interleaveByGroup<T>(items: readonly T[], key: (item: T) => string | null | undefined): T[] {
  const groups: T[][] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    const at = k == null ? undefined : index.get(k);
    if (at === undefined) {
      if (k != null) index.set(k, groups.length);
      groups.push([item]);
    } else {
      groups[at].push(item);
    }
  }
  const out: T[] = [];
  for (let round = 0; out.length < items.length; round += 1) {
    for (const group of groups) {
      if (round < group.length) out.push(group[round]);
    }
  }
  return out;
}
