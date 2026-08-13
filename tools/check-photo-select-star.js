// photo テーブルを `select=*` で読んでいる箇所が無いことを検査する。
//
// 背景: 20260810120000_restrict_photo_exif_and_private_rows.sql で
// `REVOKE SELECT ON public.photo FROM anon, authenticated` したうえで列を名指しで
// GRANT した（`exif` は意図的に除外）。PostgREST の `select=*` は **photo の全列に
// 展開される**ので、GRANT していない `exif` まで要求して 42501 で落ちる。
// 「権限のある列だけ返す」という挙動にはならない。
//
// この退行は SQL 側の検査（tools/verify-photo-visibility.sql）では捕まらない。
// 列権限と RLS が正しく張れていることと、アプリが権限のある列だけを要求していることは
// 別の話だから。しかも API 層がエラーを汎用文言に丸めるので、本番画面からも見えない
// （2026-08-09 のデザインマンホール投稿全滅と同じ構造）。
//
// 列を足したくなったら、まずマイグレーションの GRANT に足すか判断すること。
// 検査を黙らせるために `*` に戻すのは、塞いだ穴を自分で開け直すのと同じ。

const path = require('path');
const {
  stripComments,
  collectSourceFiles,
  findSelectChains,
  BARE_STAR,
} = require('./lib/select-chains');

const root = path.resolve(__dirname, '..');
const files = collectSourceFiles(path.join(root, 'src'));

const violations = [];

for (const file of files) {
  const source = stripComments(require('fs').readFileSync(file, 'utf8'));
  for (const { selectBody, noArgs, line } of findSelectChains(source, 'photo')) {
    if (!noArgs && !BARE_STAR.test(selectBody)) continue;
    violations.push(
      `${path.relative(root, file)}:${line}  ${noArgs ? '.select() （引数なし＝select=*）' : ".select('*')"}`
    );
  }
}

if (violations.length > 0) {
  console.error(
    [
      'photo を select=* で読んでいる箇所がある。',
      'photo は列単位 GRANT で運用しており、`*` は GRANT していない exif まで要求して 42501 で落ちる。',
      '必要な列を明示列挙すること（supabase/migrations/20260810120000_*.sql の GRANT が許可列）。',
      ...violations,
    ].join('\n')
  );
  process.exit(1);
}

console.log('photo select=* check passed');
