/**
 * 都道府県ごとの「現地写真コンプリート」状況。
 *
 * トップは残り枚数（全国で十数枚）だけを出していた。全国の残りは埋まるのが
 * 遅く、何週間見ても数字が動かない。動かない数字を進捗として出すと、
 * 読んだ人には「終わらない」としか見えない。
 *
 * 残っている蓋は少数の都道府県に固まっているので、都道府県を単位にすると
 * 1県終わるたびに数字が動く。枚数はその内訳として添える。
 */

export interface CompletionInput {
  prefecture: string | null;
  photo_count: number;
}

export interface PrefectureCompletion {
  prefecture: string;
  total: number;
  withPhoto: number;
  missing: number;
  /** 0-100 の整数。 */
  coverage: number;
  isComplete: boolean;
}

export interface CompletionRollup {
  /** ポケふたが1枚以上ある都道府県だけ。47ではない点に注意。 */
  listedCount: number;
  completeCount: number;
  /** 残り枚数の少ない順。先頭が「次に終わる県」。 */
  incomplete: PrefectureCompletion[];
  incompleteCount: number;
  missingTotal: number;
}

/**
 * 既知の穴: **設置予定の蓋を除外できない。**
 *
 * 図鑑側のデータ（pokefuta.ndjson）は `installed: false`（登録済みだが現地に
 * まだ設置されていない蓋）を持っているが、アプリが読む
 * data.pokefuta.com のスナップショットにはこの項目が無い。Supabase の
 * `manhole` テーブル自体に相当する列が無く、スナップショットはそこから
 * 焼かれているため。スナップショットの `is_active` は「レコードが生きて
 * いるか」であって設置状況ではないので、代わりには使えない。
 *
 * 結果として、設置予定の蓋は「写真が無い普通の蓋」として残り枚数に入る。
 * その県は撮りに行きようのない1枚のせいで永久にコンプリートしない。
 * 現時点の実データでは該当は1枚（id 461 / 福島県小野町）だけで、しかも既に
 * 写真があるため表に出ていないが、次に写真の無い設置予定が焼かれた時点で
 * 顕在化する。根本的には Supabase 側に設置状況を持たせてスナップショットに
 * 載せる必要がある。
 */
export function buildPrefectureCompletion(
  manholes: CompletionInput[]
): CompletionRollup {
  const byPrefecture = new Map<string, { total: number; withPhoto: number }>();

  for (const manhole of manholes) {
    const prefecture = (manhole.prefecture ?? '').trim();
    // 都道府県が空のレコードはどの県にも積めないので数えない。混ぜると
    // listedCount と各県の合計が合わなくなる。
    if (!prefecture) continue;

    const entry = byPrefecture.get(prefecture) ?? { total: 0, withPhoto: 0 };
    entry.total += 1;
    if (manhole.photo_count > 0) entry.withPhoto += 1;
    byPrefecture.set(prefecture, entry);
  }

  const prefectures: PrefectureCompletion[] = [];
  for (const [prefecture, { total, withPhoto }] of byPrefecture) {
    // total が 0 の県はそもそも Map に入らない（= ポケふたが無い県は母数に
    // 入れない）。入れると「未設置だからコンプリート」と「全部撮った」が
    // 同じ扱いになり、母数も47に見えてしまう。
    const missing = Math.max(total - withPhoto, 0);
    prefectures.push({
      prefecture,
      total,
      withPhoto,
      missing,
      coverage: Math.round((withPhoto / total) * 100),
      isComplete: missing === 0,
    });
  }

  const incomplete = prefectures
    .filter((entry) => !entry.isComplete)
    .sort(
      (a, b) =>
        a.missing - b.missing || a.prefecture.localeCompare(b.prefecture, 'ja')
    );

  return {
    listedCount: prefectures.length,
    completeCount: prefectures.filter((entry) => entry.isComplete).length,
    incomplete,
    incompleteCount: incomplete.length,
    missingTotal: prefectures.reduce((sum, entry) => sum + entry.missing, 0),
  };
}
