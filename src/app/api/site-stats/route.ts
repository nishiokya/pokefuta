import { NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { fetchSiteStatsSnapshot } from '@/lib/manhole-snapshot';

/**
 * サイト統計。
 *
 * 件数はリアルタイム、それ以外は日次スナップショット。
 *
 * 件数（manholes / posts / public_posts / manholes_with_photos / users）は
 * get_site_counts() RPC で毎回 DB から取る。トップページの
 * 「いま N 枚の写真が集まっています」は現在形なので、日次 bake の値だと
 * 夕方には ~17h 古く、その日の投稿が丸ごと落ちていた。
 *
 * RPC は集計値を1行返すだけで行は返さないため、旧実装で問題だった
 * リクエスト毎の重い読み出し（auth admin API の全ユーザー走査）とは
 * 負荷の桁が違う。加えて下の Cache-Control で CDN 側に 60 秒持たせるので、
 * 同じ CDN キャッシュが効く範囲では DB への呼び出しを減らせる。
 *
 * 残りのフィールド（latest_*_at, posts_last_7d など）は引き続き
 * data.pokefuta.com のスナップショット由来。こちらは現在形の文言に
 * 使われておらず、日次で十分。
 *
 * force-dynamic が無いとこのルートはビルド時に静的プリレンダーされ、
 * Amplify では ISR 再検証が効かないためデプロイ時点の値で凍結する。
 * ルート自体を毎回実行し、鮮度はこの下の明示的なキャッシュ指定に任せる。
 */
export const dynamic = 'force-dynamic';

const LIVE_COUNTS_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const HOME_COUNTS_CACHE = 'public, s-maxage=300, stale-while-revalidate=300';

type LiveCounts = {
  manholes: number | null;
  posts: number | null;
  public_posts: number | null;
  manholes_with_photos: number | null;
  users: number | null;
  /** status='published' のみ。デザインマンホール一覧で見える枚数と一致する */
  design_manholes: number | null;
};

async function fetchLiveCounts(): Promise<LiveCounts | null> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc('get_site_counts');

    if (error) {
      // マイグレーション未適用（42883: 関数が無い）でもトップページを落とさない。
      // スナップショットへフォールバックする。
      console.error('get_site_counts failed:', error.message);
      return null;
    }

    // RETURNS TABLE なので配列で返る
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const num = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    return {
      manholes: num(row.manholes),
      posts: num(row.posts),
      public_posts: num(row.public_posts),
      manholes_with_photos: num(row.manholes_with_photos),
      users: num(row.users),
      design_manholes: num(row.design_manholes),
    };
  } catch (error) {
    console.error('get_site_counts threw:', error);
    return null;
  }
}

/**
 * 応答の骨格。
 *
 * スナップショットが取れずライブ件数だけ取れた場合でも、キーの欠けた
 * 成功応答を返さないための土台。利用側は `data.posts` のように直接読むので、
 * 状況によってキーが生えたり消えたりすると壊れやすい。値が無いことは
 * 「キーが無い」ではなく null で表す。
 */
function emptyStats(): Record<string, unknown> {
  return {
    users: null,
    auth_users: null,
    active_users_7d: null,
    posts: null,
    manholes: null,
    manholes_with_photos: null,
    latest_photo_at: null,
    latest_user_at: null,
    latest_visit_at: null,
    posts_last_7d: null,
    posts_last_30d: null,
    manhole_comments: null,
    public_posts: null,
    private_posts: null,
    design_manholes: null,
    generated_at: null,
    source: null,
  };
}

async function getHomeCounts() {
  const live = await fetchLiveCounts();
  // トップで使うのは公開写真数と公開デザインふた数だけ。通常は DB 1回で返す。
  if (live?.public_posts != null && live.design_manholes != null) {
    return NextResponse.json({
      success: true,
      public_posts: live.public_posts,
      design_manholes: live.design_manholes,
    }, { headers: { 'Cache-Control': HOME_COUNTS_CACHE } });
  }

  const snapshot = await fetchSiteStatsSnapshot();
  const publicPosts = live?.public_posts ?? snapshot?.public_posts ?? null;
  const designManholes = live?.design_manholes ?? null;
  const success = publicPosts != null || designManholes != null;

  return NextResponse.json({
    success,
    public_posts: publicPosts,
    design_manholes: designManholes,
  }, {
    status: success ? 200 : 503,
    headers: { 'Cache-Control': success ? 'public, s-maxage=60' : 'no-store' },
  });
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('view') === 'home') {
    return getHomeCounts();
  }

  // スナップショットと件数は互いに独立なので並列で取る
  const [snapshot, live] = await Promise.all([fetchSiteStatsSnapshot(), fetchLiveCounts()]);

  if (snapshot || live) {
    // 件数だけライブ値で上書きし、それ以外はスナップショットのまま返す。
    // private_posts はスナップショットの値と混ざると内訳が合わなくなるので、
    // ライブの posts / public_posts が揃っているときは差分で計算し直す。
    const merged: Record<string, unknown> = { ...emptyStats(), ...(snapshot ?? {}) };

    if (live) {
      for (const [key, value] of Object.entries(live)) {
        if (value != null) merged[key] = value;
      }
      if (live.posts != null && live.public_posts != null) {
        merged.private_posts = live.posts - live.public_posts;
      }
      merged.counts_source = 'live';
    } else {
      merged.counts_source = 'snapshot';
    }

    merged.success = true;

    return NextResponse.json(merged, {
      headers: { 'Cache-Control': LIVE_COUNTS_CACHE },
    });
  }

  // 他 API と同様、取得失敗は success: false + 5xx で返す。
  // 成功応答を CDN に持たせている以上、失敗側は明示的に no-store にしないと
  // エラーが同じだけキャッシュされて復旧が遅れる。
  return NextResponse.json(
    {
      ...emptyStats(),
      success: false,
      error: 'Site statistics are unavailable',
      source: 'unavailable',
      counts_source: 'unavailable',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
