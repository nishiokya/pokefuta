-- visit.last_photo_at: その訪問に最後に写真が足された時刻（新着フィードの並び順）
--
-- 背景:
--
-- まとめて投稿（/upload/bulk、PR #332）は、同じ蓋・同じ撮影日（JST）の訪問が
-- すでにあると、新しい訪問を作らずその訪問に写真を足す。新着フィードは
-- visit.created_at の順なので、足した写真は何か月も前の位置に入り、投稿した本人
-- から見ると「投稿したのに新着に出ない」になる。
--
-- 新着は「写真が足された時刻」で並べる。photo を毎回集計すると深いページで
-- max_rows に当たるので、visit に列として持たせてトリガで更新する。
--
-- 書き込みの決まり:
--   - 写真の INSERT（と visit_id の付け替え）のたびに、その訪問の値を DB の now() に進める（戻さない）。
--     photo.created_at は使わない。authenticated は自分の写真の created_at を指定できるので、
--     未来の日時で INSERT すれば訪問を新着の先頭に固定できてしまう
--   - 写真を消しても戻さない。「最後に写真が足された時刻」であって「今ある写真の最新」ではない
--   - anon / authenticated は直接書けない（自分の訪問を先頭に固定できてしまうため）。
--     visit はテーブル単位で UPDATE を GRANT しているので、列の REVOKE では塞げない
--     （CLAUDE.md）。photo_protect_quality_score と同じく、トリガで黙って元に戻す
--
-- 適用順: このマイグレーションを先に本番へ適用し、そのあとアプリ（order_by=last_photo_at
-- を使う側）を出す。列を足すだけなので、旧アプリは適用後もそのまま動く。
--
-- ロールバック:
--   DROP TRIGGER IF EXISTS photo_bump_visit_last_photo_at ON public.photo;
--   DROP TRIGGER IF EXISTS visit_protect_last_photo_at ON public.visit;
--   DROP FUNCTION IF EXISTS public.photo_bump_visit_last_photo_at();
--   DROP FUNCTION IF EXISTS public.visit_protect_last_photo_at();
--   ALTER TABLE public.visit DROP COLUMN IF EXISTS last_photo_at;

-- ---------------------------------------------------------------------------
-- 1. 列と埋め戻し
--
-- visit にはトリガが無いので、埋め戻しの UPDATE で updated_at は動かない。
-- 写真の無い訪問は created_at にしておく（NOT NULL にして並びを安定させる）。
-- created_at はどちらも利用者が指定できた値なので、未来の日時は now() で頭打ちにする。
-- ---------------------------------------------------------------------------

ALTER TABLE public.visit ADD COLUMN IF NOT EXISTS last_photo_at timestamptz;

UPDATE public.visit AS v
SET last_photo_at = LEAST(
  now(),
  GREATEST(
    v.created_at,
    COALESCE((SELECT max(p.created_at) FROM public.photo AS p WHERE p.visit_id = v.id), v.created_at)
  )
)
WHERE v.last_photo_at IS NULL;

ALTER TABLE public.visit ALTER COLUMN last_photo_at SET DEFAULT now();
ALTER TABLE public.visit ALTER COLUMN last_photo_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_last_photo_at ON public.visit (last_photo_at DESC);

-- ---------------------------------------------------------------------------
-- 2. anon / authenticated からの書き込みは元に戻す
--
-- INSERT は now()、UPDATE は元の値。エラーにしないのは、アプリが visit 行を
-- 丸ごと書き戻しても保存が失敗しないようにするため。下の photo のトリガは
-- SECURITY DEFINER（postgres）で動くので、ここは素通りする。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.visit_protect_last_photo_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.last_photo_at := now();
  ELSE
    NEW.last_photo_at := OLD.last_photo_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visit_protect_last_photo_at ON public.visit;
CREATE TRIGGER visit_protect_last_photo_at
  BEFORE INSERT OR UPDATE ON public.visit
  FOR EACH ROW EXECUTE FUNCTION public.visit_protect_last_photo_at();

REVOKE EXECUTE ON FUNCTION public.visit_protect_last_photo_at() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 写真が足されたら訪問の値を進める
--
-- 写真の INSERT は投稿者本人（authenticated）で走り、visit の UPDATE 権限と RLS は
-- 自分の行に限られる。2. のトリガに戻されないよう SECURITY DEFINER で書く。
-- 書くのは NEW.visit_id の行の last_photo_at だけ。
-- UPDATE OF visit_id は同じ値の再指定でも発火するので、実際に変わったときだけ進める
-- （写真を足さずに新着へ戻れないように）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.photo_bump_visit_last_photo_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.visit_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.visit_id IS NOT DISTINCT FROM NEW.visit_id THEN
    RETURN NULL;
  END IF;

  UPDATE public.visit
  SET last_photo_at = GREATEST(last_photo_at, now())
  WHERE id = NEW.visit_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS photo_bump_visit_last_photo_at ON public.photo;
CREATE TRIGGER photo_bump_visit_last_photo_at
  AFTER INSERT OR UPDATE OF visit_id ON public.photo
  FOR EACH ROW EXECUTE FUNCTION public.photo_bump_visit_last_photo_at();

REVOKE EXECUTE ON FUNCTION public.photo_bump_visit_last_photo_at() FROM PUBLIC, anon, authenticated;

-- トリガ関数は直接呼べないが、Supabase の既定で anon / authenticated にも EXECUTE が
-- 付くので名指しで外す。トリガの発火に EXECUTE は要らない（確かめるのは CREATE TRIGGER の時だけ）。
-- PUBLIC から外さないと scoring.audit_photo_scorer() が違反として自動採点を止める（CLAUDE.md）。

-- ---------------------------------------------------------------------------
-- 4. 読み取り
--
-- visit は列単位 GRANT（20261012110000）なので、名指ししないと読めない。
-- ---------------------------------------------------------------------------

GRANT SELECT (last_photo_at) ON public.visit TO anon, authenticated;
