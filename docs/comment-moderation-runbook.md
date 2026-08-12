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

レート制限のトリガに乗せるのがいちばん狭い。

```sql
-- 1時間あたりの上限を、この利用者だけ 0 にする代わりに、
-- 手っ取り早くは既存の投稿を消さずに新規だけ止めたいので RLS 側で落とす。
create table if not exists public.comment_ban (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);
alter table public.comment_ban enable row level security;
revoke all on public.comment_ban from public, anon, authenticated;

insert into public.comment_ban (user_id, note) values ('<auth_uid>', '<理由>');
```

**この表は現時点では存在しないし、どのポリシーからも参照されていない。**
使うことになった時点で、`manhole_comment` の INSERT ポリシー `users_insert_own_comments` に
`not exists (select 1 from comment_ban b where b.user_id = auth.uid())` を足し、
**マイグレーションファイルに落として版を合わせる**こと（ダッシュボードで打ちっぱなしにしない）。

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

### C. レート制限を締める

荒れの規模が「1人が大量」なら A、「多数がそこそこ」ならこちら。
`enforce_manhole_comment_rate_limit()` の `v_recent >= 10` を下げる。
関数の定義は `supabase/migrations/20260811150000_manhole_comment_guardrails.sql` にある。
**変更したらマイグレーションファイル側も同じ値にする**（`npm run db:drift` が落ちる）。

---

## 復旧後にやること

- 止めた機能を戻したか（B を打ったなら、ポリシーが復元されているか）
- `npm run db:drift` が緑か。**ダッシュボードから打った DDL は必ずマイグレーションに落とす**
- `npm run verify:comment-guardrails` がローカルスタックで通るか
- 何が起きたかを Obsidian に残す（判断の根拠が残らないと、次に同じ深夜が来る）
