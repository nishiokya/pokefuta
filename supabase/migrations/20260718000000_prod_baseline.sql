-- 本番スキーマのベースライン（supabase db dump で取得: 2026-07-18, project: kbwzwgsjqvflgfauzcpn）
-- database/migrations/025 までが適用済みの状態。再取得: npx supabase db dump -f <このファイル>



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."shot_context_label" AS ENUM (
    'centered_clean',
    'selfie_with_manhole',
    'wide_context',
    'signage_info',
    'partial_occluded',
    'not_relevant',
    'low_quality'
);


ALTER TYPE "public"."shot_context_label" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_update_all_prefectures_completion"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_completed_prefectures INT;
  v_total_prefectures INT;
BEGIN
  -- Count active badges
  SELECT COUNT(*) INTO v_completed_prefectures
  FROM prefecture_badge
  WHERE user_id = p_user_id AND status = 'active';
  
  -- Count total prefectures
  SELECT COUNT(*) INTO v_total_prefectures
  FROM prefecture;
  
  -- If user has completed all prefectures, update the flag
  IF v_completed_prefectures = v_total_prefectures THEN
    UPDATE app_user
    SET
      all_prefectures_completed_at = NOW(),
      all_prefectures_outdated_at = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."check_and_update_all_prefectures_completion"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_prefecture_badge"("p_user_id" "uuid", "p_prefecture_id" integer) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_badge_id UUID;
  v_prefecture_name TEXT;
  v_total_manholes INT;
  v_visited_count INT;
BEGIN
  -- Get prefecture name for matching with manhole.prefecture
  SELECT name INTO v_prefecture_name
  FROM prefecture
  WHERE id = p_prefecture_id;
  
  IF v_prefecture_name IS NULL THEN
    RETURN NULL;  -- Prefecture not found
  END IF;
  
  -- Count total manholes in prefecture (match by string)
  SELECT COUNT(*) INTO v_total_manholes
  FROM manhole m
  WHERE m.prefecture = v_prefecture_name;
  
  -- Count visited distinct manholes by user
  SELECT COUNT(DISTINCT v.manhole_id) INTO v_visited_count
  FROM visit v
  INNER JOIN manhole m ON v.manhole_id = m.id
  WHERE v.user_id = p_user_id AND m.prefecture = v_prefecture_name;
  
  -- Only create badge if all manholes visited
  IF v_visited_count >= v_total_manholes AND v_total_manholes > 0 THEN
    -- Insert new badge
    INSERT INTO prefecture_badge (
      user_id,
      prefecture_id,
      status,
      completion_percentage,
      manhole_count_at_completion,
      visited_manhole_count
    ) VALUES (
      p_user_id,
      p_prefecture_id,
      'active',
      100,
      v_total_manholes,
      v_visited_count
    )
    RETURNING id INTO v_badge_id;
    
    -- Check if user has completed all prefectures
    PERFORM check_and_update_all_prefectures_completion(p_user_id);
    
    RETURN v_badge_id;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."create_prefecture_badge"("p_user_id" "uuid", "p_prefecture_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_app_user_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT id FROM app_user WHERE auth_uid = auth.uid();
  $$;


ALTER FUNCTION "public"."get_my_app_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_own_profile"() RETURNS TABLE("public_user_id" "uuid", "display_name" "text", "bio" "text", "x_url" "text", "instagram_url" "text", "profile_is_customized" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT au.id, au.display_name, au.bio, au.x_url, au.instagram_url, au.profile_is_customized
  FROM app_user au
  WHERE au.auth_uid = auth.uid();
$$;


ALTER FUNCTION "public"."get_own_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_display_names"("p_auth_uids" "uuid"[]) RETURNS TABLE("auth_uid" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY
  SELECT au.auth_uid, au.display_name
  FROM app_user au
  WHERE au.auth_uid = ANY(p_auth_uids)
    AND (
      au.auth_uid = auth.uid()
      OR EXISTS (
        SELECT 1 FROM visit v
        WHERE v.user_id = au.auth_uid AND v.is_public = true
      )
      OR EXISTS (
        SELECT 1 FROM visit_comment vc
        JOIN visit v ON v.id = vc.visit_id
        WHERE vc.user_id = au.auth_uid AND v.is_public = true
      )
    );

  IF to_regclass('public.manhole_comment') IS NOT NULL THEN
    RETURN QUERY EXECUTE $query$
      SELECT au.auth_uid, au.display_name
      FROM app_user au
      WHERE au.auth_uid = ANY($1)
        AND EXISTS (
          SELECT 1 FROM manhole_comment mc
          WHERE mc.user_id = au.auth_uid
        )
    $query$ USING p_auth_uids;
  END IF;
END;
$_$;


ALTER FUNCTION "public"."get_public_display_names"("p_auth_uids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_user_ids"("p_auth_uids" "uuid"[]) RETURNS TABLE("auth_uid" "uuid", "public_user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT au.auth_uid, au.id
  FROM app_user au
  WHERE au.auth_uid = ANY(p_auth_uids)
    AND EXISTS (
      SELECT 1 FROM visit v
      WHERE v.user_id = au.auth_uid AND v.is_public = true
    );
$$;


ALTER FUNCTION "public"."get_public_user_ids"("p_auth_uids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_user_info"("p_user_id" "uuid") RETURNS TABLE("auth_uid" "uuid", "display_name" "text", "bio" "text", "x_url" "text", "instagram_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT au.auth_uid, au.display_name, au.bio, au.x_url, au.instagram_url
  FROM app_user au
  WHERE au.id = p_user_id;
$$;


ALTER FUNCTION "public"."get_public_user_info"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reaction_count"("p_target_type" "text", "p_target_id" "uuid" DEFAULT NULL::"uuid", "p_manhole_id" integer DEFAULT NULL::integer, "p_reaction_type" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_manhole_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM reaction
    WHERE target_type = p_target_type
      AND manhole_id = p_manhole_id
      AND (p_reaction_type IS NULL OR reaction_type = p_reaction_type);
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM reaction
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND (p_reaction_type IS NULL OR reaction_type = p_reaction_type);
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;


ALTER FUNCTION "public"."get_reaction_count"("p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_stats"() RETURNS TABLE("total_manhole" bigint, "total_posts" bigint, "total_users" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    (SELECT COUNT(*) FROM public.manhole)::BIGINT,
    (SELECT COUNT(*) FROM public.photo)::BIGINT,
    (SELECT COUNT(*) FROM public.app_user)::BIGINT;
$$;


ALTER FUNCTION "public"."get_site_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_own_public_profile"("p_display_name" "text", "p_bio" "text", "p_x_url" "text", "p_instagram_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_display_name text := nullif(btrim(p_display_name), '');
  v_bio text := nullif(btrim(p_bio), '');
  v_x_url text := nullif(btrim(p_x_url), '');
  v_instagram_url text := nullif(btrim(p_instagram_url), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;
  IF char_length(v_display_name) > 40 OR char_length(COALESCE(v_bio, '')) > 160 THEN
    RAISE EXCEPTION 'Profile text is too long';
  END IF;
  IF v_x_url IS NOT NULL AND v_x_url !~* '^https://(www\.)?(x\.com|twitter\.com)/[^/[:space:]]+/?$' THEN
    RAISE EXCEPTION 'Invalid X URL';
  END IF;
  IF v_instagram_url IS NOT NULL AND v_instagram_url !~* '^https://(www\.)?instagram\.com/[^/[:space:]]+/?$' THEN
    RAISE EXCEPTION 'Invalid Instagram URL';
  END IF;

  -- app_user は投稿・いいね等の初回書き込み時に遅延作成されるため、
  -- 行がまだ無いユーザーでもプロフィール保存できるよう upsert にする。
  INSERT INTO app_user (auth_uid, display_name, bio, x_url, instagram_url, profile_is_customized)
  VALUES (auth.uid(), v_display_name, v_bio, v_x_url, v_instagram_url, true)
  ON CONFLICT (auth_uid) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        x_url = EXCLUDED.x_url,
        instagram_url = EXCLUDED.instagram_url,
        profile_is_customized = true,
        updated_at = now();
END;
$_$;


ALTER FUNCTION "public"."update_own_public_profile"("p_display_name" "text", "p_bio" "text", "p_x_url" "text", "p_instagram_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_prefecture_badges_on_manhole_add"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_prefecture_id INTEGER;
BEGIN
  -- Find the prefecture ID by matching the prefecture name
  SELECT p.id INTO v_prefecture_id
  FROM prefecture p
  WHERE p.name = NEW.prefecture;
  
  -- If prefecture not found, just return (new prefecture not in master table)
  IF v_prefecture_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Mark all active badges for this prefecture as outdated
  UPDATE prefecture_badge
  SET
    status = 'outdated',
    outdated_at = NOW(),
    updated_at = NOW()
  WHERE
    prefecture_id = v_prefecture_id
    AND status = 'active';
  
  -- Clear the global all_prefectures_completed_at if any user had it
  -- (since a prefecture badge is now outdated)
  UPDATE app_user
  SET
    all_prefectures_outdated_at = NOW(),
    updated_at = NOW()
  WHERE
    id IN (
      SELECT user_id FROM prefecture_badge
      WHERE prefecture_id = v_prefecture_id AND status = 'outdated'
    );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_prefecture_badges_on_manhole_add"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_app_user"("p_auth_uid" "uuid", "p_display_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR p_auth_uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO app_user (auth_uid, display_name)
  VALUES (p_auth_uid, p_display_name)
  ON CONFLICT (auth_uid) DO UPDATE
    SET display_name = EXCLUDED.display_name
    WHERE NOT app_user.profile_is_customized
      AND p_display_name IS NOT NULL
      AND app_user.display_name IS DISTINCT FROM EXCLUDED.display_name;
END;
$$;


ALTER FUNCTION "public"."upsert_app_user"("p_auth_uid" "uuid", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_reaction"("p_user_id" "uuid", "p_target_type" "text", "p_target_id" "uuid" DEFAULT NULL::"uuid", "p_manhole_id" integer DEFAULT NULL::integer, "p_reaction_type" "text" DEFAULT 'like'::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_manhole_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM reaction
      WHERE user_id = p_user_id
        AND target_type = p_target_type
        AND manhole_id = p_manhole_id
        AND reaction_type = p_reaction_type
    ) INTO v_exists;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM reaction
      WHERE user_id = p_user_id
        AND target_type = p_target_type
        AND target_id = p_target_id
        AND reaction_type = p_reaction_type
    ) INTO v_exists;
  END IF;

  RETURN v_exists;
END;
$$;


ALTER FUNCTION "public"."user_has_reaction"("p_user_id" "uuid", "p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_user" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_uid" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "all_prefectures_completed_at" timestamp with time zone,
    "all_prefectures_outdated_at" timestamp with time zone,
    "bio" "text",
    "x_url" "text",
    "instagram_url" "text",
    "profile_is_customized" boolean DEFAULT false NOT NULL,
    CONSTRAINT "app_user_bio_length" CHECK ((("bio" IS NULL) OR ("char_length"("bio") <= 160))),
    CONSTRAINT "app_user_display_name_length" CHECK ((("display_name" IS NULL) OR ("char_length"("display_name") <= 40))),
    CONSTRAINT "app_user_instagram_url_length" CHECK ((("instagram_url" IS NULL) OR ("char_length"("instagram_url") <= 300))),
    CONSTRAINT "app_user_x_url_length" CHECK ((("x_url" IS NULL) OR ("char_length"("x_url") <= 300)))
);


ALTER TABLE "public"."app_user" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."design_manhole" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "description" "text",
    "submitter_name" "text",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL,
    "storage_key" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "file_size" integer,
    "width" integer,
    "height" integer,
    "exif" "jsonb",
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "design_manhole_description_length" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 1000))),
    CONSTRAINT "design_manhole_japan_bounds" CHECK (((("latitude" >= (20)::double precision) AND ("latitude" <= (46)::double precision)) AND (("longitude" >= (122)::double precision) AND ("longitude" <= (154)::double precision)))),
    CONSTRAINT "design_manhole_status_check" CHECK (("status" = ANY (ARRAY['published'::"text", 'hidden'::"text"]))),
    CONSTRAINT "design_manhole_storage_key_prefix" CHECK (("storage_key" ~~ 'photos/design/original/%'::"text")),
    CONSTRAINT "design_manhole_submitter_name_length" CHECK ((("submitter_name" IS NULL) OR ("char_length"("submitter_name") <= 50))),
    CONSTRAINT "design_manhole_title_length" CHECK ((("title" IS NULL) OR ("char_length"("title") <= 100)))
);


ALTER TABLE "public"."design_manhole" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manhole" (
    "id" bigint NOT NULL,
    "title" "text",
    "prefecture" "text",
    "municipality" "text",
    "location" "extensions"."geography",
    "pokemons" "text"[],
    "detail_url" "text",
    "source_last_checked" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prefecture_id" integer,
    "prefecture_code" character varying(2),
    "region" "text",
    "is_active" boolean DEFAULT true,
    "last_verified_at" timestamp with time zone DEFAULT "now"(),
    "data_source" "text",
    "address" "text",
    "prefecture_site_url" "text",
    "address_norm" "text",
    "official_url" "text",
    "titles" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "hashtags" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "title_tags" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "building" "text"
);


ALTER TABLE "public"."manhole" OWNER TO "postgres";


COMMENT ON TABLE "public"."manhole" IS 'manhole';



COMMENT ON COLUMN "public"."manhole"."prefecture_id" IS '都道府県 ID (prefecture テーブルへの外部キー)';



COMMENT ON COLUMN "public"."manhole"."prefecture_code" IS '都道府県コード (01-47)';



COMMENT ON COLUMN "public"."manhole"."region" IS '地域名 (北海道、東北、関東、中部、関西、中国、四国、九州沖縄)';



COMMENT ON COLUMN "public"."manhole"."is_active" IS 'アクティブフラグ (true: 存在、false: 廃止/休止)';



COMMENT ON COLUMN "public"."manhole"."last_verified_at" IS 'データが最後に確認された日時';



COMMENT ON COLUMN "public"."manhole"."data_source" IS 'データのソース/スクレイパーバージョン';



COMMENT ON COLUMN "public"."manhole"."address" IS '詳細住所 (例: 東京都稲城市矢野口4015-1)';



COMMENT ON COLUMN "public"."manhole"."prefecture_site_url" IS '都道府県の公式サイトURL';



COMMENT ON COLUMN "public"."manhole"."address_norm" IS '正規化済み住所（pokefuta.ndjson / manhole title metadata 由来）';



COMMENT ON COLUMN "public"."manhole"."official_url" IS '公式案内URL（pokefuta.ndjson 由来）';



COMMENT ON COLUMN "public"."manhole"."titles" IS 'SNS/詳細表示用の称号タグ配列（upstream generated titles）';



COMMENT ON COLUMN "public"."manhole"."hashtags" IS '称号由来の共有用ハッシュタグ（#付き）';



COMMENT ON COLUMN "public"."manhole"."title_tags" IS '称号キー配列（検索・絞り込み用）';



CREATE TABLE IF NOT EXISTS "public"."manhole_comment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manhole_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "parent_comment_id" "uuid",
    "is_edited" boolean DEFAULT false,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."manhole_comment" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."manhole_comment_stats" WITH ("security_invoker"='on') AS
 SELECT "manhole_id",
    "count"(*) AS "comment_count",
    "count"(DISTINCT "user_id") AS "commenter_count"
   FROM "public"."manhole_comment"
  WHERE ("parent_comment_id" IS NULL)
  GROUP BY "manhole_id";


ALTER VIEW "public"."manhole_comment_stats" OWNER TO "postgres";


ALTER TABLE "public"."manhole" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."manhole_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."reaction" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "manhole_id" integer,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reaction" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."manhole_reaction_stats" WITH ("security_invoker"='on') AS
 SELECT "manhole_id",
    "reaction_type",
    "count"(*) AS "count"
   FROM "public"."reaction"
  WHERE (("target_type" = 'manhole'::"text") AND ("manhole_id" IS NOT NULL))
  GROUP BY "manhole_id", "reaction_type";


ALTER VIEW "public"."manhole_reaction_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid",
    "manhole_id" integer NOT NULL,
    "storage_key" "text" NOT NULL,
    "original_name" "text",
    "file_size" integer,
    "content_type" "text",
    "width" integer,
    "height" integer,
    "exif" "jsonb",
    "sha256" "text",
    "thumbnail_320" "text",
    "thumbnail_800" "text",
    "thumbnail_1600" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."photo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photo_context_image" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manhole_id" integer NOT NULL,
    "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL,
    "storage_key" "text" NOT NULL,
    "original_name" "text",
    "content_type" "text" NOT NULL,
    "file_size" integer,
    "width" integer,
    "height" integer,
    "sha256" "text",
    "exif" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "shot_context_label" "public"."shot_context_label",
    "shot_context_confidence" double precision,
    "shot_context_confidences" "jsonb",
    "source_platform" "text" DEFAULT 'ios'::"text" NOT NULL,
    "app_version" "text",
    "device_model" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manhole_classifier_label" "text",
    "manhole_classifier_confidence" double precision,
    "manhole_detection_result" "jsonb",
    "overlay_quality_grade" "text",
    "annotation_manhole_label" "text",
    "annotation_shot_context_label" "public"."shot_context_label",
    CONSTRAINT "photo_context_image_annotation_manhole_label" CHECK ((("annotation_manhole_label" IS NULL) OR ("annotation_manhole_label" = ANY (ARRAY['manhole'::"text", 'not_manhole'::"text"])))),
    CONSTRAINT "photo_context_image_content_type" CHECK (("content_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/heic'::"text", 'image/heif'::"text", 'image/webp'::"text"]))),
    CONSTRAINT "photo_context_image_ios_only" CHECK (("source_platform" = 'ios'::"text")),
    CONSTRAINT "photo_context_image_manhole_classifier_confidence" CHECK ((("manhole_classifier_confidence" IS NULL) OR (("manhole_classifier_confidence" >= (0)::double precision) AND ("manhole_classifier_confidence" <= (1)::double precision)))),
    CONSTRAINT "photo_context_image_manhole_classifier_label" CHECK ((("manhole_classifier_label" IS NULL) OR ("manhole_classifier_label" = ANY (ARRAY['manhole'::"text", 'not_manhole'::"text"])))),
    CONSTRAINT "photo_context_image_overlay_quality_grade" CHECK ((("overlay_quality_grade" IS NULL) OR ("overlay_quality_grade" = ANY (ARRAY['p'::"text", 'e'::"text", 'g'::"text", 'f'::"text", 'b'::"text"]))))
);


ALTER TABLE "public"."photo_context_image" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prefecture" (
    "id" integer NOT NULL,
    "code" character varying(2) NOT NULL,
    "name" character varying(10) NOT NULL,
    "name_en" character varying(50),
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prefecture" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prefecture_badge" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "prefecture_id" integer NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "acquired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outdated_at" timestamp with time zone,
    "completion_percentage" numeric(5,2) DEFAULT 100 NOT NULL,
    "manhole_count_at_completion" integer DEFAULT 0 NOT NULL,
    "visited_manhole_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prefecture_badge_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'outdated'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."prefecture_badge" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."prefecture_completion_tracker" AS
SELECT
    NULL::"uuid" AS "badge_id",
    NULL::"uuid" AS "user_id",
    NULL::integer AS "prefecture_id",
    NULL::character varying(2) AS "code",
    NULL::character varying(10) AS "name",
    NULL::character varying(50) AS "name_en",
    NULL::"text" AS "status",
    NULL::bigint AS "total_manholes_now",
    NULL::bigint AS "visited_manholes_count",
    NULL::numeric AS "current_completion_percentage",
    NULL::timestamp with time zone AS "acquired_at",
    NULL::timestamp with time zone AS "outdated_at",
    NULL::integer AS "manhole_count_at_completion",
    NULL::integer AS "visited_manhole_count",
    NULL::numeric(5,2) AS "completion_percentage",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at";


ALTER VIEW "public"."prefecture_completion_tracker" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."prefecture_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."prefecture_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."prefecture_id_seq" OWNED BY "public"."prefecture"."id";



CREATE TABLE IF NOT EXISTS "public"."visit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "manhole_id" integer,
    "shot_location" "extensions"."geography"(Point,4326),
    "shot_at" timestamp with time zone NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_public" boolean DEFAULT true,
    "comment" "text"
);


ALTER TABLE "public"."visit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_bookmark" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visit_bookmark" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_comment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "visit_comment_content_length" CHECK (("char_length"("content") <= 1000))
);


ALTER TABLE "public"."visit_comment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_like" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visit_like" OWNER TO "postgres";


ALTER TABLE ONLY "public"."prefecture" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prefecture_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_auth_uid_key" UNIQUE ("auth_uid");



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."design_manhole"
    ADD CONSTRAINT "design_manhole_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."design_manhole"
    ADD CONSTRAINT "design_manhole_storage_key_key" UNIQUE ("storage_key");



ALTER TABLE ONLY "public"."manhole_comment"
    ADD CONSTRAINT "manhole_comment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manhole"
    ADD CONSTRAINT "manhole_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photo_context_image"
    ADD CONSTRAINT "photo_context_image_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photo_context_image"
    ADD CONSTRAINT "photo_context_image_storage_key_key" UNIQUE ("storage_key");



ALTER TABLE ONLY "public"."photo"
    ADD CONSTRAINT "photo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prefecture_badge"
    ADD CONSTRAINT "prefecture_badge_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prefecture"
    ADD CONSTRAINT "prefecture_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."prefecture"
    ADD CONSTRAINT "prefecture_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."prefecture"
    ADD CONSTRAINT "prefecture_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reaction"
    ADD CONSTRAINT "reaction_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reaction"
    ADD CONSTRAINT "reaction_user_id_target_type_manhole_id_reaction_type_key" UNIQUE ("user_id", "target_type", "manhole_id", "reaction_type");



ALTER TABLE ONLY "public"."reaction"
    ADD CONSTRAINT "reaction_user_id_target_type_target_id_reaction_type_key" UNIQUE ("user_id", "target_type", "target_id", "reaction_type");



ALTER TABLE ONLY "public"."visit_bookmark"
    ADD CONSTRAINT "visit_bookmark_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_bookmark"
    ADD CONSTRAINT "visit_bookmark_visit_id_user_id_key" UNIQUE ("visit_id", "user_id");



ALTER TABLE ONLY "public"."visit_comment"
    ADD CONSTRAINT "visit_comment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_like"
    ADD CONSTRAINT "visit_like_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_like"
    ADD CONSTRAINT "visit_like_visit_id_user_id_key" UNIQUE ("visit_id", "user_id");



ALTER TABLE ONLY "public"."visit"
    ADD CONSTRAINT "visit_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_design_manhole_created_by" ON "public"."design_manhole" USING "btree" ("created_by", "created_at" DESC);



CREATE INDEX "idx_design_manhole_status_created" ON "public"."design_manhole" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_manhole_address" ON "public"."manhole" USING "btree" ("address");



CREATE INDEX "idx_manhole_comment_created" ON "public"."manhole_comment" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_manhole_comment_manhole_id" ON "public"."manhole_comment" USING "btree" ("manhole_id");



CREATE INDEX "idx_manhole_comment_parent" ON "public"."manhole_comment" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_manhole_comment_user_id" ON "public"."manhole_comment" USING "btree" ("user_id");



CREATE INDEX "idx_manhole_is_active" ON "public"."manhole" USING "btree" ("is_active");



CREATE INDEX "idx_manhole_last_verified_at" ON "public"."manhole" USING "btree" ("last_verified_at");



CREATE INDEX "idx_manhole_location_gist" ON "public"."manhole" USING "gist" ("location");



CREATE INDEX "idx_manhole_official_url" ON "public"."manhole" USING "btree" ("official_url");



CREATE INDEX "idx_manhole_prefecture_active" ON "public"."manhole" USING "btree" ("prefecture_id", "is_active");



CREATE INDEX "idx_manhole_prefecture_code" ON "public"."manhole" USING "btree" ("prefecture_code");



CREATE INDEX "idx_manhole_prefecture_id" ON "public"."manhole" USING "btree" ("prefecture_id");



CREATE INDEX "idx_manhole_prefecture_site_url" ON "public"."manhole" USING "btree" ("prefecture_site_url");



CREATE INDEX "idx_manhole_region" ON "public"."manhole" USING "btree" ("region");



CREATE INDEX "idx_manhole_title_tags_gin" ON "public"."manhole" USING "gin" ("title_tags");



CREATE INDEX "idx_manhole_titles_gin" ON "public"."manhole" USING "gin" ("titles");



CREATE INDEX "idx_photo_context_image_created_by" ON "public"."photo_context_image" USING "btree" ("created_by");



CREATE INDEX "idx_photo_context_image_manhole_id" ON "public"."photo_context_image" USING "btree" ("manhole_id", "sort_order", "created_at");



CREATE INDEX "idx_photo_manhole_id" ON "public"."photo" USING "btree" ("manhole_id");



CREATE INDEX "idx_photo_storage_key" ON "public"."photo" USING "btree" ("storage_key");



CREATE INDEX "idx_photo_visit_id" ON "public"."photo" USING "btree" ("visit_id");



CREATE INDEX "idx_prefecture_badge_prefecture_id" ON "public"."prefecture_badge" USING "btree" ("prefecture_id");



CREATE INDEX "idx_prefecture_badge_status" ON "public"."prefecture_badge" USING "btree" ("status");



CREATE INDEX "idx_prefecture_badge_user_id" ON "public"."prefecture_badge" USING "btree" ("user_id");



CREATE INDEX "idx_prefecture_badge_user_status" ON "public"."prefecture_badge" USING "btree" ("user_id", "status");



CREATE INDEX "idx_reaction_created" ON "public"."reaction" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_reaction_manhole" ON "public"."reaction" USING "btree" ("target_type", "manhole_id");



CREATE INDEX "idx_reaction_target" ON "public"."reaction" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_reaction_type" ON "public"."reaction" USING "btree" ("reaction_type");



CREATE INDEX "idx_reaction_user_id" ON "public"."reaction" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_unique_active_badge_per_user_prefecture" ON "public"."prefecture_badge" USING "btree" ("user_id", "prefecture_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_visit_bookmark_created_at" ON "public"."visit_bookmark" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_visit_bookmark_user_id" ON "public"."visit_bookmark" USING "btree" ("user_id");



CREATE INDEX "idx_visit_bookmark_visit_id" ON "public"."visit_bookmark" USING "btree" ("visit_id");



CREATE INDEX "idx_visit_comment_created_at" ON "public"."visit_comment" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_visit_comment_user_id" ON "public"."visit_comment" USING "btree" ("user_id");



CREATE INDEX "idx_visit_comment_user_visit" ON "public"."visit_comment" USING "btree" ("user_id", "visit_id");



CREATE INDEX "idx_visit_comment_visit_id" ON "public"."visit_comment" USING "btree" ("visit_id");



CREATE INDEX "idx_visit_like_created_at" ON "public"."visit_like" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_visit_like_user_id" ON "public"."visit_like" USING "btree" ("user_id");



CREATE INDEX "idx_visit_like_visit_id" ON "public"."visit_like" USING "btree" ("visit_id");



CREATE INDEX "idx_visit_manhole_id" ON "public"."visit" USING "btree" ("manhole_id");



CREATE INDEX "idx_visit_shot_at" ON "public"."visit" USING "btree" ("shot_at" DESC);



CREATE INDEX "idx_visit_user_id" ON "public"."visit" USING "btree" ("user_id");



CREATE INDEX "idx_visit_user_public" ON "public"."visit" USING "btree" ("user_id", "is_public");



CREATE OR REPLACE VIEW "public"."prefecture_completion_tracker" AS
 SELECT "pb"."id" AS "badge_id",
    "pb"."user_id",
    "p"."id" AS "prefecture_id",
    "p"."code",
    "p"."name",
    "p"."name_en",
    "pb"."status",
    "count"(DISTINCT "m"."id") AS "total_manholes_now",
    "count"(DISTINCT
        CASE
            WHEN ("v"."id" IS NOT NULL) THEN "m"."id"
            ELSE NULL::bigint
        END) AS "visited_manholes_count",
    "round"(((("count"(DISTINCT
        CASE
            WHEN ("v"."id" IS NOT NULL) THEN "m"."id"
            ELSE NULL::bigint
        END))::numeric / (NULLIF("count"(DISTINCT "m"."id"), 0))::numeric) * (100)::numeric), 2) AS "current_completion_percentage",
    "pb"."acquired_at",
    "pb"."outdated_at",
    "pb"."manhole_count_at_completion",
    "pb"."visited_manhole_count",
    "pb"."completion_percentage",
    "pb"."created_at",
    "pb"."updated_at"
   FROM ((("public"."prefecture" "p"
     LEFT JOIN "public"."prefecture_badge" "pb" ON ((("p"."id" = "pb"."prefecture_id") AND ("pb"."status" = ANY (ARRAY['active'::"text", 'outdated'::"text"])))))
     LEFT JOIN "public"."manhole" "m" ON ((("p"."name")::"text" = "m"."prefecture")))
     LEFT JOIN "public"."visit" "v" ON ((("m"."id" = "v"."manhole_id") AND ("v"."user_id" = "pb"."user_id"))))
  GROUP BY "pb"."id", "pb"."user_id", "p"."id", "p"."code", "p"."name", "p"."name_en", "pb"."status", "pb"."acquired_at", "pb"."outdated_at", "pb"."manhole_count_at_completion", "pb"."visited_manhole_count", "pb"."completion_percentage", "pb"."created_at", "pb"."updated_at"
  ORDER BY "pb"."user_id", "p"."display_order";



CREATE OR REPLACE TRIGGER "set_design_manhole_updated_at" BEFORE UPDATE ON "public"."design_manhole" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_update_badges_on_manhole_add" AFTER INSERT ON "public"."manhole" FOR EACH ROW EXECUTE FUNCTION "public"."update_prefecture_badges_on_manhole_add"();



CREATE OR REPLACE TRIGGER "update_manhole_comment_updated_at" BEFORE UPDATE ON "public"."manhole_comment" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_photo_context_image_updated_at" BEFORE UPDATE ON "public"."photo_context_image" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_visit_comment_updated_at" BEFORE UPDATE ON "public"."visit_comment" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_auth_uid_fkey" FOREIGN KEY ("auth_uid") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manhole_comment"
    ADD CONSTRAINT "manhole_comment_manhole_id_fkey" FOREIGN KEY ("manhole_id") REFERENCES "public"."manhole"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manhole_comment"
    ADD CONSTRAINT "manhole_comment_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."manhole_comment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manhole_comment"
    ADD CONSTRAINT "manhole_comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manhole"
    ADD CONSTRAINT "manhole_prefecture_id_fkey" FOREIGN KEY ("prefecture_id") REFERENCES "public"."prefecture"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photo_context_image"
    ADD CONSTRAINT "photo_context_image_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."photo_context_image"
    ADD CONSTRAINT "photo_context_image_manhole_id_fkey" FOREIGN KEY ("manhole_id") REFERENCES "public"."manhole"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photo"
    ADD CONSTRAINT "photo_manhole_id_fkey" FOREIGN KEY ("manhole_id") REFERENCES "public"."manhole"("id");



ALTER TABLE ONLY "public"."photo"
    ADD CONSTRAINT "photo_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visit"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prefecture_badge"
    ADD CONSTRAINT "prefecture_badge_prefecture_id_fkey" FOREIGN KEY ("prefecture_id") REFERENCES "public"."prefecture"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prefecture_badge"
    ADD CONSTRAINT "prefecture_badge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reaction"
    ADD CONSTRAINT "reaction_manhole_id_fkey" FOREIGN KEY ("manhole_id") REFERENCES "public"."manhole"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reaction"
    ADD CONSTRAINT "reaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_bookmark"
    ADD CONSTRAINT "visit_bookmark_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_bookmark"
    ADD CONSTRAINT "visit_bookmark_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visit"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_comment"
    ADD CONSTRAINT "visit_comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_comment"
    ADD CONSTRAINT "visit_comment_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visit"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_like"
    ADD CONSTRAINT "visit_like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_like"
    ADD CONSTRAINT "visit_like_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visit"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit"
    ADD CONSTRAINT "visit_manhole_id_fkey" FOREIGN KEY ("manhole_id") REFERENCES "public"."manhole"("id");



ALTER TABLE ONLY "public"."visit"
    ADD CONSTRAINT "visit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."app_user" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_user_public_read" ON "public"."app_user" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "app_user_select_public" ON "public"."app_user" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."design_manhole" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "design_manhole_public_select" ON "public"."design_manhole" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'published'::"text") OR ("created_by" = "auth"."uid"())));



CREATE POLICY "design_manhole_users_insert_own" ON "public"."design_manhole" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("status" = 'published'::"text")));



ALTER TABLE "public"."manhole" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manhole_comment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manholes_select_authenticated" ON "public"."manhole" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "manholes_select_public" ON "public"."manhole" FOR SELECT TO "anon" USING (true);



ALTER TABLE "public"."photo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photo_context_image" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prefecture" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prefecture_badge" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prefecture_badge_users_insert_own" ON "public"."prefecture_badge" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "prefecture_badge_users_select_own" ON "public"."prefecture_badge" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "prefecture_badge_users_update_own" ON "public"."prefecture_badge" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "public_select_manhole_comments" ON "public"."manhole_comment" FOR SELECT USING (true);



CREATE POLICY "public_select_manholes" ON "public"."manhole" FOR SELECT USING (true);



CREATE POLICY "public_select_photos" ON "public"."photo" FOR SELECT USING (true);



CREATE POLICY "public_select_reactions" ON "public"."reaction" FOR SELECT USING (true);



CREATE POLICY "public_select_visit_comments" ON "public"."visit_comment" FOR SELECT USING (true);



CREATE POLICY "public_select_visit_likes" ON "public"."visit_like" FOR SELECT USING (true);



ALTER TABLE "public"."reaction" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_own_bookmarks" ON "public"."visit_bookmark" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_delete_own_comments" ON "public"."manhole_comment" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_delete_own_comments" ON "public"."visit_comment" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_delete_own_likes" ON "public"."visit_like" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_delete_own_photo_context_images" ON "public"."photo_context_image" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "users_delete_own_photos" ON "public"."photo" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."visit"
  WHERE (("visit"."id" = "photo"."visit_id") AND ("visit"."user_id" = "auth"."uid"())))));



CREATE POLICY "users_delete_own_reactions" ON "public"."reaction" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_delete_own_visits" ON "public"."visit" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_comments" ON "public"."visit_comment" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_own" ON "public"."app_user" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "auth_uid"));



CREATE POLICY "users_insert_own_bookmarks" ON "public"."visit_bookmark" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_own_comments" ON "public"."manhole_comment" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_own_ios_photo_context_images" ON "public"."photo_context_image" FOR INSERT WITH CHECK ((("source_platform" = 'ios'::"text") AND ("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."manhole" "m"
  WHERE ("m"."id" = "photo_context_image"."manhole_id")))));



CREATE POLICY "users_insert_own_likes" ON "public"."visit_like" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_own_photos" ON "public"."photo" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visit"
  WHERE (("visit"."id" = "photo"."visit_id") AND ("visit"."user_id" = "auth"."uid"())))));



CREATE POLICY "users_insert_own_reactions" ON "public"."reaction" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_insert_own_visits" ON "public"."visit" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_select_own" ON "public"."app_user" FOR SELECT USING (("auth"."uid"() = "auth_uid"));



CREATE POLICY "users_select_own_app_user" ON "public"."app_user" FOR SELECT USING (("auth"."uid"() = "auth_uid"));



CREATE POLICY "users_select_own_bookmarks" ON "public"."visit_bookmark" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_select_own_or_public_visits" ON "public"."visit" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_public" = true)));



CREATE POLICY "users_select_own_photo_context_images" ON "public"."photo_context_image" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "users_select_own_photos" ON "public"."photo" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."visit"
  WHERE (("visit"."id" = "photo"."visit_id") AND ("visit"."user_id" = "auth"."uid"())))));



CREATE POLICY "users_update_own" ON "public"."app_user" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "auth_uid")) WITH CHECK (("auth"."uid"() = "auth_uid"));



CREATE POLICY "users_update_own_comments" ON "public"."manhole_comment" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_update_own_comments" ON "public"."visit_comment" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_update_own_photo_context_images" ON "public"."photo_context_image" FOR UPDATE USING (("created_by" = "auth"."uid"())) WITH CHECK ((("created_by" = "auth"."uid"()) AND ("source_platform" = 'ios'::"text")));



CREATE POLICY "users_update_own_photos" ON "public"."photo" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."visit"
  WHERE (("visit"."id" = "photo"."visit_id") AND ("visit"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visit"
  WHERE (("visit"."id" = "photo"."visit_id") AND ("visit"."user_id" = "auth"."uid"())))));



CREATE POLICY "users_update_own_visits" ON "public"."visit" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."visit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visit_bookmark" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visit_comment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visit_like" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."check_and_update_all_prefectures_completion"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_update_all_prefectures_completion"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_update_all_prefectures_completion"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_prefecture_badge"("p_user_id" "uuid", "p_prefecture_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_prefecture_badge"("p_user_id" "uuid", "p_prefecture_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_prefecture_badge"("p_user_id" "uuid", "p_prefecture_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_app_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_app_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_app_user_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_own_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_own_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_own_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_own_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_display_names"("p_auth_uids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_display_names"("p_auth_uids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_display_names"("p_auth_uids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_display_names"("p_auth_uids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_user_ids"("p_auth_uids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_user_ids"("p_auth_uids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_user_ids"("p_auth_uids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_user_ids"("p_auth_uids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_user_info"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_user_info"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_user_info"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_user_info"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reaction_count"("p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reaction_count"("p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reaction_count"("p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_own_public_profile"("p_display_name" "text", "p_bio" "text", "p_x_url" "text", "p_instagram_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_own_public_profile"("p_display_name" "text", "p_bio" "text", "p_x_url" "text", "p_instagram_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_own_public_profile"("p_display_name" "text", "p_bio" "text", "p_x_url" "text", "p_instagram_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_own_public_profile"("p_display_name" "text", "p_bio" "text", "p_x_url" "text", "p_instagram_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_prefecture_badges_on_manhole_add"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_prefecture_badges_on_manhole_add"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_prefecture_badges_on_manhole_add"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_app_user"("p_auth_uid" "uuid", "p_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_app_user"("p_auth_uid" "uuid", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_app_user"("p_auth_uid" "uuid", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_app_user"("p_auth_uid" "uuid", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_reaction"("p_user_id" "uuid", "p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_reaction"("p_user_id" "uuid", "p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_reaction"("p_user_id" "uuid", "p_target_type" "text", "p_target_id" "uuid", "p_manhole_id" integer, "p_reaction_type" "text") TO "service_role";

















































































GRANT SELECT,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_user" TO "anon";
GRANT SELECT,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_user" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user" TO "service_role";



GRANT SELECT("auth_uid") ON TABLE "public"."app_user" TO "anon";
GRANT SELECT("auth_uid"),INSERT("auth_uid") ON TABLE "public"."app_user" TO "authenticated";



GRANT SELECT("display_name") ON TABLE "public"."app_user" TO "anon";
GRANT SELECT("display_name"),INSERT("display_name"),UPDATE("display_name") ON TABLE "public"."app_user" TO "authenticated";



GRANT INSERT("avatar_url"),UPDATE("avatar_url") ON TABLE "public"."app_user" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."design_manhole" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."design_manhole" TO "authenticated";
GRANT ALL ON TABLE "public"."design_manhole" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("id") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("title") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("title") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("description") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("description") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("submitter_name") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("submitter_name") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("latitude") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("latitude") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("longitude") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("longitude") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("storage_provider") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("storage_provider") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("storage_key") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("storage_key") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("content_type") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("content_type") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("file_size") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("file_size") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("width") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("width") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("height") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("height") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("status") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("created_by") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("created_by") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."design_manhole" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."design_manhole" TO "authenticated";



GRANT ALL ON TABLE "public"."manhole" TO "anon";
GRANT ALL ON TABLE "public"."manhole" TO "authenticated";
GRANT ALL ON TABLE "public"."manhole" TO "service_role";



GRANT ALL ON TABLE "public"."manhole_comment" TO "anon";
GRANT ALL ON TABLE "public"."manhole_comment" TO "authenticated";
GRANT ALL ON TABLE "public"."manhole_comment" TO "service_role";



GRANT ALL ON TABLE "public"."manhole_comment_stats" TO "anon";
GRANT ALL ON TABLE "public"."manhole_comment_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."manhole_comment_stats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."manhole_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."manhole_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."manhole_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reaction" TO "anon";
GRANT ALL ON TABLE "public"."reaction" TO "authenticated";
GRANT ALL ON TABLE "public"."reaction" TO "service_role";



GRANT ALL ON TABLE "public"."manhole_reaction_stats" TO "anon";
GRANT ALL ON TABLE "public"."manhole_reaction_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."manhole_reaction_stats" TO "service_role";



GRANT ALL ON TABLE "public"."photo" TO "anon";
GRANT ALL ON TABLE "public"."photo" TO "authenticated";
GRANT ALL ON TABLE "public"."photo" TO "service_role";



GRANT ALL ON TABLE "public"."photo_context_image" TO "anon";
GRANT ALL ON TABLE "public"."photo_context_image" TO "authenticated";
GRANT ALL ON TABLE "public"."photo_context_image" TO "service_role";



GRANT ALL ON TABLE "public"."prefecture" TO "anon";
GRANT ALL ON TABLE "public"."prefecture" TO "authenticated";
GRANT ALL ON TABLE "public"."prefecture" TO "service_role";



GRANT ALL ON TABLE "public"."prefecture_badge" TO "anon";
GRANT ALL ON TABLE "public"."prefecture_badge" TO "authenticated";
GRANT ALL ON TABLE "public"."prefecture_badge" TO "service_role";



GRANT ALL ON TABLE "public"."prefecture_completion_tracker" TO "anon";
GRANT ALL ON TABLE "public"."prefecture_completion_tracker" TO "authenticated";
GRANT ALL ON TABLE "public"."prefecture_completion_tracker" TO "service_role";



GRANT ALL ON SEQUENCE "public"."prefecture_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prefecture_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prefecture_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."visit" TO "anon";
GRANT ALL ON TABLE "public"."visit" TO "authenticated";
GRANT ALL ON TABLE "public"."visit" TO "service_role";



GRANT ALL ON TABLE "public"."visit_bookmark" TO "anon";
GRANT ALL ON TABLE "public"."visit_bookmark" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_bookmark" TO "service_role";



GRANT ALL ON TABLE "public"."visit_comment" TO "anon";
GRANT ALL ON TABLE "public"."visit_comment" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_comment" TO "service_role";



GRANT ALL ON TABLE "public"."visit_like" TO "anon";
GRANT ALL ON TABLE "public"."visit_like" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_like" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































