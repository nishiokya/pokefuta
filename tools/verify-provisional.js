#!/usr/bin/env node
/**
 * 未掲載ポケふた（仮のポケふた）の権限と関数の挙動を、ローカルスタックで実際にロールを
 * 切り替えて確認する。運営ロール provisional_operator は本番に直接ログインするので、
 * 守りたいのは「関数を呼べる」ことより「それ以外は何もできない」こと（photo_scorer と同じ）。
 *
 * 前提: `supabase start` でローカルスタックが動いていること。
 */

const { execFileSync } = require('child_process');
const path = require('path');

const SQL_FILE = path.join(__dirname, 'verify-provisional.sql');

// SQL 側は期待と違えば EXCEPTION で落ちる。正常終了＝全項目合格。
const CHECKS = [
  '運営ロールの自己点検 provisional_ops.audit_operator() と photo_scorer の自己点検が違反を返さない・表の権限を足すと検出する',
  'anon / authenticated / 運営ロールは表を直接読み書きできず、写真の登録関数（service_role 専用）を呼べない',
  '受付の初期値は閉で、閉のあいだは写真が入らない',
  '新規登録は写真と同時、既存への追加、上限 5枚/24時間、保存キー・呼び名・撮影日時の検査',
  '手がかりの検査（何も無い・日本の外・http(s) 以外）、通報は同じ人・同じ対象で1件、他人の写真は取り下げられない',
  '一覧・詳細は公開中だけで auth の id と保存キーを返さない、非表示の写真は配信キーが出ない',
  '重複のまとめで写真・手がかりが移り、まとめた元には追加できず、詳細は転送先を返す',
  '正式IDへの移行は写真1枚ごとに visit＋photo、撮影位置なし、再実行で増えない、別の正式ID・まとめ済みは拒否、非表示は移らない',
  '運営の操作はログに残り、anon / authenticated は provisional_ops を呼べない',
];

try {
  execFileSync(
    'supabase',
    ['db', 'query', '--local', '--file', SQL_FILE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error('verify-provisional: 失敗\n');
  console.error(detail || error.message);
  console.error(
    '\nローカルスタックが動いていない場合は `supabase start` を先に実行すること。' +
    '\nマイグレーション未適用なら `supabase db reset` で作り直す。'
  );
  process.exit(1);
}

console.log('verify-provisional: 全項目合格');
for (const check of CHECKS) console.log(`  ✓ ${check}`);
