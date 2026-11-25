#!/usr/bin/env bash
# 公開スタンプ帳スナップショットの版（変更ログ）を、二接続の競合で確かめる。ローカルスタック専用。
# 単一接続の検査は tools/verify-user-snapshot-rev.sql。マイグレーション: 20261125120000_user_snapshot_change_log.sql（PR #501）
#
#   1. 所有者の付け替え（visit A→B、未コミット）と、その訪問の写真の更新が交差しても、
#      写真の更新が B の版に必ず入る（B の JSON を2つのコミットの間に作っても、写真のコミット後に版が変わる）。
#      写真側を READ COMMITTED / REPEATABLE READ（先にスナップショットを確定）の両方で。
#   2. 「visit UPDATE → photo UPDATE」と「photo UPDATE（自動採点）」を交差させても、トリガのせいで待たない
#      （写真の更新は lock_timeout 1秒で通る＝ visit の行・表を待っていない）。
#
# 使い方: PSQL='docker exec -i supabase_db_pokefuta psql -U postgres -d postgres' tools/verify-user-snapshot-rev-race.sh
#         （既定は psql postgresql://postgres:postgres@127.0.0.1:54322/postgres）
set -euo pipefail

PSQL=${PSQL:-psql postgresql://postgres:postgres@127.0.0.1:54322/postgres}
q() { $PSQL -v ON_ERROR_STOP=1 -qAt "$@"; }

A_UID=00000000-0000-0000-0000-00000000fe01
B_UID=00000000-0000-0000-0000-00000000fe02
A_APP=00000000-0000-0000-0000-00000000fe11
B_APP=00000000-0000-0000-0000-00000000fe12
V=00000000-0000-0000-0000-00000000fe21
P=00000000-0000-0000-0000-00000000fe31

cleanup() {
  q <<SQL >/dev/null 2>&1 || true
DELETE FROM public.photo WHERE id = '$P';
DELETE FROM public.visit WHERE id = '$V';
DELETE FROM public.app_user WHERE id IN ('$A_APP', '$B_APP');
DELETE FROM auth.users WHERE id IN ('$A_UID', '$B_UID');
DELETE FROM public.user_snapshot_change WHERE auth_uid IN ('$A_UID', '$B_UID') OR app_user_id IN ('$A_APP', '$B_APP') OR visit_id = '$V';
SQL
}
trap cleanup EXIT

setup() {
  cleanup
  q <<SQL >/dev/null
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('$A_UID', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev-race-a@example.test', 'x', now(), now(), now()),
  ('$B_UID', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rev-race-b@example.test', 'x', now(), now(), now());
INSERT INTO public.app_user (id, auth_uid, display_name) VALUES ('$A_APP', '$A_UID', 'race A'), ('$B_APP', '$B_UID', 'race B');
INSERT INTO public.visit (id, user_id, manhole_id, shot_at, is_public)
  SELECT '$V', '$A_UID', id, now(), true FROM public.manhole ORDER BY id LIMIT 1;
INSERT INTO public.photo (id, visit_id, manhole_id, storage_key)
  SELECT '$P', '$V', manhole_id, 'photos/original/rev-race.jpg' FROM public.visit WHERE id = '$V';
SQL
}

rev_b() { q -c "SELECT public.get_public_snapshot_rev('$B_APP')"; }
tag_b() { q -c "SELECT public.get_public_user_snapshot('$B_APP') -> 'cards' -> 0 -> 'latest_photo_ai_tags' ->> 'model'"; }

fail() { echo "verify-user-snapshot-rev-race: 失敗: $*" >&2; exit 1; }

# --- 1. 所有者の付け替え × 写真の更新 ---------------------------------------
for iso in 'READ COMMITTED' 'REPEATABLE READ'; do
  setup
  # T1: A→B に付け替えて 3 秒後にコミット
  { echo "BEGIN; UPDATE public.visit SET user_id = '$B_UID' WHERE id = '$V';"; sleep 3; echo "COMMIT;"; } \
    | $PSQL -v ON_ERROR_STOP=1 -qAt >/dev/null &
  t1=$!
  sleep 1
  # T2: 先にスナップショットを確定してから写真を更新（待たないこと）、6 秒後にコミット
  { echo "BEGIN ISOLATION LEVEL $iso; SET LOCAL lock_timeout = '1s'; SELECT 1;";
    echo "UPDATE public.photo SET ai_tags = '{\"model\":\"race\"}'::jsonb WHERE id = '$P';";
    sleep 5; echo "COMMIT;"; } | $PSQL -v ON_ERROR_STOP=1 -qAt >/dev/null &
  t2=$!
  wait $t1
  sleep 1
  # 2つのコミットの間に B の JSON を作る（写真の更新はまだ見えない）
  r1=$(rev_b); m1=$(tag_b)
  [ "$m1" != "race" ] || fail "[$iso] T2 のコミット前に写真の更新が見えている"
  wait $t2 || fail "[$iso] 写真の更新が失敗した（待たされて lock_timeout）"
  r2=$(rev_b); m2=$(tag_b)
  [ "$m2" = "race" ] || fail "[$iso] T2 のコミット後に写真の更新が見えない"
  [ "$r1" != "$r2" ] || fail "[$iso] 写真の更新のコミット後も B の版が変わらない（$r1）"
  echo "ok 1 [$iso] 付け替えと写真の更新の交差: B の版 $r1 → $r2"
done

# --- 2. トリガのせいで待たない ----------------------------------------------
setup
# 運用 SQL: visit を更新したまま 3 秒持つ（このあと写真も直す想定）
{ echo "BEGIN; UPDATE public.visit SET comment = 'ops' WHERE id = '$V';"; sleep 3;
  echo "UPDATE public.photo SET ai_tags = '{\"model\":\"ops\"}'::jsonb WHERE id = '$P';"; echo "COMMIT;"; } \
  | $PSQL -v ON_ERROR_STOP=1 -qAt >/dev/null &
ops=$!
sleep 1
# 自動採点: 同じ訪問の写真を更新して、すぐにコミットできる（visit の行を待たない）
q <<SQL >/dev/null || fail "[2] 採点の写真の更新が、運用 SQL の visit の行を待った"
BEGIN; SET LOCAL lock_timeout = '1s';
UPDATE public.photo SET ai_tags = '{"model":"scorer"}'::jsonb, quality_score = 0.4 WHERE id = '$P';
COMMIT;
SQL
wait $ops || fail "[2] 運用 SQL が失敗した（デッドロックなど）"
echo "ok 2 運用 SQL（visit → photo）と採点（photo）の交差で、トリガ由来の待ち・デッドロックなし"

echo 'verify-user-snapshot-rev-race: 全項目合格。検証行は削除した。'
