-- ---------------------------------------------------------------------------
-- 未掲載のポケふた（仮のポケふた）: 公式 local.pokemon.jp が止まっている間だけ写真を救う
--
-- 背景（2026-10-31）: 公式が 503 のまま止まり、新しく設置されたポケふたがマスタ（manhole）に
-- 入らない。写真館の投稿は、どの蓋かを manhole から選ぶ前提なので、新作の写真を受け付けられない。
-- 仕様: vault inbox/dev/pokefuta/spec/2026-10-31 pokefuta 公式停止中の未掲載ポケふた投稿と場所募集（ブレスト）.md
-- 検査: npm run verify:provisional（tools/verify-provisional.sql）
--
-- 決めたこと（オーナー・Codex と決定）:
--   * 対象は設置済みで写真のあるものだけ。仮のポケふたは最初の写真と同じトランザクションで作る
--   * 写真は受け付けてすぐ公開する。スタンプ帳・制覇率には数えない（visit/photo に入れない）
--   * 公式が戻ったら、運営が正式な manhole.id へ結びつけ（provisional_ops.link）、
--     写真を通常の visit/photo に移す。自動では結びつけない。visit.shot_location は写真の EXIF GPS
--     （通常の投稿と同じ）。手がかりのピンや蓋の座標は撮影位置にしない
--   * 写真は EXIF の撮影日時と GPS が両方あるものだけ。GPS は運営が場所を決める材料で、公開しない
--   * 場所の手がかり（ピン・施設名・出典URL）は写真が無くても足せる。確定位置には昇格させない
--
-- manhole に入れない理由: manhole.id は公式の番号で、photo.manhole_id / visit.manhole_id は
-- integer。仮の番号を振ると公式の番号とぶつかる。
--
-- 何が誰に開いているか:
--   * 表は5つとも RLS を有効にしてポリシーを置かず、anon / authenticated から REVOKE する。
--     読み書きはすべて下の関数を通す
--   * 写真の登録（provisional_submit_photo）は service_role だけ。API が画像を再エンコードして
--     R2 に置いた後に呼ぶ。authenticated に開くと、画像処理を通さずに任意の保存キー
--     （署名URLから他人の写真のキーが分かる）を登録できてしまう
--   * 手がかり・通報・本人の撤回・本人の一覧は authenticated（auth.uid() で本人を決める）
--   * 一覧・詳細・写真の保存キーは anon にも開く（公開中のものだけ返す）
--   * 運営の操作は専用ロール provisional_operator から provisional_ops の関数だけ
--     （photo_scorer と同じ作り。20260927100000_photo_scorer_role.sql）
--
-- public の SECURITY DEFINER 関数は REVOKE ... FROM PUBLIC して名指しで GRANT する。
-- 書き忘れると photo_scorer / provisional_operator から呼べてしまい、
-- scoring.audit_photo_scorer() が違反として k11 の採点ジョブを止める。
--
-- パスワードはここに書かない。本番では SQL Editor で1回だけ
--   ALTER ROLE provisional_operator WITH PASSWORD '...';
-- を流し、運営の手元の秘密の置き場所に置く。リポジトリにも .env.local にも置かない。
--
-- 受付の初期値は「閉」。画面と API を出して確かめてから provisional_ops.set_accepting(true, ...) で開く。
--
-- ロールバック（公開済みの写真があるときは表を落とさず、受付を閉じるだけにする）:
--   SELECT provisional_ops.set_accepting(false, 'rollback');
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 運営ロール（photo_scorer と同じ検査。既存の同名ロールに強い権限があれば失敗させる）
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r pg_roles%ROWTYPE;
  existed boolean;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'provisional_operator';
  existed := FOUND;
  IF NOT existed THEN
    CREATE ROLE provisional_operator
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION
      CONNECTION LIMIT 2;
  ELSIF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
        OR NOT r.rolcanlogin OR r.rolinherit THEN
    RAISE EXCEPTION 'provisional_operator が既にあり、属性が想定と違う';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'provisional_operator'::regrole) THEN
    RAISE EXCEPTION 'provisional_operator が他のロールのメンバーになっている';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = 'provisional_operator'::regrole
      AND (member <> (SELECT oid FROM pg_roles WHERE rolname = current_user) OR set_option OR inherit_option)
  ) THEN
    RAISE EXCEPTION 'provisional_operator に SET ROLE / 継承できるロールがある';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_shdepend
    WHERE refclassid = 'pg_authid'::regclass AND refobjid = 'provisional_operator'::regrole AND deptype = 'o'
  ) THEN
    RAISE EXCEPTION 'provisional_operator が所有しているオブジェクトがある';
  END IF;

  IF existed THEN
    ALTER ROLE provisional_operator PASSWORD NULL;
    ALTER ROLE provisional_operator RESET ALL;
  END IF;
END $$;

ALTER ROLE provisional_operator CONNECTION LIMIT 2;
ALTER ROLE provisional_operator SET statement_timeout = '60s';

COMMENT ON ROLE provisional_operator IS
  '未掲載ポケふたの運営操作専用。テーブル権限なし。provisional_ops の関数の EXECUTE のみ';

-- ---------------------------------------------------------------------------
-- スキーマ provisional_ops（PostgREST の api.schemas に含めない）
-- **ここに関数を足すときは必ず REVOKE ALL ... FROM PUBLIC を書き、audit の許可リストに足すこと。**
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  owner_name text;
BEGIN
  SELECT nspowner::regrole::text INTO owner_name FROM pg_namespace WHERE nspname = 'provisional_ops';
  IF NOT FOUND THEN
    CREATE SCHEMA provisional_ops;
  ELSIF owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'provisional_ops スキーマが既にあり、所有者が %', owner_name;
  END IF;
END $$;

ALTER SCHEMA provisional_ops OWNER TO postgres;
REVOKE ALL ON SCHEMA provisional_ops FROM PUBLIC;
GRANT USAGE ON SCHEMA provisional_ops TO provisional_operator;

-- ---------------------------------------------------------------------------
-- 表
-- 投稿者は auth.users の id（visit.user_id と同じ）。写真・手がかり・通報は本人が退会すると消える。
-- 仮ポケふた自体は他の人の写真も載るので、作った人が退会しても残す（created_by を NULL にする）。
-- ---------------------------------------------------------------------------

CREATE TABLE public.provisional_setting (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  accepting boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.provisional_setting (id, accepting) VALUES (true, false);
COMMENT ON TABLE public.provisional_setting IS
  '未掲載ポケふたの受付の開閉（1行だけ）。閉じている間は写真と手がかりを受け付けない。通報・撤回・運営操作は使える';

CREATE TABLE public.provisional_manhole (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  prefecture_id integer NOT NULL REFERENCES public.prefecture(id),
  city text CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 50),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'merged', 'linked')),
  merged_into_id uuid REFERENCES public.provisional_manhole(id),
  official_manhole_id integer REFERENCES public.manhole(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisional_manhole_merged CHECK ((state = 'merged') = (merged_into_id IS NOT NULL)),
  CONSTRAINT provisional_manhole_linked CHECK ((state = 'linked') = (official_manhole_id IS NOT NULL)),
  CONSTRAINT provisional_manhole_not_self CHECK (merged_into_id IS DISTINCT FROM id)
);
COMMENT ON TABLE public.provisional_manhole IS
  '未掲載のポケふた（公式停止中の仮登録）。state: open=受付中, merged=重複として merged_into_id へまとめた, linked=正式な official_manhole_id へ移した';

CREATE TABLE public.provisional_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provisional_manhole_id uuid NOT NULL REFERENCES public.provisional_manhole(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 再エンコード済み（メタデータなし）の JPEG。small は deriveSmallKey() と同じ規約の webp
  storage_key text NOT NULL UNIQUE
    CHECK (storage_key ~ '^photos/original/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.jpg$'),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  file_size integer CHECK (file_size IS NULL OR file_size > 0),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  shot_at timestamptz NOT NULL,
  -- EXIF の GPS（撮影者の位置）。運営だけが見る。一覧・詳細・本人向けにも返さない
  shot_lat double precision NOT NULL,
  shot_lng double precision NOT NULL,
  comment text CHECK (comment IS NULL OR char_length(comment) <= 500),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'withdrawn')),
  -- 正式IDへ移した先。visit/photo は本人が後で消せるので外部キーにしない（消えても移行済みの記録は残す）
  transferred_visit_id uuid UNIQUE,
  transferred_photo_id uuid UNIQUE,
  transferred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisional_photo_transfer_all_or_none CHECK (
    (transferred_visit_id IS NULL) = (transferred_photo_id IS NULL)
    AND (transferred_visit_id IS NULL) = (transferred_at IS NULL)),
  CONSTRAINT provisional_photo_shot_in_japan CHECK (shot_lat BETWEEN 20 AND 46 AND shot_lng BETWEEN 122 AND 154)
);
CREATE INDEX idx_provisional_photo_manhole ON public.provisional_photo (provisional_manhole_id, created_at DESC);
CREATE INDEX idx_provisional_photo_user ON public.provisional_photo (user_id, created_at DESC);
COMMENT ON TABLE public.provisional_photo IS
  '未掲載ポケふたの写真。EXIF の GPS は shot_lat/shot_lng に持つが公開しない（運営と、正式IDへ移すときの visit.shot_location だけ）。withdrawn=本人が取り下げ、hidden=運営が非表示';

CREATE TABLE public.provisional_location_hint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provisional_manhole_id uuid NOT NULL REFERENCES public.provisional_manhole(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision,
  lng double precision,
  facility text CHECK (facility IS NULL OR char_length(btrim(facility)) BETWEEN 1 AND 100),
  source_url text CHECK (source_url IS NULL OR (char_length(source_url) <= 500 AND source_url ~ '^https?://[^[:space:]]+$')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provisional_hint_coords_pair CHECK ((lat IS NULL) = (lng IS NULL)),
  CONSTRAINT provisional_hint_japan_bounds CHECK (
    lat IS NULL OR (lat BETWEEN 20 AND 46 AND lng BETWEEN 122 AND 154)),
  CONSTRAINT provisional_hint_has_something CHECK (
    lat IS NOT NULL OR facility IS NOT NULL OR source_url IS NOT NULL)
);
CREATE INDEX idx_provisional_hint_manhole ON public.provisional_location_hint (provisional_manhole_id, created_at DESC);
CREATE INDEX idx_provisional_hint_user ON public.provisional_location_hint (user_id, created_at DESC);
COMMENT ON TABLE public.provisional_location_hint IS
  '利用者からの場所の手がかり（追記のみ。他人の手がかりを上書きしない）。確定位置ではない';

CREATE TABLE public.provisional_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('manhole', 'photo', 'hint')),
  target_id uuid NOT NULL,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text CHECK (resolution IS NULL OR char_length(resolution) <= 200),
  CONSTRAINT provisional_report_once UNIQUE (reporter_user_id, target_type, target_id)
);
CREATE INDEX idx_provisional_report_open ON public.provisional_report (created_at) WHERE resolved_at IS NULL;

CREATE TABLE provisional_ops.operation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op text NOT NULL,
  target_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor text NOT NULL DEFAULT session_user,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provisional_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisional_manhole ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisional_photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisional_location_hint ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisional_report ENABLE ROW LEVEL SECURITY;
-- Supabase は public の新しい表に anon / authenticated の全権限を既定で付ける。RLS だけに頼らず外す
REVOKE ALL ON public.provisional_setting, public.provisional_manhole, public.provisional_photo,
  public.provisional_location_hint, public.provisional_report FROM PUBLIC, anon, authenticated;
REVOKE ALL ON provisional_ops.operation_log FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 内部の補助（誰にも GRANT しない。下の SECURITY DEFINER 関数から所有者として呼ぶ）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION provisional_ops.require_accepting()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT coalesce((SELECT s.accepting FROM public.provisional_setting AS s WHERE s.id), false) THEN
    RAISE EXCEPTION 'provisional: 受付を停止しています' USING ERRCODE = 'P0001', HINT = 'PROVISIONAL_CLOSED';
  END IF;
END;
$$;

-- 利用者ごとの件数上限。件数を数えてから INSERT するまで、同じ利用者の同じ種類の書き込みを直列にする
CREATE OR REPLACE FUNCTION provisional_ops.require_quota(p_kind text, p_user uuid, p_count bigint, p_limit integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_count >= p_limit THEN
    RAISE EXCEPTION 'provisional: % の上限（24時間に%件）に達しました', p_kind, p_limit
      USING ERRCODE = 'P0001', HINT = 'PROVISIONAL_RATE_LIMITED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION provisional_ops.require_accepting() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION provisional_ops.require_quota(text, uuid, bigint, integer) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 写真の登録（service_role のみ。API が画像を再エンコードし R2 に置いた後に呼ぶ）
--
-- p_provisional_id を渡すと既存の仮ポケふたへ追加、NULL なら p_title / p_prefecture_id / p_city で
-- 新しく作る（同じトランザクションなので写真の無い仮ポケふたはできない）。
-- 上限: 1人 写真5枚 / 24時間（新規と追加の合計。取り下げ・非表示も数える＝消しても枠は戻らない）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provisional_submit_photo(
  p_user_id uuid,
  p_provisional_id uuid,
  p_title text,
  p_prefecture_id integer,
  p_city text,
  p_storage_key text,
  p_width integer,
  p_height integer,
  p_file_size integer,
  p_sha256 text,
  p_shot_at timestamptz,
  p_shot_lat double precision,
  p_shot_lng double precision,
  p_comment text
)
RETURNS TABLE (provisional_manhole_id uuid, photo_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_manhole uuid;
  v_photo uuid;
  v_count bigint;
  m public.provisional_manhole%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'provisional_submit_photo: 利用者が不正' USING ERRCODE = '22023';
  END IF;
  IF p_shot_at IS NULL OR p_shot_at > now() + interval '1 day' OR p_shot_at < timestamptz '2016-01-01' THEN
    RAISE EXCEPTION 'provisional_submit_photo: 撮影日時が不正' USING ERRCODE = '22023';
  END IF;
  IF p_shot_lat IS NULL OR p_shot_lng IS NULL THEN
    RAISE EXCEPTION 'provisional_submit_photo: 撮影位置（GPS）が無い' USING ERRCODE = '22023';
  END IF;

  PERFORM provisional_ops.require_accepting();

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provisional_photo:' || p_user_id::text, 0));
  SELECT count(*) INTO v_count FROM public.provisional_photo AS ph
  WHERE ph.user_id = p_user_id AND ph.created_at > now() - interval '24 hours';
  PERFORM provisional_ops.require_quota('写真', p_user_id, v_count, 5);

  IF p_provisional_id IS NULL THEN
    INSERT INTO public.provisional_manhole (title, prefecture_id, city, created_by)
    VALUES (btrim(p_title), p_prefecture_id, nullif(btrim(p_city), ''), p_user_id)
    RETURNING id INTO v_manhole;
  ELSE
    SELECT * INTO m FROM public.provisional_manhole AS pm WHERE pm.id = p_provisional_id FOR UPDATE;
    IF NOT FOUND OR m.status <> 'published' THEN
      RAISE EXCEPTION 'provisional_submit_photo: 仮ポケふたが見つからない' USING ERRCODE = 'P0002';
    END IF;
    IF m.state <> 'open' THEN
      RAISE EXCEPTION 'provisional_submit_photo: この仮ポケふたは受付を終えた（%）', m.state
        USING ERRCODE = 'P0001', HINT = 'PROVISIONAL_NOT_OPEN';
    END IF;
    v_manhole := m.id;
  END IF;

  INSERT INTO public.provisional_photo
    (provisional_manhole_id, user_id, storage_key, width, height, file_size, sha256, shot_at, shot_lat, shot_lng, comment)
  VALUES
    (v_manhole, p_user_id, p_storage_key, p_width, p_height, p_file_size, p_sha256, p_shot_at, p_shot_lat, p_shot_lng,
     nullif(btrim(p_comment), ''))
  RETURNING id INTO v_photo;

  UPDATE public.provisional_manhole AS pm SET updated_at = now() WHERE pm.id = v_manhole;

  RETURN QUERY SELECT v_manhole, v_photo;
END;
$$;

-- ---------------------------------------------------------------------------
-- 利用者の操作（authenticated。本人は auth.uid() で決め、引数で受け取らない）
-- ---------------------------------------------------------------------------

-- 場所の手がかり。上限 10件 / 24時間
CREATE OR REPLACE FUNCTION public.provisional_add_hint(
  p_provisional_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_facility text,
  p_source_url text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count bigint;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'provisional_add_hint: ログインが必要' USING ERRCODE = '42501';
  END IF;
  PERFORM provisional_ops.require_accepting();

  PERFORM 1 FROM public.provisional_manhole AS pm
  WHERE pm.id = p_provisional_id AND pm.status = 'published' AND pm.state = 'open'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'provisional_add_hint: 仮ポケふたが見つからない' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provisional_hint:' || v_user::text, 0));
  SELECT count(*) INTO v_count FROM public.provisional_location_hint AS h
  WHERE h.user_id = v_user AND h.created_at > now() - interval '24 hours';
  PERFORM provisional_ops.require_quota('場所の手がかり', v_user, v_count, 10);

  INSERT INTO public.provisional_location_hint
    (provisional_manhole_id, user_id, lat, lng, facility, source_url, note)
  VALUES
    (p_provisional_id, v_user, p_lat, p_lng, nullif(btrim(p_facility), ''),
     nullif(btrim(p_source_url), ''), nullif(btrim(p_note), ''))
  RETURNING id INTO v_id;

  -- 運営の recent() と一覧は updated_at の新しい順。古い仮ポケふたへの手がかりも上に出す
  UPDATE public.provisional_manhole AS pm SET updated_at = now() WHERE pm.id = p_provisional_id;
  RETURN v_id;
END;
$$;

-- 通報。受付を閉じていても使える。上限 20件 / 24時間。同じ人が同じ対象を2回通報しても1件
CREATE OR REPLACE FUNCTION public.provisional_report_target(p_target_type text, p_target_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count bigint;
  v_exists boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'provisional_report_target: ログインが必要' USING ERRCODE = '42501';
  END IF;
  v_exists := CASE p_target_type
    WHEN 'manhole' THEN EXISTS (SELECT 1 FROM public.provisional_manhole AS t WHERE t.id = p_target_id AND t.status = 'published')
    WHEN 'photo' THEN EXISTS (SELECT 1 FROM public.provisional_photo AS t WHERE t.id = p_target_id AND t.status = 'published')
    WHEN 'hint' THEN EXISTS (SELECT 1 FROM public.provisional_location_hint AS t WHERE t.id = p_target_id AND t.status = 'published')
    ELSE NULL END;
  IF v_exists IS NULL THEN
    RAISE EXCEPTION 'provisional_report_target: 対象の種類が不正' USING ERRCODE = '22023';
  ELSIF NOT v_exists THEN
    RAISE EXCEPTION 'provisional_report_target: 対象が見つからない' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provisional_report:' || v_user::text, 0));
  SELECT count(*) INTO v_count FROM public.provisional_report AS r
  WHERE r.reporter_user_id = v_user AND r.created_at > now() - interval '24 hours';
  PERFORM provisional_ops.require_quota('通報', v_user, v_count, 20);

  INSERT INTO public.provisional_report (target_type, target_id, reporter_user_id, reason)
  VALUES (p_target_type, p_target_id, v_user, nullif(btrim(p_reason), ''))
  ON CONFLICT ON CONSTRAINT provisional_report_once DO NOTHING;
  RETURN true;
END;
$$;

-- 本人の写真の取り下げ。正式IDへ移した後は通常の写真の削除を使う
CREATE OR REPLACE FUNCTION public.provisional_withdraw_photo(p_photo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'provisional_withdraw_photo: ログインが必要' USING ERRCODE = '42501';
  END IF;
  UPDATE public.provisional_photo AS ph SET status = 'withdrawn'
  WHERE ph.id = p_photo_id AND ph.user_id = v_user AND ph.transferred_visit_id IS NULL
    AND ph.status <> 'withdrawn';
  RETURN FOUND;
END;
$$;

-- 本人の投稿の一覧（非表示・取り下げも含む。移した先の visit も返す）
CREATE OR REPLACE FUNCTION public.provisional_my_photos()
RETURNS TABLE (photo_id uuid, provisional_manhole_id uuid, title text, status text, manhole_state text,
               official_manhole_id integer, transferred_visit_id uuid, shot_at timestamptz, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT ph.id, pm.id, pm.title, ph.status, pm.state, pm.official_manhole_id, ph.transferred_visit_id,
         ph.shot_at, ph.created_at
  FROM public.provisional_photo AS ph
  JOIN public.provisional_manhole AS pm ON pm.id = ph.provisional_manhole_id
  WHERE ph.user_id = auth.uid()
  ORDER BY ph.created_at DESC
  LIMIT 200
$$;

-- ---------------------------------------------------------------------------
-- 公開（anon にも開く。公開中のものだけ。auth の id・保存キー以外の内部情報は返さない）
-- 投稿者は public_user_id（= app_user.id）と表示名だけ
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provisional_list()
RETURNS TABLE (id uuid, title text, prefecture_id integer, prefecture_name text, city text,
               photo_count bigint, hint_count bigint, cover_photo_id uuid, created_at timestamptz,
               updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pm.id, pm.title, pm.prefecture_id, pf.name::text, pm.city,
         (SELECT count(*) FROM public.provisional_photo AS ph
           WHERE ph.provisional_manhole_id = pm.id AND ph.status = 'published'),
         (SELECT count(*) FROM public.provisional_location_hint AS h
           WHERE h.provisional_manhole_id = pm.id AND h.status = 'published'),
         cover.id, pm.created_at, pm.updated_at
  FROM public.provisional_manhole AS pm
  JOIN public.prefecture AS pf ON pf.id = pm.prefecture_id
  JOIN LATERAL (
    SELECT ph.id FROM public.provisional_photo AS ph
    WHERE ph.provisional_manhole_id = pm.id AND ph.status = 'published'
    ORDER BY ph.created_at ASC, ph.id
    LIMIT 1
  ) AS cover ON true
  WHERE pm.status = 'published' AND pm.state = 'open'
  ORDER BY pm.updated_at DESC, pm.id
  LIMIT 500
$$;

-- 詳細。merged / linked はページの転送先だけ返す。非表示・存在しないものは NULL
CREATE OR REPLACE FUNCTION public.provisional_detail(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN pm.state = 'merged' THEN jsonb_build_object('id', pm.id, 'state', pm.state, 'merged_into_id', pm.merged_into_id)
    WHEN pm.state = 'linked' THEN jsonb_build_object('id', pm.id, 'state', pm.state, 'official_manhole_id', pm.official_manhole_id)
    ELSE jsonb_build_object(
      'id', pm.id,
      'state', pm.state,
      'title', pm.title,
      'prefecture_id', pm.prefecture_id,
      'prefecture_name', pf.name,
      'city', pm.city,
      'created_at', pm.created_at,
      'photos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', ph.id, 'shot_at', ph.shot_at, 'comment', ph.comment, 'created_at', ph.created_at,
                 'width', ph.width, 'height', ph.height,
                 'public_user_id', au.id, 'display_name', au.display_name)
               ORDER BY ph.created_at, ph.id)
        FROM public.provisional_photo AS ph
        LEFT JOIN public.app_user AS au ON au.auth_uid = ph.user_id
        WHERE ph.provisional_manhole_id = pm.id AND ph.status = 'published'), '[]'::jsonb),
      'hints', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', h.id, 'lat', h.lat, 'lng', h.lng, 'facility', h.facility,
                 'source_url', h.source_url, 'note', h.note, 'created_at', h.created_at,
                 'public_user_id', au.id, 'display_name', au.display_name)
               ORDER BY h.created_at, h.id)
        FROM public.provisional_location_hint AS h
        LEFT JOIN public.app_user AS au ON au.auth_uid = h.user_id
        WHERE h.provisional_manhole_id = pm.id AND h.status = 'published'), '[]'::jsonb))
    END
  FROM public.provisional_manhole AS pm
  JOIN public.prefecture AS pf ON pf.id = pm.prefecture_id
  WHERE pm.id = p_id AND pm.status = 'published'
$$;

-- 写真の配信用。公開中で、まだ正式IDへ移していない写真の保存キーだけ返す
-- （R2 の原本バケットは非公開。API がこのキーで短い署名URLを作って転送する）
CREATE OR REPLACE FUNCTION public.provisional_photo_key(p_photo_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT ph.storage_key
  FROM public.provisional_photo AS ph
  JOIN public.provisional_manhole AS pm ON pm.id = ph.provisional_manhole_id
  WHERE ph.id = p_photo_id AND ph.status = 'published' AND ph.transferred_visit_id IS NULL
    AND pm.status = 'published'
$$;

CREATE OR REPLACE FUNCTION public.provisional_is_accepting()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce((SELECT s.accepting FROM public.provisional_setting AS s WHERE s.id), false)
$$;

REVOKE ALL ON FUNCTION public.provisional_submit_photo(uuid, uuid, text, integer, text, text, integer, integer, integer, text, timestamptz, double precision, double precision, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provisional_add_hint(uuid, double precision, double precision, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provisional_report_target(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provisional_withdraw_photo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provisional_my_photos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provisional_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provisional_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provisional_photo_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provisional_is_accepting() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provisional_submit_photo(uuid, uuid, text, integer, text, text, integer, integer, integer, text, timestamptz, double precision, double precision, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.provisional_add_hint(uuid, double precision, double precision, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_report_target(text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_withdraw_photo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_my_photos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_list() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_detail(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_photo_key(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisional_is_accepting() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 運営の操作（provisional_operator のみ。CLI: tools/provisional-ops.js）
-- どれも1回の呼び出しが1トランザクション。書いた操作は operation_log に残す
-- ---------------------------------------------------------------------------

-- 権限の自己点検（scoring.audit_photo_scorer と同じ考え方。CLI は書き込みの前に毎回呼び、違反があれば止まる）
CREATE OR REPLACE FUNCTION provisional_ops.audit_operator()
RETURNS TABLE (kind text, detail text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'role_attribute', format('super=%s createrole=%s createdb=%s bypassrls=%s replication=%s login=%s inherit=%s connlimit=%s',
      r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication, r.rolcanlogin, r.rolinherit, r.rolconnlimit)
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = 'provisional_operator'
    AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication
         OR NOT r.rolcanlogin OR r.rolinherit OR r.rolconnlimit <> 2)

  UNION ALL
  SELECT 'member_of', m.roleid::pg_catalog.regrole::text
  FROM pg_catalog.pg_auth_members AS m
  WHERE m.member = 'provisional_operator'::pg_catalog.regrole

  UNION ALL
  SELECT 'can_become', m.member::pg_catalog.regrole::text
  FROM pg_catalog.pg_auth_members AS m
  WHERE m.roleid = 'provisional_operator'::pg_catalog.regrole AND (m.set_option OR m.inherit_option)

  UNION ALL
  SELECT 'reachable_relation', ns.nspname || '.' || c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f')
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND pg_catalog.has_schema_privilege('provisional_operator', ns.oid, 'USAGE')
    AND (pg_catalog.has_table_privilege('provisional_operator', c.oid,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
         OR pg_catalog.has_any_column_privilege('provisional_operator', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))

  UNION ALL
  SELECT 'reachable_sequence', ns.nspname || '.' || c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
  WHERE c.relkind = 'S'
    AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    AND CASE WHEN c.relkind = 'S'
             THEN pg_catalog.has_sequence_privilege('provisional_operator', c.oid, 'USAGE, SELECT, UPDATE')
             ELSE false END

  UNION ALL
  SELECT 'database_create', pg_catalog.current_database()
  WHERE pg_catalog.has_database_privilege('provisional_operator', pg_catalog.current_database(), 'CREATE')

  UNION ALL
  SELECT 'schema_create', ns.nspname
  FROM pg_catalog.pg_namespace AS ns
  WHERE pg_catalog.has_schema_privilege('provisional_operator', ns.oid, 'CREATE')

  UNION ALL
  SELECT 'secdef_function', f.sig
  FROM (
    SELECT ns.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS sig
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
    WHERE p.prosecdef
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_catalog.has_schema_privilege('provisional_operator', ns.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('provisional_operator', p.oid, 'EXECUTE')
  ) AS f
  WHERE f.sig NOT IN (
    'provisional_ops.recent(integer)',
    'provisional_ops.set_accepting(boolean, text)',
    'provisional_ops.set_status(text, uuid, text, text)',
    'provisional_ops.resolve_report(uuid, text)',
    'provisional_ops.merge(uuid, uuid, text)',
    'provisional_ops.preview_link(uuid, integer)',
    'provisional_ops.link(uuid, integer, text)'
  )

  UNION ALL
  SELECT 'ops_object', 'function ' || f.sig
  FROM (
    SELECT p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS sig
    FROM pg_catalog.pg_proc AS p
    WHERE p.pronamespace = 'provisional_ops'::pg_catalog.regnamespace
  ) AS f
  WHERE f.sig NOT IN (
    'require_accepting()', 'require_quota(text, uuid, bigint, integer)', 'audit_operator()',
    'recent(integer)', 'set_accepting(boolean, text)', 'set_status(text, uuid, text, text)',
    'resolve_report(uuid, text)', 'merge(uuid, uuid, text)', 'preview_link(uuid, integer)',
    'link(uuid, integer, text)'
  )

  UNION ALL
  SELECT 'function_attribute', format('%s owner=%s config=%s', p.proname,
           pg_catalog.pg_get_userbyid(p.proowner), coalesce(pg_catalog.array_to_string(p.proconfig, ','), 'NULL'))
  FROM pg_catalog.pg_proc AS p
  WHERE p.pronamespace = 'provisional_ops'::pg_catalog.regnamespace
    AND (pg_catalog.pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
         OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[])

  UNION ALL
  SELECT 'extension', 'pg_net ' || e.extversion
  FROM pg_catalog.pg_extension AS e
  WHERE e.extname = 'pg_net'
$$;

-- 直近の仮ポケふた・写真・手がかりと、未処理の通報（運営が見回るため。非表示も含む）
CREATE OR REPLACE FUNCTION provisional_ops.recent(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'accepting', (SELECT s.accepting FROM public.provisional_setting AS s WHERE s.id),
    'manholes', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'updated_at' DESC) FROM (
        SELECT jsonb_build_object(
          'id', pm.id, 'title', pm.title, 'prefecture_id', pm.prefecture_id, 'city', pm.city,
          'status', pm.status, 'state', pm.state, 'merged_into_id', pm.merged_into_id,
          'official_manhole_id', pm.official_manhole_id, 'created_at', pm.created_at, 'updated_at', pm.updated_at,
          'photos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'id', ph.id, 'status', ph.status, 'shot_at', ph.shot_at,
                     'shot_lat', ph.shot_lat, 'shot_lng', ph.shot_lng, 'created_at', ph.created_at,
                     'sha256', ph.sha256, 'transferred_visit_id', ph.transferred_visit_id) ORDER BY ph.created_at)
                   FROM public.provisional_photo AS ph WHERE ph.provisional_manhole_id = pm.id), '[]'::jsonb),
          'hints', coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'id', h.id, 'status', h.status, 'lat', h.lat, 'lng', h.lng, 'facility', h.facility,
                     'source_url', h.source_url, 'note', h.note, 'created_at', h.created_at) ORDER BY h.created_at)
                   FROM public.provisional_location_hint AS h WHERE h.provisional_manhole_id = pm.id), '[]'::jsonb)
        ) AS x
        FROM public.provisional_manhole AS pm
        ORDER BY pm.updated_at DESC
        LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)
      ) AS t), '[]'::jsonb),
    'open_reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'target_type', r.target_type, 'target_id', r.target_id,
                                          'reason', r.reason, 'created_at', r.created_at) ORDER BY r.created_at)
      FROM public.provisional_report AS r WHERE r.resolved_at IS NULL), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION provisional_ops.set_accepting(p_open boolean, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_open IS NULL OR coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'set_accepting: 開閉と理由が必要' USING ERRCODE = '22023';
  END IF;
  UPDATE public.provisional_setting AS s SET accepting = p_open, updated_at = now() WHERE s.id;
  INSERT INTO provisional_ops.operation_log (op, detail, reason)
  VALUES ('set_accepting', jsonb_build_object('accepting', p_open), p_reason);
  RETURN p_open;
END;
$$;

-- 非表示・再表示。p_kind: manhole / photo / hint。p_status: published / hidden
CREATE OR REPLACE FUNCTION provisional_ops.set_status(p_kind text, p_id uuid, p_status text, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_old text;
  v_state text;
  v_visit uuid;
BEGIN
  IF p_status NOT IN ('published', 'hidden') OR coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'set_status: 状態は published / hidden、理由が必要' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'manhole' THEN
    SELECT pm.status, pm.state INTO v_old, v_state FROM public.provisional_manhole AS pm WHERE pm.id = p_id FOR UPDATE;
    IF v_state = 'linked' THEN
      RAISE EXCEPTION 'set_status: 正式IDへ移し済み。写真は通常の visit の側で扱うこと' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.provisional_manhole AS pm SET status = p_status, updated_at = now() WHERE pm.id = p_id;
  ELSIF p_kind = 'photo' THEN
    SELECT ph.status, ph.transferred_visit_id INTO v_old, v_visit
    FROM public.provisional_photo AS ph WHERE ph.id = p_id FOR UPDATE;
    IF v_old = 'withdrawn' THEN
      RAISE EXCEPTION 'set_status: 本人が取り下げた写真は再表示しない' USING ERRCODE = 'P0001';
    END IF;
    -- 移した後は通常の写真（visit）が公開の本体。ここを変えても公開は止まらないので、成功にしない
    IF v_visit IS NOT NULL THEN
      RAISE EXCEPTION 'set_status: 正式IDへ移し済み。通常の写真（visit %）の側で扱うこと', v_visit
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.provisional_photo AS ph SET status = p_status WHERE ph.id = p_id;
  ELSIF p_kind = 'hint' THEN
    SELECT h.status INTO v_old FROM public.provisional_location_hint AS h WHERE h.id = p_id FOR UPDATE;
    UPDATE public.provisional_location_hint AS h SET status = p_status WHERE h.id = p_id;
  ELSE
    RAISE EXCEPTION 'set_status: 種類は manhole / photo / hint' USING ERRCODE = '22023';
  END IF;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'set_status: % % が見つからない', p_kind, p_id USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO provisional_ops.operation_log (op, target_id, detail, reason)
  VALUES ('set_status', p_id, jsonb_build_object('kind', p_kind, 'old', v_old, 'new', p_status), p_reason);
  RETURN v_old;
END;
$$;

CREATE OR REPLACE FUNCTION provisional_ops.resolve_report(p_report_id uuid, p_resolution text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF coalesce(btrim(p_resolution), '') = '' THEN
    RAISE EXCEPTION 'resolve_report: 対応内容が必要' USING ERRCODE = '22023';
  END IF;
  UPDATE public.provisional_report AS r SET resolved_at = now(), resolution = left(p_resolution, 200)
  WHERE r.id = p_report_id AND r.resolved_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO provisional_ops.operation_log (op, target_id, reason) VALUES ('resolve_report', p_report_id, p_resolution);
  RETURN true;
END;
$$;

-- 重複のまとめ: p_source の写真・手がかりを p_target へ付け替え、p_source を merged にする。
-- どちらも open かつ公開中に限る（merged / linked は対象にしない＝循環も移行済みとの競合も起きない。
-- 非表示の側は対象にしない＝まとめで運営の非表示が取り消されない）。
-- 2行を id の順にロックする（同時に逆向きのまとめが来てもデッドロックしない）
CREATE OR REPLACE FUNCTION provisional_ops.merge(p_source uuid, p_target uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_states jsonb;
  v_photos integer;
  v_hints integer;
BEGIN
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target OR coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'merge: 別々の2つと理由が必要' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_object_agg(pm.id::text, pm.state || '/' || pm.status) INTO v_states FROM (
    SELECT pm.id, pm.state, pm.status FROM public.provisional_manhole AS pm
    WHERE pm.id IN (p_source, p_target)
    ORDER BY pm.id
    FOR UPDATE
  ) AS pm;
  IF v_states IS NULL OR NOT (v_states ? p_source::text AND v_states ? p_target::text) THEN
    RAISE EXCEPTION 'merge: 見つからない' USING ERRCODE = 'P0002';
  END IF;
  -- 非表示の側をまとめると、中の写真・手がかり（個々は published のまま）が公開に戻る。先に unhide させる
  IF v_states->>p_source::text <> 'open/published' OR v_states->>p_target::text <> 'open/published' THEN
    RAISE EXCEPTION 'merge: どちらも open で公開中であること（%）', v_states USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.provisional_photo AS ph SET provisional_manhole_id = p_target WHERE ph.provisional_manhole_id = p_source;
  GET DIAGNOSTICS v_photos = ROW_COUNT;
  UPDATE public.provisional_location_hint AS h SET provisional_manhole_id = p_target WHERE h.provisional_manhole_id = p_source;
  GET DIAGNOSTICS v_hints = ROW_COUNT;
  UPDATE public.provisional_manhole AS pm SET state = 'merged', merged_into_id = p_target, updated_at = now()
  WHERE pm.id = p_source;
  UPDATE public.provisional_manhole AS pm SET updated_at = now() WHERE pm.id = p_target;

  INSERT INTO provisional_ops.operation_log (op, target_id, detail, reason)
  VALUES ('merge', p_source, jsonb_build_object('into', p_target, 'photos', v_photos, 'hints', v_hints), p_reason);
  RETURN jsonb_build_object('source', p_source, 'target', p_target, 'photos', v_photos, 'hints', v_hints);
END;
$$;

-- 正式IDへ移す前の確認。移る写真・移らない写真の数と、正式な蓋の情報を並べる
CREATE OR REPLACE FUNCTION provisional_ops.preview_link(p_id uuid, p_official_manhole_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'provisional', (SELECT jsonb_build_object('id', pm.id, 'title', pm.title, 'prefecture_id', pm.prefecture_id,
                      'city', pm.city, 'status', pm.status, 'state', pm.state,
                      'official_manhole_id', pm.official_manhole_id)
                    FROM public.provisional_manhole AS pm WHERE pm.id = p_id),
    'official', (SELECT jsonb_build_object('id', m.id, 'title', m.title, 'prefecture', m.prefecture,
                   'municipality', m.municipality, 'building', m.building, 'pokemons', m.pokemons)
                 FROM public.manhole AS m WHERE m.id = p_official_manhole_id),
    'photos_to_transfer', (SELECT count(*) FROM public.provisional_photo AS ph
                           WHERE ph.provisional_manhole_id = p_id AND ph.status = 'published'
                             AND ph.transferred_visit_id IS NULL),
    'photos_not_transferred', (SELECT count(*) FROM public.provisional_photo AS ph
                               WHERE ph.provisional_manhole_id = p_id AND ph.status <> 'published'),
    'photos_already_transferred', (SELECT count(*) FROM public.provisional_photo AS ph
                                   WHERE ph.provisional_manhole_id = p_id AND ph.transferred_visit_id IS NOT NULL),
    'contributors', (SELECT count(DISTINCT ph.user_id) FROM public.provisional_photo AS ph
                     WHERE ph.provisional_manhole_id = p_id AND ph.status = 'published'),
    -- 移す写真の撮影位置から正式な蓋までの距離（m）。遠ければ結びつけ違いを疑う。蓋に座標が無ければ null
    'photo_distances_m', (SELECT jsonb_agg(round(extensions.st_distance(
                              extensions.st_setsrid(extensions.st_makepoint(ph.shot_lng, ph.shot_lat), 4326)::extensions.geography,
                              mh.location)::numeric) ORDER BY ph.created_at)
                          FROM public.provisional_photo AS ph
                          JOIN public.manhole AS mh ON mh.id = p_official_manhole_id
                          WHERE ph.provisional_manhole_id = p_id AND ph.status = 'published'
                            AND ph.transferred_visit_id IS NULL)
  )
$$;

-- 正式IDへ移す。公開中の写真1枚ごとに visit 1件＋photo 1件を作る（別の人・別の日をまとめない）。
--   * visit.shot_location は写真の EXIF GPS（location_source は 'gps'。通常の投稿と同じ）
--   * 画像は動かさない（保存キーをそのまま photo.storage_key にする）。途中で失敗すれば全部戻る
--   * 再実行: 同じ正式IDなら、移していない公開写真だけを移す（移した写真は transferred_* で分かる）。
--     別の正式IDは拒否（誤った結びつけを再実行で上書きしない）
--   * 非表示・取り下げの写真は移さない
CREATE OR REPLACE FUNCTION provisional_ops.link(p_id uuid, p_official_manhole_id integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  m public.provisional_manhole%ROWTYPE;
  ph record;
  v_visit uuid;
  v_photo uuid;
  v_moved jsonb := '[]'::jsonb;
BEGIN
  IF p_id IS NULL OR p_official_manhole_id IS NULL OR coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'link: 仮ポケふた・正式ID・理由が必要' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.provisional_manhole AS pm WHERE pm.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link: 仮ポケふたが見つからない' USING ERRCODE = 'P0002';
  END IF;
  -- 非表示の仮ポケふたを移すと、写真が通常の公開に戻ってしまう（運営の判断を黙って取り消す）
  IF m.status = 'hidden' THEN
    RAISE EXCEPTION 'link: 非表示の仮ポケふたは移さない（先に unhide するか、そのままにする）' USING ERRCODE = 'P0001';
  END IF;
  IF m.state = 'merged' THEN
    RAISE EXCEPTION 'link: まとめ済み。まとめ先 % を結びつけること', m.merged_into_id USING ERRCODE = 'P0001';
  END IF;
  IF m.state = 'linked' AND m.official_manhole_id IS DISTINCT FROM p_official_manhole_id THEN
    RAISE EXCEPTION 'link: 既に正式ID % へ結びつけ済み（% は拒否）', m.official_manhole_id, p_official_manhole_id
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.manhole AS mh WHERE mh.id = p_official_manhole_id) THEN
    RAISE EXCEPTION 'link: 正式ID % が manhole に無い', p_official_manhole_id USING ERRCODE = 'P0002';
  END IF;

  FOR ph IN
    SELECT p.* FROM public.provisional_photo AS p
    WHERE p.provisional_manhole_id = p_id AND p.status = 'published' AND p.transferred_visit_id IS NULL
    ORDER BY p.created_at, p.id
    FOR UPDATE
  LOOP
    INSERT INTO public.visit (user_id, manhole_id, shot_at, shot_location, comment, is_public)
    VALUES (ph.user_id, p_official_manhole_id, ph.shot_at,
            extensions.st_setsrid(extensions.st_makepoint(ph.shot_lng, ph.shot_lat), 4326)::extensions.geography,
            ph.comment, true)
    RETURNING id INTO v_visit;

    INSERT INTO public.photo (visit_id, manhole_id, storage_key, file_size, content_type, width, height, sha256)
    VALUES (v_visit, p_official_manhole_id, ph.storage_key, ph.file_size, 'image/jpeg', ph.width, ph.height, ph.sha256)
    RETURNING id INTO v_photo;

    UPDATE public.provisional_photo AS p
    SET transferred_visit_id = v_visit, transferred_photo_id = v_photo, transferred_at = now()
    WHERE p.id = ph.id;

    v_moved := v_moved || jsonb_build_object('provisional_photo_id', ph.id, 'visit_id', v_visit, 'photo_id', v_photo);
  END LOOP;

  UPDATE public.provisional_manhole AS pm
  SET state = 'linked', official_manhole_id = p_official_manhole_id, updated_at = now()
  WHERE pm.id = p_id;

  INSERT INTO provisional_ops.operation_log (op, target_id, detail, reason)
  VALUES ('link', p_id, jsonb_build_object('official_manhole_id', p_official_manhole_id, 'moved', v_moved), p_reason);
  RETURN jsonb_build_object('id', p_id, 'official_manhole_id', p_official_manhole_id, 'moved', v_moved);
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'provisional_ops.require_accepting()',
    'provisional_ops.require_quota(text, uuid, bigint, integer)',
    'provisional_ops.audit_operator()',
    'provisional_ops.recent(integer)',
    'provisional_ops.set_accepting(boolean, text)',
    'provisional_ops.set_status(text, uuid, text, text)',
    'provisional_ops.resolve_report(uuid, text)',
    'provisional_ops.merge(uuid, uuid, text)',
    'provisional_ops.preview_link(uuid, integer)',
    'provisional_ops.link(uuid, integer, text)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'provisional_ops.audit_operator()',
    'provisional_ops.recent(integer)',
    'provisional_ops.set_accepting(boolean, text)',
    'provisional_ops.set_status(text, uuid, text, text)',
    'provisional_ops.resolve_report(uuid, text)',
    'provisional_ops.merge(uuid, uuid, text)',
    'provisional_ops.preview_link(uuid, integer)',
    'provisional_ops.link(uuid, integer, text)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO provisional_operator', f);
  END LOOP;
END $$;
