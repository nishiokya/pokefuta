-- #452 の対象外だった、なまこぷりんさんの2026-11-08のポケふた投稿3件を移す。
-- ae95834b 土佐 → 491 / 2fefa2e0 佐川 → 495 / 207ff726 いの → 494。
-- 本番を読み取り確認済み: 全件 published / pokefuta、移行先のvisit・同じ画像のphotoは無し。
-- 投稿者の公開ID・EXIF撮影時刻・画像キー・公式との距離を検証してから移す。
-- visit + photo に投稿者・撮影日時/GPS・説明・投稿日時を引き継ぎ、元投稿はhiddenにする。
-- 画像は移動せず、#452 の deriveSmallKey によるデザインふた縮小版を利用する。
-- 対象ゼロの開発DBはスキップ。一部欠落・重複は例外でDO全体を取り消す。再実行は何もしない。
-- 本番適用は別途手動。認証UIDや秘密情報は記録しない。
--
-- 戻す場合はトランザクション内で対象3件をロックし、storage_keyで移行先photo/visitを特定する。
-- 投稿者・公式番号を照合し、追加写真・いいね・コメントなどが無いことを確認してから
-- 対象photoと空になったvisitだけ削除し、元投稿をpublishedへ戻す。
-- 追加データがあれば一括削除せず、保持方法を決める。画像オブジェクトは削除しない。
DO $$
DECLARE
  t record;
  d public.design_manhole%ROWTYPE;
  v_uid uuid;
  v_visit uuid;
  v_moved integer := 0;
  v_already integer := 0;
  v_n integer;
BEGIN
  -- 本番のデータを移すだけの作業。3 件の投稿が 1 件も無い DB（ローカルの db reset など）では何もしない。
  -- 1 件でもあれば、下の検査をすべて通す（一部だけ欠けているのは想定外なので止まる）
  IF NOT EXISTS (SELECT 1 FROM public.design_manhole WHERE id IN (
       'ae95834b-f4c3-41c4-b88e-2dd0ecaf3e34',
       '2fefa2e0-ea7a-401a-be29-265cdc2541d4',
       '207ff726-d97b-4fe9-8f18-2ebd59963706')) THEN
    RAISE NOTICE 'link design posts: 対象の投稿が無い DB なので何もしない';
    RETURN;
  END IF;

  FOR t IN
    SELECT * FROM (VALUES
      -- 投稿, 投稿者の公開ID, 公式番号, EXIF撮影時刻, 元画像キー
      ('ae95834b-f4c3-41c4-b88e-2dd0ecaf3e34'::uuid, '4aa3d778-ce61-43ee-870c-34a9a2f366a5'::uuid, 491, '2026-11-08 07:26:05+00'::timestamptz, 'photos/design/original/2026/11/7ff8a14b-0c61-498c-9fb9-ef4e2a930fa8.jpg'),
      ('2fefa2e0-ea7a-401a-be29-265cdc2541d4'::uuid, '4aa3d778-ce61-43ee-870c-34a9a2f366a5'::uuid, 495, '2026-11-08 06:51:14+00'::timestamptz, 'photos/design/original/2026/11/72b84ed4-dbcd-41c1-a1f9-6e1bbd382a0b.jpg'),
      ('207ff726-d97b-4fe9-8f18-2ebd59963706'::uuid, '4aa3d778-ce61-43ee-870c-34a9a2f366a5'::uuid, 494, '2026-11-08 06:24:06+00'::timestamptz, 'photos/design/original/2026/11/bbc37573-5a76-4557-bf86-aebd2e0c5ec3.jpg')
    ) AS x(design_id, user_public_id, manhole_id, shot_at, storage_key)
  LOOP
    SELECT auth_uid INTO v_uid FROM public.app_user WHERE id = t.user_public_id;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'app_user not found: %', t.user_public_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.manhole WHERE id = t.manhole_id) THEN
      RAISE EXCEPTION 'manhole % が無い（20261110090000 を先に当てる）', t.manhole_id;
    END IF;

    SELECT * INTO d FROM public.design_manhole WHERE id = t.design_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design_manhole % が無い', t.design_id;
    END IF;
    IF d.created_by IS DISTINCT FROM v_uid OR d.kind IS DISTINCT FROM 'pokefuta'
       OR d.storage_key IS DISTINCT FROM t.storage_key
       OR (d.exif->>'DateTimeOriginal')::timestamptz IS DISTINCT FROM t.shot_at THEN
      RAISE EXCEPTION 'design_manhole % が期待と違う（移さずに止める）', t.design_id;
    END IF;

    -- 取り違えや位置の変更があれば止める。通常の投稿と同じ50m以内。
    IF d.latitude IS NULL OR d.longitude IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.manhole m WHERE m.id = t.manhole_id
        AND extensions.st_dwithin(m.location,
          extensions.st_setsrid(extensions.st_makepoint(d.longitude, d.latitude), 4326)::extensions.geography, 50)
    ) THEN
      RAISE EXCEPTION 'design_manhole % の位置が公式の蓋から50m以内でない', t.design_id;
    END IF;

    -- 移し済み: 同じ画像キーの photo が、同じ投稿者・同じ蓋の visit に付いている
    IF EXISTS (SELECT 1 FROM public.photo AS p JOIN public.visit AS v ON v.id = p.visit_id
               WHERE p.storage_key = d.storage_key AND p.manhole_id = t.manhole_id
                 AND v.user_id = v_uid AND v.manhole_id = t.manhole_id) THEN
      IF d.status <> 'hidden' THEN
        RAISE EXCEPTION 'design_manhole % は移し済みなのに hidden でない', t.design_id;
      END IF;
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    IF d.status <> 'published' THEN
      RAISE EXCEPTION 'design_manhole % の status が %（published のはず）', t.design_id, d.status;
    END IF;
    IF EXISTS (SELECT 1 FROM public.photo WHERE storage_key = d.storage_key) THEN
      RAISE EXCEPTION '画像キー % がすでに別の photo で使われている', d.storage_key;
    END IF;
    -- 投稿者がこの蓋の visit をすでに持っているなら、重複を作らずに止めて人が決める
    IF EXISTS (SELECT 1 FROM public.visit WHERE user_id = v_uid AND manhole_id = t.manhole_id) THEN
      RAISE EXCEPTION '投稿者 % は manhole % の visit をすでに持っている（止める）', t.user_public_id, t.manhole_id;
    END IF;

    INSERT INTO public.visit (user_id, manhole_id, shot_at, shot_location, comment, is_public, created_at, updated_at)
    VALUES (v_uid, t.manhole_id, t.shot_at,
            extensions.st_setsrid(extensions.st_makepoint(d.longitude, d.latitude), 4326)::extensions.geography,
            nullif(btrim(coalesce(d.description, '')), ''), true, d.created_at, now())
    RETURNING id INTO v_visit;

    INSERT INTO public.photo (visit_id, manhole_id, storage_key, file_size, content_type, width, height, exif, created_at)
    VALUES (v_visit, t.manhole_id, d.storage_key, d.file_size, d.content_type, d.width, d.height, d.exif, d.created_at);

    UPDATE public.design_manhole SET status = 'hidden' WHERE id = t.design_id AND status = 'published';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'design_manhole % を hidden にできなかった', t.design_id;
    END IF;
    v_moved := v_moved + 1;
  END LOOP;

  IF v_moved + v_already <> 3 THEN
    RAISE EXCEPTION '移した % 件 + 移し済み % 件（3 件のはず）', v_moved, v_already;
  END IF;
  RAISE NOTICE 'link design posts: moved %, already %', v_moved, v_already;
END
$$;
