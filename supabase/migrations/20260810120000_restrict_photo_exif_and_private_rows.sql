-- photo の公開面を絞る
--
-- 背景（2026-08-10 に本番を実測して判明）:
--
-- Supabase は anon キーで PostgREST を直接叩ける設計で、アプリの API 層は
-- セキュリティ境界ではない。境界は GRANT と RLS だけ。しかし photo には
--   - テーブル単位の GRANT SELECT（列ごとのACLは1つも無い）
--   - RLS の SELECT ポリシー `public_select_photos` が `USING (true)`
-- が入っており、非公開訪問の写真行を含めて全行・全列が anon から読めていた。
--
-- 実害:
--   * exif に HostComputer（Apple 端末の端末名。「〇〇のiPhone」のように実名を
--     含みやすい）が 446 枚分入っており、うち 323 枚は公開写真。写真を公開した人も
--     端末名の公開には同意していない。
--   * 非公開訪問 167 件（14ユーザー）に紐づく写真 166 枚のメタデータが読めていた。
--     visit 行は保護されているのでユーザーIDは直接引けないが、
--     exif の端末指紋（HostComputer + Model + LensModel）で公開写真と突き合わせると
--     86 枚が持ち主に辿れ、うち 23 枚は個人が一意に確定する状態だった。
--     manhole_id は公開データなので、撮影時刻と合わせて「いつどこに居たか」が復元できた。
--
-- 画像本体は漏れていない（R2 は非公開バケットで、署名にはサーバー側の資格情報が要る）。
-- アプリの API も canView を自前で判定しており正しい。漏れていたのは直叩き経路だけ。
--
-- design_manhole は #169 で「テーブル単位 GRANT を与えず、見せてよい列だけ名指しで
-- GRANT する」形になっており、exif はそこに含まれていない。photo はその設計が
-- 適用される前に作られたまま取り残されていた。ここでは同じ形に揃える。

-- ---------------------------------------------------------------------------
-- 1. 列を名指しにする
--
-- テーブル単位の GRANT は「今ある列も、これから増える列も全部」を意味する。
-- exif が漏れたのは誰かが exif を公開すると決めたからではなく、
-- 不正検知のために列を足した瞬間に自動的に対象へ入ったから。
-- 列を名指しにしておけば、将来また列が増えても自動では漏れない。
--
-- storage_key は残す。/api/photo/[id] が利用者のセッション（anon 含む）で読んでおり、
-- 外すと公開写真の配信が壊れる。R2 が非公開なのでキー単体では画像を取得できない。
-- （issue #170 は「内部キーを公開する必要はない」としている。service_role 経由へ
--   寄せる改修は別途）
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.photo FROM anon, authenticated;

GRANT SELECT (
  id,
  visit_id,
  manhole_id,
  storage_key,
  original_name,
  file_size,
  content_type,
  width,
  height,
  sha256,
  thumbnail_320,
  thumbnail_800,
  thumbnail_1600,
  created_at
) ON public.photo TO anon, authenticated;
-- exif は意図的に含めない。クライアント・サーバーとも select している箇所は無い
-- （2026-08-10 時点で grep 済み）。GPS詐称検知のための内部データであり、
-- 閲覧者に見せる必要がない。

-- ---------------------------------------------------------------------------
-- 2. 行を親 visit の公開状態に従わせる
--
-- 既存の `users_select_own_photos`（所有者向け）はそのまま残す。RLS の複数ポリシーは
-- OR で評価されるので、「親 visit が公開」または「自分の写真」になる。
--
-- アプリ側の影響は無い見込み:
--   * manhole-ogp.ts / shared-photo.ts は service_role なので RLS を迂回する
--   * /api/photo/[id] と /api/image-upload は visit へ !inner 結合しており、
--     他人の非公開写真は visit 側の RLS で既に弾かれて 404 になっている。
--     この変更で 404 になる箇所が一段早まるだけで、結果は変わらない
--   * users/[userId]/visits/opengraph-image は .eq('visit.is_public', true) を明示している
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS public_select_photos ON public.photo;

CREATE POLICY public_select_photos ON public.photo
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.visit v
      WHERE v.id = photo.visit_id
        AND v.is_public
    )
  );

COMMENT ON POLICY public_select_photos ON public.photo IS
  '公開訪問の写真だけを誰でも読める。自分の写真は users_select_own_photos が別に許可する。'
  ' 以前は USING (true) で、非公開訪問の写真行も anon から読めていた（2026-08-10 修正）。';
