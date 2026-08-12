# 蓋コメント 運営手順書

**深夜3時に設計はできない。** 通報ボタンを置いた以上「読む」というコミットが要るので、
専用の管理画面を作らない代わりにこの手順書を先に書いてある。

対象は `manhole_comment`（蓋という場所へのコメント）と、その通報である `comment_report`。

- 管理画面は作っていない。**すべて Supabase の SQL エディタから service_role で実行する。**
  `comment_report` には SELECT ポリシーが無いので、anon / authenticated からは1行も読めない
- アプリ経由では消せないコメント（他人のもの）を消すのはここだけ
- **Supabase MCP は read-only。** 調査には使ってよいが、書き込みはダッシュボードから手で打つ

---

## 週次: 滞留している通報を見る

専用画面の代わりに、これを週1回叩く。既存の site-stats → Obsidian の週次経路に相乗りさせる。

```sql
-- 未処理の通報。0行なら何もしない。
select
  r.id            as report_id,
  r.created_at    as reported_at,
  r.reason,
  c.id            as comment_id,
  c.manhole_id,
  c.content,
  c.created_at    as commented_at
from comment_report r
join manhole_comment c on c.id = r.comment_id
where r.resolved_at is null
order by r.created_at asc;
```

滞留件数だけを数えるなら:

```sql
select count(*) from comment_report where resolved_at is null;
```

**この数字が週をまたいで増え続けていたら、通報が読まれていない。**
そのときは「通報ボタンを外す」か「読む頻度を上げる」かの二択で、放置は選ばない。
応えられない約束にしないこと。

---

## 対応する

### 1. コメントを消す

```sql
-- 消す前に必ず現物を見る。
select id, manhole_id, user_id, content, created_at
from manhole_comment
where id = '<comment_id>';

delete from manhole_comment where id = '<comment_id>';
```

`comment_report.comment_id` は `ON DELETE CASCADE` なので、
**コメントを消すと、そのコメントへの通報も一緒に消える。** 記録を残したい場合は
先に下の「通報を処理済みにする」を実行し、内容を Obsidian に控えてから消す。

### 2. 通報を処理済みにする（コメントは残す場合）

```sql
update comment_report
set resolved_at = now()
where id = '<report_id>';
```

同じコメントへの通報がまとめて残っているなら:

```sql
update comment_report
set resolved_at = now()
where comment_id = '<comment_id>' and resolved_at is null;
```

### 3. 特定の利用者の投稿をまとめて見る

```sql
select c.id, c.manhole_id, c.content, c.created_at
from manhole_comment c
where c.user_id = '<auth_uid>'
order by c.created_at desc;
```

`auth_uid` は公開面には出ていない。上の通報クエリの `comment_id` から辿ること。

---

## キルスイッチ

荒れたときに機能を止める手段。**画面は作らない。** 影響が大きい順に並べてある。
上ほど可逆で、下ほど戻すときに注意が要る。

### A. 特定の利用者だけ止める（推奨）

**この1本をそのまま実行すれば止まる。** 表の作成とポリシーの差し替えを同じ
トランザクションに入れてあるのは、片方だけ実行して「止めたつもり」になるのを防ぐため
（表に INSERT するだけの手順を書いていたことがあり、**それは何も止めなかった**）。

```sql
begin;

create table if not exists public.comment_ban (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);
alter table public.comment_ban enable row level security;
revoke all on public.comment_ban from public, anon, authenticated;

-- **RLS 式から comment_ban を直接 SELECT しないこと。**
-- RLS 式は投稿者の権限で評価されるので、authenticated から REVOKE した表を
-- 式の中で読むと、**ban していない利用者まで権限エラーで投稿できなくなる。**
-- 「1人を止める」つもりの手順が全体停止になる（2026-08-12、実際に踏んだ）。
-- SECURITY DEFINER 関数を1枚挟めば、表は閉じたまま判定だけできる。
-- 誰が ban されているかを利用者に見せないためにも、直接 SELECT は許可しない。
create or replace function public.is_comment_banned()
returns boolean
language sql stable security definer set search_path to 'public'
as $fn$
  select exists (select 1 from comment_ban b where b.user_id = auth.uid());
$fn$;
revoke all on function public.is_comment_banned() from public, anon;
grant execute on function public.is_comment_banned() to authenticated;

-- 止める相手（複数なら行を足す）
insert into public.comment_ban (user_id, note)
values ('<auth_uid>', '<理由>')
on conflict (user_id) do nothing;

-- **ここが本体。** ポリシーを差し替えないと上の INSERT は何の効果も持たない。
drop policy if exists users_insert_own_comments on public.manhole_comment;
create policy "users_insert_own_comments" on public.manhole_comment
  for insert with check (
    auth.uid() = user_id
    and not public.is_comment_banned()
  );

commit;
```

**確認は必ず2人ぶんやること。** ban 対象が止まったことだけ見ると、
全員止まっていても気づけない — 実際にそれで全体停止の手順を書いていた。

```sql
begin;
set local role authenticated;

-- 1. ban 対象。期待: new row violates row-level security policy
select set_config('request.jwt.claims',
                  json_build_object('sub','<banned_auth_uid>','role','authenticated')::text, true);
insert into public.manhole_comment (manhole_id, user_id, content)
values ((select id from public.manhole limit 1), '<banned_auth_uid>', 'ban check');

rollback;
```

```sql
begin;
set local role authenticated;

-- 2. ban していない人。**期待: 成功する。** ここが落ちたら全体停止している
select set_config('request.jwt.claims',
                  json_build_object('sub','<普通の利用者のauth_uid>','role','authenticated')::text, true);
insert into public.manhole_comment (manhole_id, user_id, content)
values ((select id from public.manhole limit 1), '<普通の利用者のauth_uid>', 'sanity check');

rollback;
```

解除は `delete from public.comment_ban where user_id = '<auth_uid>';`（ポリシーはそのままでよい）。

**落ち着いたら必ずマイグレーションファイルに落として版を合わせる。**
ダッシュボードで打ちっぱなしにすると `npm run db:drift` が赤いまま残り、
次の人が「本番だけにある DDL」を追いかけることになる。

### B. 全員のコメント投稿を止める

```sql
-- 新規投稿だけを止める。既存のコメントは読めるまま。
drop policy if exists users_insert_own_comments on public.manhole_comment;

-- 戻す（baseline 20260718000000 の定義そのまま）
create policy "users_insert_own_comments" on public.manhole_comment
  for insert with check (auth.uid() = user_id);
```

戻すときは baseline のポリシー定義をそのまま復元する。
**ポリシー名と定義を控えずに drop しないこと。** 先に控える:

```sql
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
where polrelid = 'public.manhole_comment'::regclass;
```

### C. レート制限（現時点では存在しない）

**投稿レート制限は入っていません。** 一度書いて外しました。理由は
`supabase/migrations/20260811150000_manhole_comment_guardrails.sql` の冒頭にあります
（`created_at` がサーバー管理でないため、PostgREST 直叩きで迂回できる）。

荒れの規模が「1人が大量」なら A で足ります。**「多数がそこそこ」で初めて
レート制限が要る**ので、その状況になったら深夜に即席で入れず、
次の3点をセットにした PR を出すこと:

1. `created_at` をサーバー管理にする（列の GRANT を外す、またはトリガで上書き）。
   **ここを飛ばすと、入れた制限がその日のうちに迂回される**
2. API で 429 に変換し、利用者に再試行できる時刻を見せる。
   トリガだけだと 11件目がただの 500 になる
3. `p_comment_failed` に `error_code='rate_limited'` を足して、弾かれた件数を見る。
   見ていない制限は、閾値が適切かどうかを永久に答えられない

急場しのぎが要るなら B（全員止める）のほうが、迂回できる制限より正直です。

---

## 復旧後にやること

- 止めた機能を戻したか（B を打ったなら、ポリシーが復元されているか）
- `npm run db:drift` が緑か。**ダッシュボードから打った DDL は必ずマイグレーションに落とす**
- `npm run verify:comment-guardrails` がローカルスタックで通るか
- 何が起きたかを Obsidian に残す（判断の根拠が残らないと、次に同じ深夜が来る）
