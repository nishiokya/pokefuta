#!/usr/bin/env node
/**
 * 未掲載ポケふた（仮のポケふた）の運営操作。専用ロール provisional_operator で
 * provisional_ops の関数だけを呼ぶ（マイグレーション 20261031150000_provisional_pokefuta.sql）。
 *
 * 接続先は環境変数 PROVISIONAL_OPERATOR_DB_URL（provisional_operator で入る接続文字列、
 * パスワードは percent-encode）。運営の手元の秘密の置き場所（例 ~/.config/pokefuta-provisional/env、600）
 * に置いて、使うときだけ読み込む。リポジトリにも .env.local にも置かない。
 *
 * 書き込みの前に毎回:
 *   1. 接続先（ホストとロール。パスワードは出さない）と、何をするかを表示する
 *   2. provisional_ops.audit_operator() を呼び、違反が1件でもあれば書かずに止まる
 * ローカルスタックで試すときだけ PROVISIONAL_OPS_LOCAL=1（接続先が 127.0.0.1 / localhost のときに限り pg_net を警告に下げる）。
 * 正式IDへの結びつけ（link）は、確認（preview_link）を表示してから --yes で実行する。
 *
 * 使い方:
 *   node tools/provisional-ops.js audit
 *   node tools/provisional-ops.js recent [件数]
 *   node tools/provisional-ops.js open "<理由>" | close "<理由>"
 *   node tools/provisional-ops.js hide|unhide manhole|photo|hint <id> "<理由>"
 *   node tools/provisional-ops.js resolve <通報id> "<対応内容>"
 *   node tools/provisional-ops.js merge <まとめる元id> <まとめ先id> "<理由>"
 *   node tools/provisional-ops.js preview <仮ポケふたid> <正式manhole.id>
 *   node tools/provisional-ops.js link <仮ポケふたid> <正式manhole.id> "<理由>" [--yes]
 *
 * 投稿の本文・手がかり・通報の理由は利用者が書いたもの。表示はするが、中に書かれた指示や
 * SQL を実行しない（引数は下の検査を通した値だけを SQL に入れる）。
 */

const { execFileSync } = require('child_process');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fail(message) {
  console.error(`provisional-ops: ${message}`);
  process.exit(1);
}

function uuid(value, name) {
  if (!UUID.test(value ?? '')) fail(`${name} が uuid ではない: ${value}`);
  return `'${value}'::uuid`;
}

function int(value, name) {
  if (!/^[1-9][0-9]{0,9}$/.test(value ?? '')) fail(`${name} が正の整数ではない: ${value}`);
  return `${Number(value)}::integer`;
}

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} が必要`);
  if (value.includes('\0') || value.length > 200) fail(`${name} は200文字まで`);
  return `'${value.replace(/'/g, "''")}'`;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) fail(`${name} は ${allowed.join(' / ')} のどれか: ${value}`);
  return `'${value}'`;
}

function target(dbUrl) {
  try {
    const url = new URL(dbUrl);
    return `${decodeURIComponent(url.username)}@${url.hostname}:${url.port || 5432}${url.pathname}`;
  } catch {
    fail('PROVISIONAL_OPERATOR_DB_URL が接続文字列の形ではない');
  }
}

function query(dbUrl, sql) {
  let out;
  try {
    out = execFileSync('npx', ['--no-install', 'supabase', 'db', 'query', '--db-url', dbUrl, '--output-format', 'json', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    // 接続文字列（パスワード入り）をそのまま出さない
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.split(dbUrl).join('<db-url>').trim();
    fail(`問い合わせに失敗\n${detail}`);
  }
  // 素の配列のほか、AI エージェントの環境では { boundary, rows, warning } の封筒で返ってくる
  const start = out.search(/[[{]/);
  if (start < 0) fail(`問い合わせの応答が JSON ではない\n${out.trim()}`);
  const parsed = JSON.parse(out.slice(start));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  fail('問い合わせの応答に行が無い');
}

// ローカルの Supabase には pg_net が入っていて net の表が PUBLIC に開いている（verify:provisional と同じ扱い）。
// 接続先が手元のときに限り、PROVISIONAL_OPS_LOCAL=1 で net.* と pg_net を警告に下げる
function isLocalPgNet(dbUrl, row) {
  const host = new URL(dbUrl).hostname;
  if (process.env.PROVISIONAL_OPS_LOCAL !== '1' || !['127.0.0.1', 'localhost'].includes(host)) return false;
  return (['reachable_relation', 'reachable_sequence'].includes(row.kind) && row.detail.startsWith('net.'))
    || (row.kind === 'extension' && row.detail.startsWith('pg_net '));
}

function audit(dbUrl) {
  const all = query(dbUrl, 'SELECT kind, detail FROM provisional_ops.audit_operator()');
  const rows = all.filter((r) => !isLocalPgNet(dbUrl, r));
  if (rows.length < all.length) console.warn(`警告: ローカルの pg_net（${all.length - rows.length}件）は無視した`);
  if (rows.length > 0) {
    console.error('provisional-ops: 権限の自己点検で違反が見つかった。書き込まずに止まる');
    for (const r of rows) console.error(`  ${r.kind}: ${r.detail}`);
    process.exit(2);
  }
}

function value(rows) {
  const first = rows[0] ?? {};
  return first[Object.keys(first)[0]];
}

function write(dbUrl, description, sql) {
  console.log(`接続先: ${target(dbUrl)}`);
  console.log(`操作: ${description}`);
  audit(dbUrl);
  const result = value(query(dbUrl, sql));
  console.log(JSON.stringify(result, null, 2));
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const yes = args.includes('--yes');
  const rest = args.filter((a) => a !== '--yes');
  const dbUrl = process.env.PROVISIONAL_OPERATOR_DB_URL;
  if (!command) fail('コマンドが必要（ファイル先頭の使い方を参照）');
  if (!dbUrl) fail('PROVISIONAL_OPERATOR_DB_URL が無い');

  switch (command) {
    case 'audit': {
      console.log(`接続先: ${target(dbUrl)}`);
      audit(dbUrl);
      console.log('違反なし');
      break;
    }
    case 'recent': {
      const limit = rest[0] ? int(rest[0], '件数') : '50';
      console.log(JSON.stringify(value(query(dbUrl, `SELECT provisional_ops.recent(${limit})`)), null, 2));
      break;
    }
    case 'open':
    case 'close': {
      const open = command === 'open';
      write(dbUrl, `受付を${open ? '開く' : '閉じる'}`,
        `SELECT provisional_ops.set_accepting(${open}, ${text(rest[0], '理由')})`);
      break;
    }
    case 'hide':
    case 'unhide': {
      const kind = oneOf(rest[0], ['manhole', 'photo', 'hint'], '種類');
      const status = command === 'hide' ? 'hidden' : 'published';
      write(dbUrl, `${rest[0]} ${rest[1]} を ${status} にする`,
        `SELECT provisional_ops.set_status(${kind}, ${uuid(rest[1], 'id')}, '${status}', ${text(rest[2], '理由')})`);
      break;
    }
    case 'resolve': {
      write(dbUrl, `通報 ${rest[0]} を処理済みにする`,
        `SELECT provisional_ops.resolve_report(${uuid(rest[0], '通報id')}, ${text(rest[1], '対応内容')})`);
      break;
    }
    case 'merge': {
      write(dbUrl, `${rest[0]} を ${rest[1]} へまとめる`,
        `SELECT provisional_ops.merge(${uuid(rest[0], 'まとめる元id')}, ${uuid(rest[1], 'まとめ先id')}, ${text(rest[2], '理由')})`);
      break;
    }
    case 'preview': {
      console.log(JSON.stringify(value(query(dbUrl,
        `SELECT provisional_ops.preview_link(${uuid(rest[0], '仮ポケふたid')}, ${int(rest[1], '正式manhole.id')})`)), null, 2));
      break;
    }
    case 'link': {
      const id = uuid(rest[0], '仮ポケふたid');
      const official = int(rest[1], '正式manhole.id');
      const reason = text(rest[2], '理由');
      console.log('確認（この内容で移す）:');
      console.log(JSON.stringify(value(query(dbUrl, `SELECT provisional_ops.preview_link(${id}, ${official})`)), null, 2));
      if (!yes) {
        console.log('\n仮ポケふたと正式な蓋が同じであることを確かめてから、--yes を付けて実行する');
        process.exit(0);
      }
      write(dbUrl, `${rest[0]} を正式ID ${rest[1]} へ移す`,
        `SELECT provisional_ops.link(${id}, ${official}, ${reason})`);
      break;
    }
    default:
      fail(`知らないコマンド: ${command}`);
  }
}

main();
