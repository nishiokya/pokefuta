-- ---------------------------------------------------------------------------
-- photo に写真スコア（代表写真選びの材料）を持たせる
--
-- スコアは k11 の manhole-score リポジトリで採点したもの。アプリは計算しない。
-- 値の投入は別ファイル（backfill_photo_quality_score_*）で行う。
--
--   quality_score          0〜1。高いほど代表写真に向く（蓋が中心にあり、画質が足りる）
--   quality_eligible       false = 代表写真の候補から外す判定（蓋が写っていない・ブレ・白飛び・
--                          極端な色かぶり）。スコアが高くても外れることがある
--   quality_score_version  採点ポリシーの版（例 'quality_score/0.2.0'）。版の違う値を混ぜて並べない
--   quality_scored_at      採点した時刻
--
-- 表示は変わらない。src/lib/manhole-photo-ranking.ts は quality_score があれば使うが、
-- 2026-09-25 時点で photo から quality_score を select している箇所は無い。
-- ---------------------------------------------------------------------------

ALTER TABLE public.photo
  ADD COLUMN IF NOT EXISTS quality_score real
    CONSTRAINT photo_quality_score_range CHECK (quality_score >= 0 AND quality_score <= 1),
  ADD COLUMN IF NOT EXISTS quality_eligible boolean,
  ADD COLUMN IF NOT EXISTS quality_score_version text,
  ADD COLUMN IF NOT EXISTS quality_scored_at timestamptz;

COMMENT ON COLUMN public.photo.quality_score IS
  '代表写真向きの度合い 0〜1。k11 manhole-score で採点。アプリ・利用者からは書き換えられない（photo_protect_quality_score）';
COMMENT ON COLUMN public.photo.quality_eligible IS
  'false = 代表写真の候補から外す（蓋が写っていない・ブレ・白飛び・極端な色かぶり）';
COMMENT ON COLUMN public.photo.quality_score_version IS
  '採点ポリシーの版。例 quality_score/0.2.0';
COMMENT ON COLUMN public.photo.quality_scored_at IS
  '採点した時刻';

-- ---------------------------------------------------------------------------
-- 利用者がスコアを書き換えられないようにする
--
-- photo は anon / authenticated にテーブル単位の GRANT ALL があり、所有者は
-- users_update_own_photos で自分の写真を UPDATE できる。PostgREST を直接叩けば
-- 自分の写真の quality_score を 1 にして代表写真に割り込める。
--
-- 列単位の REVOKE UPDATE はテーブル単位の GRANT が残る限り効かない（CLAUDE.md）。
-- テーブル単位の UPDATE を剥がすとアプリの更新経路に影響するので、ここでは
-- トリガで「anon / authenticated からの変更は黙って元に戻す」。エラーにしないのは、
-- アプリが将来 photo 行を丸ごと書き戻しても投稿・更新が失敗しないようにするため。
-- マイグレーション（postgres）と service_role は通常どおり書ける。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.photo_protect_quality_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.quality_score := NULL;
    NEW.quality_eligible := NULL;
    NEW.quality_score_version := NULL;
    NEW.quality_scored_at := NULL;
  ELSE
    NEW.quality_score := OLD.quality_score;
    NEW.quality_eligible := OLD.quality_eligible;
    NEW.quality_score_version := OLD.quality_score_version;
    NEW.quality_scored_at := OLD.quality_scored_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photo_protect_quality_score ON public.photo;
CREATE TRIGGER photo_protect_quality_score
  BEFORE INSERT OR UPDATE ON public.photo
  FOR EACH ROW EXECUTE FUNCTION public.photo_protect_quality_score();

-- ---------------------------------------------------------------------------
-- 読み取り: 代表写真の並べ替えに使う2列だけ公開する
--
-- photo は列単位 GRANT の形（20260810120000）なので、足した列は名指ししない限り
-- anon / authenticated から読めない。版と採点時刻は内部の管理情報なので出さない。
-- ---------------------------------------------------------------------------

GRANT SELECT (quality_score, quality_eligible) ON public.photo TO anon, authenticated;
