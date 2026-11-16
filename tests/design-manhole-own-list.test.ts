import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  OWN_DESIGN_MANHOLE_STATUS_LABEL,
  needsSignedPhotoUrl,
  toOwnDesignManhole,
  type OwnDesignManholeRow,
} from '../src/lib/own-design-manholes';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const migration = read('../supabase/migrations/20261116120000_own_design_manholes.sql');
const route = read('../src/app/api/design-manholes/mine/route.ts');

// コメントを除いた本体（列名の検査でコメントの文言に引っかからないように）
const body = migration.replace(/^--.*$/gm, '');

test('自分の投稿一覧: 本人の行だけを返す', () => {
  assert.match(body, /d\.created_by = auth\.uid\(\)/);
  assert.match(body, /v\.user_id = auth\.uid\(\)/);
  // 移した先の訪問は hidden の行だけ引く
  assert.match(body, /WHERE d\.status = 'hidden'\s+AND p\.storage_key = d\.storage_key/);
  assert.match(body, /ORDER BY d\.created_at DESC\s+LIMIT 500/);
});

test('自分の投稿一覧: search_path は pg_temp を最後に置き、PUBLIC と anon から外す', () => {
  assert.match(body, /SET search_path TO public, pg_temp/);
  assert.match(body, /get_own_design_manholes\(\) FROM PUBLIC/);
  assert.match(body, /get_own_design_manholes\(\) FROM anon/);
  assert.match(body, /get_own_design_manholes\(\) TO authenticated, service_role/);
  assert.doesNotMatch(body, /TO anon/);
});

test('自分の投稿一覧: created_by・exif・緯度経度を返さない', () => {
  const returns = body.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/);
  assert.ok(returns, 'RETURNS TABLE が見つからない');
  assert.doesNotMatch(returns![1], /created_by|exif|latitude|longitude/);
  const select = body.match(/SELECT (d\.id[\s\S]*?)\s+FROM public\.design_manhole/);
  assert.ok(select, '本体の SELECT が見つからない');
  assert.doesNotMatch(select![1], /created_by|exif|latitude|longitude/);
});

const row = (over: Partial<OwnDesignManholeRow>): OwnDesignManholeRow => ({
  id: 'id-1',
  title: '題名',
  description: 'ひとこと',
  status: 'published',
  storage_key: 'photos/design/original/2026/11/x.jpg',
  created_at: '2026-11-01T00:00:00Z',
  moved_manhole_id: null,
  ...over,
});

test('変換: published は詳細ページと公開の写真ルート', () => {
  const out = toOwnDesignManhole(row({}));
  assert.equal(out?.status, 'published');
  assert.equal(out?.href, '/design-manholes/id-1');
  assert.equal(out?.photo_url, '/api/design-manholes/id-1/photo?size=small');
  assert.equal(OWN_DESIGN_MANHOLE_STATUS_LABEL.published, null);
  assert.equal(needsSignedPhotoUrl(row({})), false);
});

test('変換: needs_review はリンクなし・署名URL・確認待ち', () => {
  const r = row({ status: 'needs_review' });
  assert.equal(needsSignedPhotoUrl(r), true);
  const out = toOwnDesignManhole(r, 'https://signed.example/a');
  assert.equal(out?.status, 'needs_review');
  assert.equal(out?.href, null);
  assert.equal(out?.photo_url, 'https://signed.example/a');
  assert.equal(OWN_DESIGN_MANHOLE_STATUS_LABEL.needs_review, '確認待ち');
  assert.equal(toOwnDesignManhole(r), null, '署名URLが無ければ行を落とす');
});

test('変換: 移した hidden は公式のポケふたのページ・署名URL', () => {
  const out = toOwnDesignManhole(row({ status: 'hidden', moved_manhole_id: 493 }), 'https://signed.example/b');
  assert.equal(out?.status, 'moved');
  assert.equal(out?.href, '/manhole/493');
  assert.equal(out?.photo_url, 'https://signed.example/b');
  assert.equal(OWN_DESIGN_MANHOLE_STATUS_LABEL.moved, 'ポケふたの記録へ移しました');
  assert.equal(toOwnDesignManhole(row({ status: 'hidden' }), 'https://signed.example/b'), null);
});

test('変換: storage_key は表示用に出ない', () => {
  for (const r of [row({}), row({ status: 'needs_review' }), row({ status: 'hidden', moved_manhole_id: 1 })]) {
    const out = toOwnDesignManhole(r, 'https://signed.example/c');
    assert.ok(out);
    assert.equal('storage_key' in out!, false);
    assert.equal('moved_manhole_id' in out!, false);
    assert.doesNotMatch(JSON.stringify(out), /photos\/design\/original/);
  }
});

test('自分の投稿一覧 API: 応答は private, no-store で、共有キャッシュ・CORS を付けない', () => {
  assert.match(route, /'Cache-Control': 'private, no-store'/);
  assert.doesNotMatch(route, /Access-Control-Allow-Origin/);
  assert.doesNotMatch(route, /s-maxage/);
  // exists() が投げても全体を落とさない（try の中で呼ぶ）
  assert.match(route, /try \{\s+if \(await storage\.exists\?\.\(smallKey\)\)/);
  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(route, /export const fetchCache = 'force-no-store'/);
  // 401・500 を含め、NextResponse.json はすべて headers を付ける
  const calls = route.match(/NextResponse\.json\(/g) ?? [];
  const withHeaders = route.match(/headers: PRIVATE_HEADERS/g) ?? [];
  assert.equal(withHeaders.length, calls.length);
});
