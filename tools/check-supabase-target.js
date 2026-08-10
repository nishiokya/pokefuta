#!/usr/bin/env node
/**
 * `.env.local` に本番権限の資格情報が混ざっていないか検査する。
 *
 * このファイルは「ローカル用の env」として扱われ、`set -a; . ./.env.local` の
 * ように丸ごと読み込まれる。そのとき本番に届く資格情報が1つでも入っていると、
 * **ローカル作業のつもりのシェルが本番権限を持つ**。変数名は他と同列に並ぶので
 * 見た目では区別がつかない。
 *
 * 実際に 2026-08-09、`SUPABASE_ACCESS_TOKEN`（Management API のフルアクセス）が
 * `.env.local` に同居していた。コードからは1箇所も参照されておらず、
 * Supabase CLI は `~/.supabase/access-token` を読むので不要な複製だった。
 * ローカルの Supabase キーが `iss: supabase-demo` の無害なデモキーだったため
 * 実害は出なかったが、それは設計ではなく偶然。
 *
 * ## fail closed
 *
 * この検査は**分からなければ落とす**。判定できない値・解釈できない行・欠けた宣言を
 * pass 側へ倒すと、「検査を通った」という誤った安心だけが残る。素性の分からない値を
 * 許すくらいなら、書いた本人に説明させる方が安全。
 *
 * 検査するのは Supabase 系のみ。ストレージ側は向き先の運用が別なので対象外。
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.resolve(__dirname, '..', '.env.local');

// 本番にしか存在せず、ローカル開発では一切必要ない資格情報。
// CLI が ~/.supabase/access-token を読むため、env に置く理由がない。
const FORBIDDEN_KEYS = new Set(['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']);

// 値の形だけで本番と分かるもの。名前を変えて置かれても拾う。
const FORBIDDEN_VALUE_PATTERNS = [
  { pattern: /^sbp_/, label: 'Management API のアクセストークン（sbp_）' },
  { pattern: /^sb_secret_/, label: '新形式のシークレットキー（sb_secret_）' },
];

// ローカルスタックが配る固定キーの発行者。これ以外の JWT は本番のもの。
const LOCAL_JWT_ISSUER = 'supabase-demo';

// ローカルスタックの新形式キー。`supabase status` が配るもので本番には届かない。
const LOCAL_PUBLISHABLE_PREFIX = 'sb_publishable_';

const SUPABASE_KEY_VARS = [
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
];

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * `.env` を読む。**シェルが宣言として解釈する行**を対象にしたいので、
 * `export FOO=` を剥がし、引用符を外す。解釈できない行は捨てずに返して
 * 呼び出し側で落とす（`export SUPABASE_ACCESS_TOKEN=` をキー名ごと
 * `export SUPABASE_ACCESS_TOKEN` と誤読して素通りさせたのが元の穴）。
 */
function parseEnv(text) {
  const env = new Map();
  const unparsable = [];
  // BOM はキー名の先頭に紛れ込むと一致しなくなるので落とす。
  const body = text.replace(/^﻿/, '');

  body.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) {
      unparsable.push({ lineNumber: index + 1, text: line });
      return;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    // 引用で閉じていない値は、複数行や継続行の可能性があり解釈が分かれる。
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || !value.endsWith(quote)) {
        unparsable.push({ lineNumber: index + 1, text: line });
        return;
      }
      value = value.slice(1, -1);
    }

    env.set(key, value);
  });

  return { env, unparsable };
}

/**
 * JWT の payload だけを読む。署名は見ないので秘密は復元しない。
 * 戻り値は { ok: true, issuer } / { ok: false }（＝JWTとして読めない）。
 */
function jwtIssuer(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false };
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );
    if (typeof payload.iss !== 'string') return { ok: false };
    return { ok: true, issuer: payload.iss };
  } catch {
    return { ok: false };
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    // CI など .env.local を置かない環境では検査対象が無い。ここは pass でよい
    // （混入させる先が存在しないため）。
    console.log('check-supabase-target: .env.local が無いので検査をスキップ');
    return;
  }

  const { env, unparsable } = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  const errors = [];

  for (const { lineNumber, text } of unparsable) {
    errors.push(
      `${lineNumber} 行目を宣言として解釈できない: ${text}\n` +
        '      シェルは読めてこの検査が読めない行があると、そこに本番資格情報を置ける'
    );
  }

  for (const key of FORBIDDEN_KEYS) {
    if (env.has(key)) {
      errors.push(
        `${key} が .env.local にある。これは本番に届く資格情報で、ローカル開発には不要。` +
          ' 削除すること（Supabase CLI は ~/.supabase/access-token を読む）'
      );
    }
  }

  for (const [key, value] of env) {
    for (const { pattern, label } of FORBIDDEN_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        errors.push(`${key} の値が ${label} の形をしている。本番資格情報を置かないこと`);
      }
    }
  }

  for (const key of SUPABASE_KEY_VARS) {
    const token = env.get(key);
    if (token === undefined || token === '') continue;
    if (token.startsWith(LOCAL_PUBLISHABLE_PREFIX)) continue;

    const result = jwtIssuer(token);
    if (!result.ok) {
      errors.push(
        `${key} をローカルの資格情報だと確認できない（JWT として読めず、` +
          `${LOCAL_PUBLISHABLE_PREFIX} でもない）。素性の分からない値は許可しない`
      );
      continue;
    }
    if (result.issuer !== LOCAL_JWT_ISSUER) {
      errors.push(
        `${key} の発行者が "${result.issuer}" でローカルスタックのものではない。` +
          ' 本番キーを .env.local に置かないこと'
      );
    }
  }

  // 向き先の宣言と実際がずれていたら、どちらが正か分からないので落とす。
  const declared = env.get('SUPABASE_ENV');
  if (declared !== 'local') {
    errors.push(
      `SUPABASE_ENV が "${declared ?? '未設定'}" になっている。` +
        ' .env.local はローカルスタック専用なので、必ず local と宣言すること'
    );
  }

  const url = env.get('NEXT_PUBLIC_SUPABASE_URL');
  const host = url ? hostOf(url) : null;
  if (!url) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL が無い。向き先を確認できない');
  } else if (!host) {
    errors.push(`NEXT_PUBLIC_SUPABASE_URL を URL として解釈できない: ${url}`);
  } else if (!LOCAL_HOSTS.has(host)) {
    errors.push(`NEXT_PUBLIC_SUPABASE_URL が ${host} を指している（ローカルではない）`);
  }

  console.log(
    `check-supabase-target: SUPABASE_ENV=${declared ?? '未設定'} / URL=${url ?? '未設定'}`
  );

  if (errors.length > 0) {
    console.error('\n.env.local がローカル専用である保証を確認できない:\n');
    for (const message of errors) console.error(`  - ${message}`);
    console.error('');
    process.exit(1);
  }

  console.log('check-supabase-target: 本番権限の混入なし');
}

main();
