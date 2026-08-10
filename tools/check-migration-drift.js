#!/usr/bin/env node
/**
 * `supabase/migrations/` と本番の `supabase_migrations` のズレを検出する。
 *
 * このリポジトリでは Amplify がコードだけ自動でデプロイし、DBは手動 push なので、
 * **コードとスキーマは「ズレる方向にしか事故らない」**。しかも API 層は PostgREST の
 * エラーを「時間をおいて再度お試しください」に丸めるため、壊れても本番画面からは
 * 原因が分からない。
 *
 * 実際に 2026-08-09、PR #198 がコードだけ本番に出て
 * `20260808000000_design_manhole_nearby_review.sql` が未適用のまま放置され、
 * `design_manhole` への INSERT が存在しない列を指して PGRST204 で全失敗していた。
 * **投稿ゼロ件が2日続くまで誰も気づかなかった。** 目視に頼らないための検査。
 *
 * 本番に接続するため type-check には入れない。`npm run db:drift` で明示的に叩く。
 */

const { execFileSync } = require('child_process');

function listMigrations() {
  const stdout = execFileSync(
    'supabase',
    // `--output` はテーブル整形用の別フラグ。JSON は `--output-format`。
    ['migration', 'list', '--linked', '--output-format', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  // CLI は進捗行を混ぜることがあるので、JSON らしい最後の行だけを拾う。
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.includes('"migrations"'))
    .pop();
  if (!line) throw new Error(`migration list の出力を解釈できない:\n${stdout}`);
  return JSON.parse(line).migrations ?? [];
}

function main() {
  let migrations;
  try {
    migrations = listMigrations();
  } catch (error) {
    console.error('check-migration-drift: 本番への接続に失敗した');
    console.error(error.message);
    process.exit(2);
  }

  const unapplied = migrations.filter((m) => m.local && !m.remote);
  // ファイルが無いのに本番に版がある = ダッシュボード直打ちか、ファイルの取り違え。
  const untracked = migrations.filter((m) => !m.local && m.remote);

  console.log(`check-migration-drift: ${migrations.length} 版を照合`);

  if (unapplied.length === 0 && untracked.length === 0) {
    console.log('check-migration-drift: ズレなし');
    return;
  }

  if (unapplied.length > 0) {
    console.error('\n🔴 本番に未適用のマイグレーションがある:');
    for (const m of unapplied) console.error(`  - ${m.local}`);
    console.error(
      '\n  このままコードが本番に出ると、スキーマを前提にした処理が必ず失敗する。'
    );
    console.error('  `supabase db push --linked` で適用すること。');
  }

  if (untracked.length > 0) {
    console.error('\n⚠️ 本番にあるがローカルにファイルが無い版:');
    for (const m of untracked) console.error(`  - ${m.remote}`);
    console.error(
      '\n  ダッシュボードから直接DDLを打った可能性がある。ファイルに落として版を合わせること。'
    );
  }

  console.error('');
  process.exit(1);
}

main();
