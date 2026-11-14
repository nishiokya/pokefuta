/**
 * デザインマンホール投稿のタグ（ガンダム・野球など）。
 *
 * タグの正は図鑑（pokefuta-tracker）にある。台帳は dataset/manhole_groups.json、投稿へのタグは
 * 設置場所への紐付け（自動）と overrides の tags（手で付けたもの）。図鑑の Pages デプロイが
 * `api/design_manhole_tags.json` に書き出し、写真館はそれを読むだけ（DB には持たない）。
 *
 * ここは取ってきた JSON を確かめて整える純粋な関数だけ（テストから読めるよう server-only にしない）。
 * 読み込みは design-manhole-tags.ts。
 */

export interface DesignManholeTagGroup {
  /** URL に入る（/design-manholes/tags/<slug>） */
  slug: string;
  /** チップに出す短い名前（ガンダム、野球） */
  label: string;
  /** ページの見出しに使う名前（機動戦士ガンダム、野球のマンホール） */
  name: string;
  /** 設置場所の一覧がある作品は catalog、無いもの（野球など）は open */
  kind: 'catalog' | 'open';
  parent: string | null;
  /** catalog だけ。図鑑に載っている設置場所の数と、そのうち写真のある数 */
  spots: number | null;
  spotsWithPhoto: number | null;
  /** 図鑑の作品ガイド（data.pokefuta.com だけ）。無ければ null */
  guideUrl: string | null;
}

export interface DesignManholeTagData {
  groups: DesignManholeTagGroup[];
  /** 投稿ID → タグの slug（親のタグも入っている）。groups に無い slug は入れない */
  tagsByPost: Record<string, string[]>;
}

export const EMPTY_TAG_DATA: DesignManholeTagData = { groups: [], tagsByPost: {} };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidTagSlug(slug: string): boolean {
  return slug.length <= 40 && SLUG_PATTERN.test(slug);
}

const isDexUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'data.pokefuta.com';
  } catch {
    return false;
  }
};

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max ? value : null;

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/**
 * 図鑑の JSON を確かめて整える。形が違えば null（呼ぶ側はタグを出さないだけ）。
 * 1件ずつ確かめ、おかしなグループ・タグはそれだけ捨てる（JSON の中身はページの URL と文言になる）。
 */
export function parseDesignManholeTagData(raw: unknown): DesignManholeTagData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as { success?: unknown; groups?: unknown; posts?: unknown };
  if (data.success !== true || !Array.isArray(data.groups) || typeof data.posts !== 'object' || data.posts === null) {
    return null;
  }

  const groups: DesignManholeTagGroup[] = [];
  const seen = new Set<string>();
  for (const item of data.groups as Record<string, unknown>[]) {
    if (typeof item !== 'object' || item === null) continue;
    const slug = typeof item.slug === 'string' && isValidTagSlug(item.slug) ? item.slug : null;
    const label = text(item.label, 20);
    const name = text(item.name, 40);
    if (!slug || !label || !name || seen.has(slug)) continue;
    seen.add(slug);
    const kind = item.kind === 'catalog' ? 'catalog' : 'open';
    groups.push({
      slug,
      label,
      name,
      kind,
      parent: typeof item.parent === 'string' ? item.parent : null,
      spots: kind === 'catalog' ? count(item.spots) : null,
      spotsWithPhoto: kind === 'catalog' ? count(item.spots_with_photo) : null,
      guideUrl: isDexUrl(item.guide_url) ? item.guide_url : null,
    });
  }
  // 親は groups にあって、自分は親を持たないものだけ（段は2つまで）
  const bySlug = new Map(groups.map((group) => [group.slug, group]));
  for (const group of groups) {
    const parent = group.parent ? bySlug.get(group.parent) : undefined;
    if (!parent || parent.slug === group.slug || parent.parent) group.parent = null;
  }

  const tagsByPost: Record<string, string[]> = {};
  for (const [id, post] of Object.entries(data.posts as Record<string, { tags?: unknown }>)) {
    if (typeof post !== 'object' || post === null || !Array.isArray(post.tags)) continue;
    const tags = post.tags.filter((tag): tag is string => typeof tag === 'string' && seen.has(tag));
    if (tags.length > 0) tagsByPost[id] = [...new Set(tags)];
  }
  return { groups, tagsByPost };
}

export interface TagChip {
  group: DesignManholeTagGroup;
  /** いま公開されている投稿のうち、このタグが付いている枚数 */
  photos: number;
  /** チップの丸い写真（このタグのいちばん新しい投稿） */
  coverId: string | null;
}

/**
 * 一覧に出すチップ。枚数は図鑑の JSON の数ではなく、いま写真館で公開している投稿で数える
 * （図鑑の取り込みは1日1回なので、非公開にした投稿が数に残らないように）。
 * 写真が1枚も無いタグは出さない。並びは枚数の多い順（同じなら台帳の順）。
 *
 * @param publishedIds 公開中の投稿ID（新しい順）
 */
export function buildTagChips(data: DesignManholeTagData, publishedIds: string[]): TagChip[] {
  const stats = new Map<string, { photos: number; coverId: string | null }>();
  for (const id of publishedIds) {
    for (const slug of data.tagsByPost[id] ?? []) {
      const stat = stats.get(slug) ?? { photos: 0, coverId: id };
      stat.photos += 1;
      stats.set(slug, stat);
    }
  }
  return data.groups
    .map((group, index) => ({ group, index, ...(stats.get(group.slug) ?? { photos: 0, coverId: null }) }))
    .filter((chip) => chip.photos > 0)
    .sort((a, b) => b.photos - a.photos || a.index - b.index)
    .map(({ group, photos, coverId }) => ({ group, photos, coverId }));
}

/** 一覧の先頭に出すチップ（親を持たないタグだけ。子はそのタグのページで出す） */
export function topLevelChips(chips: TagChip[]): TagChip[] {
  return chips.filter((chip) => chip.group.parent === null);
}

/** タグのページの2段目に出すチップ: 親のページなら子、子のページなら同じ親の子（自分も含む） */
export function relatedChips(chips: TagChip[], slug: string): TagChip[] {
  const current = chips.find((chip) => chip.group.slug === slug);
  if (!current) return [];
  const parent = current.group.parent ?? current.group.slug;
  return chips.filter((chip) => chip.group.parent === parent);
}

/** カードに出すタグ。子のタグがあれば親は出さない（「カープ」と「野球」を並べない）。多くても2つ */
export function cardTags(data: DesignManholeTagData, id: string): DesignManholeTagGroup[] {
  const slugs = data.tagsByPost[id] ?? [];
  const groups = slugs
    .map((slug) => data.groups.find((group) => group.slug === slug))
    .filter((group): group is DesignManholeTagGroup => group !== undefined);
  const parents = new Set(groups.map((group) => group.parent).filter(Boolean));
  return groups.filter((group) => !parents.has(group.slug)).slice(0, 2);
}

export function tagHref(slug: string, page = 1): string {
  const base = `/design-manholes/tags/${slug}`;
  return page <= 1 ? base : `${base}?page=${page}`;
}
