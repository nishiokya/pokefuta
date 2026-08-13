// manhole_comment を `user_id` 込み（または `select=*`）で読んでいる箇所が無いことを検査する。
//
// 背景: 蓋コメントの投稿者 auth uid は、公開 anon キーで
// `manhole_comment?select=user_id` を叩けば全件取れる状態だった（#215 が API の
// レスポンスから消しても、DB は `GRANT ALL TO anon` + `USING (true)` のままだった）。
// Phase 1c で SECURITY DEFINER の `get_manhole_comments()` を足して読み口を移し
// （#216）、最後に `manhole_comment` の SELECT を列名指しにして user_id を落とす。
//
// この検査が守るのはその「最後」の前提:
//
//   - 列を名指しにしたあとに `user_id` を select すると 42501 で落ちる。
//     API 層はエラーを汎用文言に丸めるので、本番画面からもログからも見えない
//     （2026-08-09 のデザインマンホール投稿全滅と同じ構造）
//   - `select=*` は全列に展開されるので、同じく落ちる
//
// 「自分のコメントか」を知りたいだけなら `is_own_manhole_comment()` を使うこと。
// RLS はすでに本人しか消せない・自分のは通報できないを強制しているので、
// user_id をアプリまで持ってくる理由は無い。
//
// 検査を黙らせるために user_id を戻すのは、塞いだ穴を自分で開け直すのと同じ。

const fs = require('fs');
const path = require('path');
const {
  stripComments,
  collectSourceFiles,
  findSelectChains,
  BARE_STAR,
} = require('./lib/select-chains');

const root = path.resolve(__dirname, '..');
const files = collectSourceFiles(path.join(root, 'src'));

// select リストの中で単独のトークンとして現れる `user_id`。
// `reporter_user_id` や `public_user_id` のような別の列は拾わない。
const USER_ID = /(^|,)\s*user_id\s*(,|$)/;

const violations = [];

for (const file of files) {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  for (const { selectBody, noArgs, line } of findSelectChains(source, 'manhole_comment')) {
    const reason = noArgs
      ? '.select() （引数なし＝select=*）'
      : BARE_STAR.test(selectBody)
        ? ".select('*')"
        : USER_ID.test(selectBody)
          ? '.select(... user_id ...)'
          : null;
    if (!reason) continue;
    violations.push(`${path.relative(root, file)}:${line}  ${reason}`);
  }
}

// **実際の select は定数経由**（`.select(MANHOLE_COMMENT_COLUMNS)`）なので、
// 上のチェーン検査だけでは列の中身を見られない。定数の定義そのものを見る。
// ここを見落としたまま検査を足すと、user_id を戻しても素通りする
// （2026-08-13、この検査の反証テストで実際に素通りした）。
const libPath = path.join(root, 'src/lib/manhole-comments.ts');
const lib = fs.readFileSync(libPath, 'utf8');

const constMatch = lib.match(
  /export\s+const\s+MANHOLE_COMMENT_COLUMNS\s*(?::\s*[^=]+)?=\s*(['"`])([\s\S]*?)\1/
);
if (!constMatch) {
  violations.push(
    'src/lib/manhole-comments.ts  MANHOLE_COMMENT_COLUMNS の定義が見つからない（検査が無効化されている）'
  );
} else {
  const columns = constMatch[2];
  const line = lib.slice(0, constMatch.index).split('\n').length;
  if (BARE_STAR.test(columns)) {
    violations.push(`src/lib/manhole-comments.ts:${line}  MANHOLE_COMMENT_COLUMNS が * を含む`);
  }
  if (USER_ID.test(columns)) {
    violations.push(
      `src/lib/manhole-comments.ts:${line}  MANHOLE_COMMENT_COLUMNS が user_id を含む`
    );
  }
}

// 一覧の読み口が RPC のままであることも見る。テーブル直読みに戻ると、
// 列を名指しにした瞬間に蓋ページのコメント欄が丸ごと落ちる。
// 関数名は引用符ごと照合する。`includes('get_manhole_comments')` だと
// `get_manhole_comments_v2` のような別名でも通ってしまう（反証テストで判明）。
if (!/\.rpc\(\s*(['"])get_manhole_comments\1/.test(lib)) {
  violations.push(
    'src/lib/manhole-comments.ts  一覧が get_manhole_comments() を経由していない'
  );
}

if (violations.length > 0) {
  console.error(
    [
      'manhole_comment を user_id 込み（または select=*）で読んでいる箇所がある。',
      'manhole_comment の SELECT は列名指しで運用する（user_id は含めない）。',
      '一覧は get_manhole_comments()、本人判定は is_own_manhole_comment() を使うこと。',
      ...violations,
    ].join('\n')
  );
  process.exit(1);
}

console.log('manhole_comment user_id check passed');
