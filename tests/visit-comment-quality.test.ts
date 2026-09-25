import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMeaningfulVisitComment,
  normalizeVisitComment,
  collectVisitComments,
} from '../src/lib/visit-comment-quality';
import { rankManholePhotos } from '../src/lib/manhole-photo-ranking';
import { appendVisitTipSuggestion } from '../src/lib/visit-tip';

test('本番で見つかったゴミは落とす', () => {
  for (const junk of ['15', '9', '  39 ', 'ニャンコ', '四日市', 'cool', '投稿テスト', 'あああああ', 'wwwwww', '!!!!!!', '😂😂😂😂😂', '', null, undefined]) {
    assert.equal(isMeaningfulVisitComment(junk), false, String(junk));
  }
});

test('短くても中身のあるひとことは残す', () => {
  for (const ok of ['遠かったぁ', 'サンド花火', '伊勢駅にありました', 'a bit rusty… niche location', 'まだなかった😂', '公園とポケふた\r\nほっこりするにゃあ']) {
    assert.equal(isMeaningfulVisitComment(ok), true, ok);
  }
});

test('長い文の中の「テスト」は落とさない', () => {
  assert.equal(isMeaningfulVisitComment('テスト期間の帰りに寄りました。駅から近いです'), true);
});

test('改行は残し、CRLF と連続空白は畳む', () => {
  assert.equal(normalizeVisitComment('  公園と　 ポケふた\r\nほっこり\n\n\n\nにゃあ '), '公園と ポケふた\nほっこり\n\nにゃあ');
});

const photo = (id: string, visitId: string, comment: string | null, createdAt = '2026-08-01T00:00:00.000Z') => ({
  id,
  created_at: createdAt,
  visit: { id: visitId, comment, created_at: createdAt, shot_at: null, user_id: 'u', is_public: true },
});

test('ひとこと一覧は書かれた新しい順・ゴミ除外・訪問単位で1件', () => {
  const ranked = collectVisitComments([
    photo('a', 'v1', '15', '2026-09-01T00:00:00.000Z'),
    photo('b', 'v2', '駅前にありました', '2026-08-01T00:00:00.000Z'),
    photo('c', 'v3', '道の駅の入り口にありました', '2026-08-20T00:00:00.000Z'),
    photo('d', 'v3', '道の駅の入り口にありました', '2026-08-20T00:00:00.000Z'),
    photo('e', 'v4', null, '2026-09-10T00:00:00.000Z'),
  ]);
  assert.deepEqual(
    ranked.map(({ photo: p, index, postedAt }) => [p.id, index, postedAt]),
    [['c', 2, '2026-08-20T00:00:00.000Z'], ['b', 1, '2026-08-01T00:00:00.000Z']]
  );
});

test('写真の並びはひとこと付きが先、ゴミコメントは無しと同じ', () => {
  const ranked = rankManholePhotos([
    photo('newest-no-comment', 'v1', null, '2026-08-10T00:00:00.000Z'),
    photo('junk', 'v2', '15', '2026-08-09T00:00:00.000Z'),
    photo('commented', 'v3', '駅前にありました', '2026-08-01T00:00:00.000Z'),
  ]);
  assert.deepEqual(ranked.map(({ id }) => id), ['commented', 'newest-no-comment', 'junk']);
});

test('次に来る人への候補は二重に足さず、文の区切りを補う', () => {
  assert.equal(appendVisitTipSuggestion('', '駐車場あり'), '駐車場あり');
  assert.equal(appendVisitTipSuggestion('駐車場あり', '駅から歩ける'), '駐車場あり。駅から歩ける');
  assert.equal(appendVisitTipSuggestion('公園の中です。', '駐車場あり'), '公園の中です。駐車場あり');
  assert.equal(appendVisitTipSuggestion('駐車場あり', '駐車場あり'), '駐車場あり');
});
