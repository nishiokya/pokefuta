#!/usr/bin/env node
/**
 * 蓋コメントのガードレールを、ローカルスタックで実際に読み書きして確認する。
 *
 * Supabase は anon/authenticated キーで PostgREST を直接叩ける設計なので、
 * **アプリの API 層はセキュリティ境界ではない**。境界は GRANT・RLS・制約・トリガだけ。
 * マイグレーションSQLを正規表現で照合しても「実際に何ができるか」は分からないので、
 * ここは本当にロールを切り替えて読み書きする。
 *
 * この検査は書いた初日に実際の欠陥を3件見つけている（2026-08-11）:
 *   - `btrim()` は全角スペースを落とさないので、`　` だけのコメントが通り抜けていた
 *   - 通報の `INSERT ... RETURNING` が 42501 で落ちる（SELECTポリシーを作っていないため）。
 *     アプリが `.insert().select()` と書くと壊れる
 *   - get_public_display_names が `RETURN QUERY` を2回実行しており、
 *     公開visitと蓋コメントの両方を持つ人に**2行返していた**
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-comment-guardrails.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  '1000文字を超える本文が入らない（境界の1000文字は通る）',
  '空白だけの本文が入らない（全角スペースを含む）',
  '通報は自分の名前でしか作れない／RETURNING は落ちる',
  '自分のコメントは自分で通報できない（APIを迂回しても）',
  '同じ人が同じコメントを二度通報しても1件',
  '通報は anon からも authenticated からも読めない',
  'コメントのみのユーザーにも公開IDが出る（蓋コメント・公開visitへのコメントの両方）',
  '無活動のユーザーには公開IDを出さない',
  '蓋コメントを auth uid 抜きで読める（get_manhole_comments／表示名・公開ID・is_own）',
  'auth uid は DB からも読めない（直叩きと select * が 42501／RPC・投稿・自己削除は生きている／'
  + 'manhole_comment_stats が巻き添えで死んでいない）',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-comment-guardrails: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-comment-guardrails: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
