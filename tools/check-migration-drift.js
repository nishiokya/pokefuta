#!/usr/bin/env node
/**
 * `supabase/migrations/` と本番の `supabase_migrations` のズレを検出する。
 *
 * このリポジトリでは Amplify がコードだけ自動デプロイし、DBは手動 push なので、
 * **コードとスキーマは「ズレる方向にしか事故らない」**。しかも API 層は PostgREST の
 * エラーを「時間をおいて再度お試しください」に丸めるため、壊れても本番画面からは
 * 原因が分からない。
 *
 * 実際に 2026-08-09、PR #198 がコードだけ本番に出て
 * `20260808000000_design_manhole_nearby_review.sql` が未適用のまま放置され、
 * `design_manhole` への INSERT が存在しない列を指して PGRST204 で全失敗していた。
 * **投稿ゼロ件が2日続くまで誰も気づかなかった。** 目視に頼らないための検査。
 *
 * ## 宛先を固定する
 *
 * `--linked` は作業ツリーのリンク先をそのまま使うが、その状態を持つ `supabase/.temp` は
 * gitignore 対象で、コード上のどこにも期待値が無い。別プロジェクトにリンクした端末では、
 * **取り違えたまま「ズレなし」と報告してしまう**。それでは宛先確認の役に立たないので、
 * 期待する project ref をここに書いて照合し、実行のたびに表示する。
 *
 * ref は `NEXT_PUBLIC_SUPABASE_URL` としてクライアントに配信される公開値であり、
 * これ自体は秘密ではない。
 *
 * 本番に接続するため type-check には入れない。`npm run db:drift` で明示的に叩く。
 */

const { execFileSync } = require('child_process');

const EXPECTED_PROJECT_REF = 'kbwzwgsjqvflgfauzcpn';

function runSupabase(args) {
  return execFileSync('supabase', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** CLI の JSON 出力を拾う。進捗行が混ざるので、条件に合う最後の行だけを使う。 */
function parseJsonLine(stdout, requiredKey) {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.includes(`"${requiredKey}"`))
    .pop();
  if (!line) {
    throw new Error(
      `CLI の出力から "${requiredKey}" を読めなかった。` +
        `CLI のバージョン差で出力形式が変わった可能性がある:\n${stdout}`
    );
  }
  return JSON.parse(line);
}

function linkedProjectRef() {
  const parsed = parseJsonLine(
    runSupabase(['projects', 'list', '--output-format', 'json']),
    'linked'
  );
  const projects = Array.isArray(parsed) ? parsed : (parsed.projects ?? []);
  const linked = projects.find((p) => p.linked);
  return linked ? linked.id ?? linked.ref ?? null : null;
}

function listMigrations() {
  const parsed = parseJsonLine(
    runSupabase(['migration', 'list', '--linked', '--output-format', 'json']),
    'migrations'
  );
  if (!Array.isArray(parsed.migrations)) {
    throw new Error(`migrations が配列ではない:\n${JSON.stringify(parsed)}`);
  }
  return parsed.migrations;
}

/**
 * `migration list --linked` は Management API で一時ログインロールを作ってから
 * 接続するため、ネットワークやAPI側の一過性の失敗で落ちることがある
 * （2026-08-10、本番は正常なのにCIだけ1回落ちた）。
 *
 * 失敗したまま緑にはしない。ただし、たまに赤くなる検査は無視されるようになり、
 * 本物のズレを見落とす方向に働く。だから**回数を限って**やり直し、
 * 全部だめなら従来どおり落とす。
 */
function listMigrationsWithRetry(attempts = 3, waitMs = 3000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return listMigrations();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(
          `check-migration-drift: 本番への接続に失敗 (${attempt}/${attempts})。${waitMs}ms 後に再試行する`
        );
        // execFileSync と揃えて同期で待つ
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
      }
    }
  }
  throw lastError;
}

function main() {
  let ref;
  let migrations;

  // 接続も解釈も、失敗したら落とす。「ズレなし」と誤報するくらいなら止める。
  try {
    ref = linkedProjectRef();
  } catch (error) {
    console.error('check-migration-drift: リンク先の確認に失敗した');
    console.error(error.message);
    process.exit(2);
  }

  if (ref !== EXPECTED_PROJECT_REF) {
    console.error(
      `check-migration-drift: リンク先が期待と違う\n` +
        `  期待: ${EXPECTED_PROJECT_REF}\n` +
        `  実際: ${ref ?? '(リンクされていない)'}\n\n` +
        '  別プロジェクトを見たまま照合しても意味がない。' +
        '`supabase link --project-ref` でリンクし直すこと。'
    );
    process.exit(2);
  }

  console.log(`check-migration-drift: 宛先 ${ref}`);

  try {
    migrations = listMigrationsWithRetry();
  } catch (error) {
    console.error('check-migration-drift: 本番への接続または出力の解釈に失敗した');
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
