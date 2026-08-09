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
 * 検査するのは Supabase 系のみ。ストレージ側は向き先の運用が別なので対象外。
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.resolve(__dirname, '..', '.env.local');

// 本番にしか存在せず、ローカル開発では一切必要ない資格情報。
// CLI が ~/.supabase/access-token を読むため、env に置く理由がない。
const FORBIDDEN_KEYS = new Set(['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']);

// ローカルスタックが配る固定キーの発行者。これ以外の JWT は本番のもの。
const LOCAL_JWT_ISSUER = 'supabase-demo';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function parseEnv(text) {
  const env = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env.set(key, value);
  }
  return env;
}

/** JWT の payload だけを読む。署名は見ないので秘密は復元しない。 */
function jwtIssuer(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );
    return typeof payload.iss === 'string' ? payload.iss : null;
  } catch {
    return null;
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
    console.log('check-supabase-target: .env.local が無いので検査をスキップ');
    return;
  }

  const env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  const declared = env.get('SUPABASE_ENV') ?? '(未設定)';
  const url = env.get('NEXT_PUBLIC_SUPABASE_URL') ?? '(未設定)';
  const host = hostOf(url);
  const errors = [];

  for (const key of FORBIDDEN_KEYS) {
    if (env.has(key)) {
      errors.push(
        `${key} が .env.local にある。これは本番に届く資格情報で、ローカル開発には不要。` +
          ' 削除すること（Supabase CLI は ~/.supabase/access-token を読む）'
      );
    }
  }

  for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const token = env.get(key);
    if (!token) continue;
    const issuer = jwtIssuer(token);
    if (issuer && issuer !== LOCAL_JWT_ISSUER) {
      errors.push(
        `${key} の発行者が "${issuer}" でローカルスタックのものではない。` +
          ' 本番キーを .env.local に置かないこと'
      );
    }
  }

  // 宣言と実際の向き先がずれていたら、どちらが正か分からない状態なので落とす。
  if (declared === 'local' && host && !LOCAL_HOSTS.has(host)) {
    errors.push(
      `SUPABASE_ENV=local だが NEXT_PUBLIC_SUPABASE_URL が ${host} を指している`
    );
  }

  console.log(`check-supabase-target: SUPABASE_ENV=${declared} / URL=${url}`);

  if (errors.length > 0) {
    console.error('\n本番権限が .env.local に混入している:\n');
    for (const message of errors) console.error(`  - ${message}`);
    console.error('');
    process.exit(1);
  }

  console.log('check-supabase-target: 本番権限の混入なし');
}

main();
